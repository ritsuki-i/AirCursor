// src/core/engine.js
//
// Framework-agnostic orchestrator.
//
// The important structural change from the previous version: inference and
// actuation are separated. `onResults` only reads landmarks and updates state;
// it never scrolls, never dispatches events, never touches layout. All of that
// happens on a requestAnimationFrame loop.
//
// MediaPipe inference runs at whatever rate the CPU allows, and that rate
// fluctuates. Driving scrolling and physics from it made the motion uneven no
// matter how the numbers were tuned. Driving them from rAF makes the output
// smooth even when tracking stutters.

import { Hands, HAND_CONNECTIONS } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

import { OneEuroPoint } from './oneEuro.js';
import { TwoHandRecognizer } from './gestures.js';
import { VirtualPointer, hitTest } from './pointer.js';
import { GrabScroller } from './scroller.js';
import { RegionSelector } from './region.js';
import {
  LM,
  midpoint,
  landmarkToViewport,
  DEFAULT_ACTIVE_REGION,
} from './landmarks.js';

export const DEFAULT_OPTIONS = {
  dominantHand: 'right',
  /** Enables the off-hand fist modifier (hold to turn a click into a right click). */
  modifierEnabled: true,
  /**
   * Enables two-hand region selection. On by default: it costs nothing until
   * both hands pinch at once, which no other gesture asks for.
   */
  regionSelectEnabled: true,
  /** Where MediaPipe fetches its wasm/model assets from. */
  mediapipeBasePath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands',
  /**
   * The sub-rectangle of the camera frame that maps to the whole viewport, so
   * the screen edges are reachable while the hand is still fully in frame.
   * See DEFAULT_ACTIVE_REGION. Pass `null` for the plain full-frame mapping.
   */
  activeRegion: { ...DEFAULT_ACTIVE_REGION },
  /**
   * 640x480 rather than 720p. Inference cost scales with the frame the model is
   * handed, and it is the single largest thing on the main thread; the landmark
   * model works from a crop resampled to a couple of hundred pixels either way,
   * so the extra pixels bought nothing and cost most of the frame budget.
   */
  camera: { width: 640, height: 480 },
  /**
   * Upper bound on inference rate, in frames per second.
   *
   * MediaPipe's Camera helper offers a frame on every animation frame and the
   * inference runs on the main thread, so left alone the tracker takes every
   * millisecond it can get and everything else on the page — the pointer's own
   * rAF loop included — is left with whatever is spare. Since the pointer is
   * filtered and interpolated between inferences anyway, tracking faster than
   * this buys nothing visible and costs the smoothness of everything else.
   *
   * 30 is also the rate the gesture thresholds were fitted at, so the median
   * windows and hold times keep the timings they were measured with. Lower it
   * on weak hardware; 0 removes the cap.
   */
  inferenceFps: 30,
  hands: {
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  },
  /**
   * One Euro parameters for the pointer. minCutoff sets steadiness at rest,
   * beta sets responsiveness when moving. These defaults were chosen so a
   * resting hand produces a visually still cursor.
   */
  filter: { minCutoff: 1.2, beta: 0.012, dCutoff: 1.0 },
  scroll: {},
  region: {},
  thresholds: {},
  pointer: {},
};

/**
 * Leave roughly thirty percent of wall-clock time for paint and input when a cap is
 * enabled. `inferenceFps` is only an upper bound: on a slower machine the
 * engine must leave actual time for paint and input instead of chasing a rate
 * that the machine cannot sustain.
 */
const MAX_INFERENCE_DUTY = 0.7;
/** Visual catch-up time between landmark samples, in seconds. */
const POINTER_FOLLOW_S = 0.02;

export class AirCursorEngine {
  /**
   * @param {object} config
   * @param {HTMLVideoElement} config.video
   * @param {HTMLCanvasElement} [config.previewCanvas] optional landmark preview
   * @param {HTMLElement} [config.cursorElement] moved to follow the hand
   * @param {(state: object) => void} [config.onState] called once per frame
   * @param {(region: object) => void} [config.onRegionSelect] two-hand selection confirmed
   * @param {(error: Error) => void} [config.onError]
   */
  constructor(config) {
    const {
      video, previewCanvas, cursorElement, onState, onRegionSelect, onError, ...rest
    } = config;

    this.video = video;
    this.previewCanvas = previewCanvas || null;
    this.cursorElement = cursorElement || null;
    this.onState = onState || null;
    this.onRegionSelect = onRegionSelect || null;
    this.onError = onError || null;

    // Drop keys whose value is `undefined` before they reach the defaults.
    //
    // Spreading the caller's options straight over DEFAULT_OPTIONS lets an
    // explicit `undefined` win, and "not passed" is exactly how a React
    // component's unset prop arrives: `mediapipeBasePath` destructured without
    // a default is `undefined`, forwarded as `undefined`, and it blanked the
    // CDN address — so MediaPipe asked the application's own server for
    // `/undefined/hands_solution_packed_assets_loader.js`, got index.html back,
    // and threw `Unexpected token '<'` once per frame forever.
    //
    // The object-valued options each carried their own `|| {}` guard against
    // this, which is why only the one plain string was affected. Doing it here
    // covers every option at once, including the ones added later.
    const provided = {};
    for (const key of Object.keys(rest)) {
      if (rest[key] !== undefined) provided[key] = rest[key];
    }

    this.options = {
      ...DEFAULT_OPTIONS,
      ...provided,
      camera: { ...DEFAULT_OPTIONS.camera, ...(provided.camera || {}) },
      hands: { ...DEFAULT_OPTIONS.hands, ...(provided.hands || {}) },
      filter: { ...DEFAULT_OPTIONS.filter, ...(provided.filter || {}) },
      region: { ...DEFAULT_OPTIONS.region, ...(provided.region || {}) },
      // `null` is a meaningful value here (full-frame mapping), so it must not
      // be spread over the default.
      activeRegion: provided.activeRegion === null
        ? null
        : { ...DEFAULT_ACTIVE_REGION, ...(provided.activeRegion || {}) },
    };

    this.recognizer = new TwoHandRecognizer({
      dominantHand: this.options.dominantHand,
      thresholds: this.options.thresholds,
    });
    this.pointerFilter = new OneEuroPoint(this.options.filter);
    this.pointer = new VirtualPointer(this.options.pointer);
    this.scroller = new GrabScroller(this.options.scroll);
    this.region = new RegionSelector(this.options.region);

    /** Latest result from the inference callback, consumed by the rAF loop. */
    this.latest = null;

    this.running = false;
    this.rafId = null;
    this.lastFrameTime = null;
    this.hands = null;
    this.cameraInstance = null;

    this.wasPressed = false;
    this.wasGrabbing = false;
    this.contextMenuFired = false;
    /** When both fists first became stable during a region selection. */
    this.regionCancelStartedAt = null;

    /**
     * Inferences completed since construction. Exposed so an application can
     * show the tracking rate next to its own frame rate: the two share a thread
     * and trade against each other, and only seeing them apart says which of
     * the two a stutter is coming from.
     */
    this.inferenceCount = 0;
    /** Smoothed end-to-end cost of one MediaPipe inference, in milliseconds. */
    this.inferenceDurationMs = 0;

    /**
     * MediaPipe produces positions at its own cadence. Keep the filtered sample
     * separate from the position rendered between samples so the cursor does
     * not move in inference-sized steps.
     */
    this.visualPoint = null;

    this._onResults = this._onResults.bind(this);
    this._loop = this._loop.bind(this);
  }

  // ------------------------------------------------------------------ start

  async start() {
    if (this.running) return;
    this.running = true;

    const { mediapipeBasePath, hands: handsOptions, camera } = this.options;

    this.hands = new Hands({
      locateFile: (file) => `${mediapipeBasePath}/${file}`,
    });
    this.hands.setOptions(handsOptions);
    this.hands.onResults(this._onResults);

    // Two gates on the inference, both about giving the rest of the page a
    // turn on the main thread:
    //
    //  - `inFlight` refuses to queue a second frame behind one still being
    //    processed. Without it a slow inference is followed immediately by the
    //    frames that piled up behind it, and the tracker runs permanently one
    //    burst behind the hand.
    //  - `minIntervalMs` holds the rate down to `inferenceFps`. The frames it
    //    skips are the page's only opportunity to render anything, since a
    //    frame handed to MediaPipe is a frame nothing else gets.
    const minIntervalMs = this.options.inferenceFps > 0
      ? 1000 / this.options.inferenceFps
      : 0;
    let nextInferenceAt = 0;
    let inFlight = false;

    this.cameraInstance = new Camera(this.video, {
      onFrame: async () => {
        if (!this.running || !this.hands || inFlight) return;
        const now = performance.now();
        if (now < nextInferenceAt) return;
        const startedAt = now;
        inFlight = true;
        try {
          await this.hands.send({ image: this.video });
        } catch (error) {
          if (this.onError) this.onError(error);
        } finally {
          const completedAt = performance.now();
          const duration = Math.max(0, completedAt - startedAt);
          this.inferenceDurationMs = this.inferenceDurationMs === 0
            ? duration
            : this.inferenceDurationMs + (duration - this.inferenceDurationMs) * 0.15;

          // A fixed 30 fps cap is not enough when one inference itself takes
          // 25-40 ms: the next frame is sent as soon as the previous one ends,
          // leaving no budget for WebGL or layout. Back off until inference is
          // at most seventy percent of elapsed time. `inferenceFps: 0` deliberately keeps
          // its documented uncapped behaviour.
          const adaptiveIntervalMs = minIntervalMs > 0
            ? this.inferenceDurationMs / MAX_INFERENCE_DUTY
            : 0;
          nextInferenceAt = startedAt + Math.max(minIntervalMs, adaptiveIntervalMs);
          inFlight = false;
        }
      },
      width: camera.width,
      height: camera.height,
    });

    await this.cameraInstance.start();
    this.lastFrameTime = performance.now();
    this.rafId = requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.cameraInstance) {
      this.cameraInstance.stop();
      this.cameraInstance = null;
    }
    if (this.hands) {
      this.hands.close();
      this.hands = null;
    }
    this.pointer.clear();
    this.scroller.cancel();
    this.region.reset();
    this.recognizer.reset();
    this.pointerFilter.reset();
    this.latest = null;
    this.visualPoint = null;
    this.regionCancelStartedAt = null;
    if (this.cursorElement) this.cursorElement.style.opacity = '0';
  }

  /**
   * Abandon a two-hand selection in progress. Returns false when there was no
   * live rectangle to cancel.
   */
  cancelRegionSelection() {
    return this.region.cancel();
  }

  // -------------------------------------------------------------- inference

  _onResults(results) {
    const now = performance.now();
    this.inferenceCount++;
    const state = this.recognizer.update(
      results.multiHandLandmarks,
      results.multiHandedness,
      now
    );
    const landmarks = state.dominantLandmarks;
    let point = null;
    if (state.dominant && landmarks) {
      const raw = landmarkToViewport(
        midpoint(landmarks[LM.INDEX_TIP], landmarks[LM.MIDDLE_TIP]),
        window.innerWidth,
        window.innerHeight,
        this.options.activeRegion
      );
      // Filter each camera sample exactly once. Filtering the same value again
      // on every render frame makes it converge, stop, and then jump when the
      // next inference arrives.
      point = this.pointerFilter.filter(raw, now / 1000);
    } else {
      this.pointerFilter.reset();
      this.visualPoint = null;
    }
    this.latest = { state, timestamp: now, point };
    this._drawPreview(results);
  }

  _drawPreview(results) {
    const canvas = this.previewCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this._drawActiveRegion(ctx, canvas.width, canvas.height);
    if (results.multiHandLandmarks) {
      for (const landmarks of results.multiHandLandmarks) {
        drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#22d3ee', lineWidth: 3 });
        drawLandmarks(ctx, landmarks, { color: '#f8fafc', lineWidth: 1, radius: 2.5 });
      }
    }
    ctx.restore();
  }

  /**
   * Outline the part of the frame that maps to the screen.
   *
   * The mapping is otherwise invisible, and an invisible mapping is the wrong
   * kind of surprise: a hand that is plainly on camera but outside this
   * rectangle produces a pointer pinned to the edge of the screen, and nothing
   * on screen would say why. Drawn in landmark space, so the preview's own
   * mirroring applies to it along with the video.
   */
  _drawActiveRegion(ctx, width, height) {
    const region = this.options.activeRegion;
    if (!region) return;
    const left = region.left * width;
    const top = region.top * height;
    const w = (1 - region.left - region.right) * width;
    const h = (1 - region.top - region.bottom) * height;
    if (w <= 0 || h <= 0) return;

    // The excluded margin is dimmed as well as outlined. The line alone reads
    // as decoration; the darkened border reads as "outside".
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.rect(left, top, w, h);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#ff2d46';
    ctx.lineWidth = Math.max(1, Math.round(Math.min(width, height) * 0.012));
    ctx.strokeRect(left, top, w, h);
    ctx.restore();
  }

  // ------------------------------------------------------------------- loop

  _loop() {
    if (!this.running) return;
    const now = performance.now();
    const dt = (now - (this.lastFrameTime ?? now)) / 1000;
    this.lastFrameTime = now;

    this._step(now, dt);
    // A synthetic click may invoke the consumer's Stop button inside _step.
    if (this.running) {
      this.scroller.tick(dt);
      this.rafId = requestAnimationFrame(this._loop);
    }
  }

  _step(nowMs, dt) {
    const sessionWasRunning = this.running;
    const latest = this.latest;
    const hand = latest && latest.state.dominant;
    const landmarks = latest && latest.state.dominantLandmarks;
    const targetPoint = latest && latest.point;

    // Ahead of the early return, so a frozen rectangle still times out while
    // the hands are out of frame rather than waiting there for their return.
    let region = this.options.regionSelectEnabled
      ? this.region.update(
          landmarks || null,
          (latest && latest.state.offLandmarks) || null,
          nowMs
        )
      : null;
    const bothFists = !!(
      region &&
      (region.phase === 'framing' || region.phase === 'pending') &&
      hand && hand.fist &&
      latest && latest.state.off && latest.state.off.fist
    );
    // Use inference time, not rAF time. Re-reading one stale fist result for
    // 450ms must not masquerade as 450ms of observed holding when tracking is
    // temporarily slow.
    const fistObservedAt = latest && Number.isFinite(latest.timestamp)
      ? latest.timestamp
      : nowMs;
    if (bothFists) {
      if (this.regionCancelStartedAt === null) this.regionCancelStartedAt = fistObservedAt;
      if (fistObservedAt - this.regionCancelStartedAt >= this.region.o.cancelFistHoldMs) {
        if (this.region.cancel()) {
          // Surface the cancellation for one rendered frame so the application
          // can remove its rectangle and explain what the two fists did.
          region = {
            phase: 'cooldown',
            rect: null,
            awaitingConfirm: false,
            halfConfirmed: false,
            committed: null,
            rejected: 'cancelled',
          };
        }
        this.regionCancelStartedAt = null;
      }
    } else {
      this.regionCancelStartedAt = null;
    }
    if (region && region.committed) this._commitRegion(region.committed);
    const regionActive = !!(region && region.phase !== 'idle');
    const twoHandsVisible = !!(latest && latest.state.offLandmarks);
    // A dominant thumb/index pinch is also the grab-scroll pose. Reserve that
    // pose as soon as a second hand is being tracked, before the region
    // selector's filtering/hold window has had time to enter `framing`.
    const scrollSuppressed = regionActive ||
      (this.options.regionSelectEnabled && twoHandsVisible);

    if (!hand || !landmarks || !targetPoint) {
      if (this.wasPressed) {
        this.pointer.cancel();
        this.wasPressed = false;
      }
      if (this.wasGrabbing) {
        this.scroller.end();
        this.wasGrabbing = false;
      }
      this.pointer.clear();
      this.visualPoint = null;
      this._renderCursor(null, 'idle');
      this._emit(null);
      return;
    }

    const width = window.innerWidth;
    const height = window.innerHeight;

    if (!this.visualPoint) this.visualPoint = { ...targetPoint };
    const visualDt = Math.max(0, Math.min(dt, 0.05));
    const follow = 1 - Math.exp(-visualDt / POINTER_FOLLOW_S);
    this.visualPoint.x += (targetPoint.x - this.visualPoint.x) * follow;
    this.visualPoint.y += (targetPoint.y - this.visualPoint.y) * follow;
    const point = this.visualPoint;
    const x = Math.max(0, Math.min(width - 1, point.x));
    const y = Math.max(0, Math.min(height - 1, point.y));


    const modifier = this.options.modifierEnabled && latest.state.modifier;

    this.pointer.move(x, y);
    if (sessionWasRunning && !this.running) return;

    // Framing needs both hands pinched, and a dominant-hand pinch on its own is
    // already the scroll gesture — so by the time the off hand joins, a scroll
    // has started. Cancel it rather than ending it: ending it would hand the
    // page the flick nobody meant to make. Clicking and scrolling stay
    // suppressed until the selection resolves, because the confirming tap is
    // itself a grab pose and would otherwise scroll the page out from under the
    // rectangle being confirmed.
    //
    // "Resolves" includes the selector's cooldown phase, which outlasts the
    // commit by however long the hands take to open. Without that the frame a
    // selection is confirmed on is already back to `idle` while both hands are
    // still pinched, so the gesture that captured the region went straight on
    // to scroll the page.
    if (scrollSuppressed) {
      if (regionActive && this.wasPressed) {
        this.pointer.cancel();
        this.wasPressed = false;
      }
      if (scrollSuppressed && this.wasGrabbing) {
        this.scroller.cancel();
        this.wasGrabbing = false;
      }
      if (regionActive) this.contextMenuFired = false;
    }

    // ---- press / release -------------------------------------------------
    if (regionActive) {
      // handled above
    } else if (hand.selecting && !this.wasPressed) {
      if (modifier) {
        if (!this.contextMenuFired) {
          this.pointer.contextMenu();
          this.contextMenuFired = true;
        }
      } else {
        this.pointer.press(0);
        this.wasPressed = true;
      }
    } else if (!hand.selecting) {
      if (this.wasPressed) {
        this.pointer.release();
        this.wasPressed = false;
      }
      this.contextMenuFired = false;
    }

    if (sessionWasRunning && !this.running) return;

    // ---- grab scroll -----------------------------------------------------
    if (scrollSuppressed) {
      // handled above
    } else if (hand.grabbing && !this.wasGrabbing) {
      this.scroller.begin({ x, y }, hitTest(x, y));
      this.wasGrabbing = true;
    } else if (hand.grabbing) {
      this.scroller.update({ x, y });
    } else if (this.wasGrabbing) {
      this.scroller.end();
      this.wasGrabbing = false;
    }

    const mode = regionActive
      ? 'region'
      : hand.grabbing && !scrollSuppressed
        ? 'grab'
        : this.wasPressed || this.contextMenuFired
          ? 'press'
          : hand.aiming
            ? 'aim'
            : 'idle';

    this._renderCursor({ x, y }, mode, modifier);
    this._emit({
      x,
      y,
      mode,
      modifier,
      hand,
      hands: latest.state.offLandmarks ? 2 : 1,
      region: region && (region.phase !== 'idle' || region.rejected)
        ? {
            phase: region.phase,
            awaitingConfirm: region.awaitingConfirm,
            halfConfirmed: region.halfConfirmed,
            // Set for one frame when a selection is thrown away, naming why.
            // Passed on rather than absorbed here: a rectangle that silently
            // vanishes looks exactly like a gesture that was never seen, and
            // only the application can say so on screen.
            rejected: region.rejected,
            rect: this._regionToViewport(region.rect),
          }
        : null,
    });
  }

  /**
   * Landmark space to viewport pixels. The x axis is mirrored on the way, so
   * the two corners swap sides — normalise after converting, never before.
   *
   * @param {{left:number,top:number,width:number,height:number}|null} rect
   */
  _regionToViewport(rect) {
    if (!rect) return null;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const region = this.options.activeRegion;
    const a = landmarkToViewport({ x: rect.left, y: rect.top }, width, height, region);
    const b = landmarkToViewport(
      { x: rect.left + rect.width, y: rect.top + rect.height },
      width,
      height,
      region
    );
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const w = Math.abs(a.x - b.x);
    const h = Math.abs(a.y - b.y);
    return { left, top, width: w, height: h, right: left + w, bottom: top + h };
  }

  /**
   * A selection was confirmed. The library deliberately stops here: it reports
   * the rectangle and does nothing with it. What a region is *for* — a
   * screenshot, a copy, a zoom — differs per application, and the capture APIs
   * a screenshot would need are gated behind a real user gesture that a
   * synthetic pointer cannot supply anyway.
   */
  _commitRegion(rect) {
    const detail = this._regionToViewport(rect);
    if (!detail) return;
    if (this.onRegionSelect) this.onRegionSelect(detail);
    if (typeof document !== 'undefined') {
      document.dispatchEvent(
        new CustomEvent('aircursor:regionselect', { detail, bubbles: true })
      );
    }
  }

  _renderCursor(point, mode, modifier = false) {
    const el = this.cursorElement;
    if (!el) return;
    if (!point) {
      el.style.opacity = '0';
      return;
    }
    el.style.opacity = '1';
    el.style.transform = `translate3d(${point.x}px, ${point.y}px, 0) translate(-50%, -50%)`;
    el.dataset.mode = mode;
    el.dataset.modifier = modifier ? 'on' : 'off';
  }

  _emit(payload) {
    if (this.onState) this.onState(payload);
  }
}
