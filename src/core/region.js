// src/core/region.js
//
// Two-hand region selection.
//
// Both hands pinch to frame a rectangle between their two pinch points, open to
// freeze it, then tap once with both hands to commit it. Nothing else in the
// library needs two hands doing the same thing at once, which is what makes
// this safe to add: a single pinch is already the scroll gesture, but a
// *simultaneous* pinch means nothing, so the framing pose cannot be arrived at
// by accident.
//
// Why a separate confirming tap, rather than committing on release:
// committing on release is fewer motions, but it also means the gesture fires
// the instant a hand relaxes — and the rectangle is at its least accurate right
// then, because opening a pinch drags the fingertips. Freezing on release and
// asking for one more tap costs a beat and buys a rectangle the user has
// actually seen, plus a way to abandon one by simply waiting.
//
// Why the confirming tap is matched on its *onset* within a coincidence window
// rather than on both hands reading pinched on one frame: a pinch is only
// believed after a median filter and a hold window have both been served, which
// is around 200ms at 30fps, and it stops being believed the moment the fingers
// part. Two hands never satisfy that at the same instant — by the time the
// slower hand's pinch is believed, the faster hand has usually already let go —
// so asking for a single frame where both read pinched drops most honest
// confirming taps. Remembering *when* each hand last began a pinch and asking
// that the two beginnings fall inside one window is the same gesture with the
// frame-perfect timing requirement taken out of it.
//
// Why not a double pinch, which is the obvious way to say "confirm": the same
// reason the library does not offer a double click. Two believed pinches do not
// fit inside any window short enough to feel like one gesture, and doing it on
// both hands multiplies the failure rate rather than adding to it.
//
// Everything here works in MediaPipe's normalized landmark space (0..1 across
// the camera frame). The caller converts to viewport coordinates, because that
// conversion mirrors x and this layer should not have to know about that.

import { MedianFilter } from './median.js';
import { SchmittTrigger } from './gestures.js';
import { LM, normDistance, midpoint } from './landmarks.js';

export const DEFAULT_REGION_OPTIONS = {
  // Thumb/index pinch, in hand units. These are the fitted grab numbers: the
  // pose is the same one, only the hand count differs.
  pinchEnter: 0.204,
  pinchExit: 0.287,
  // Longer than the usual 60ms hold. Both hands have to satisfy this at the
  // same time, and starting a selection that was not asked for is more
  // disruptive than starting a scroll that was not asked for.
  holdMs: 100,
  // Corner-to-corner distance, in frame widths, below which a framed rectangle
  // is discarded instead of offered for confirmation. This is a floor against
  // two hands that happened to pinch near each other, not a usability minimum —
  // it is measured on the diagonal so that a deliberately thin region (a line
  // of text, a table row) still qualifies.
  minDiagonal: 0.12,
  // How far apart the two confirming taps may begin and still count as one
  // gesture. Two hands asked to do the same thing "at the same time" land
  // roughly a fifth of a second apart, and the pinch each one makes is only
  // believed after its own median and hold window — so the two believed pinches
  // can begin several frames apart even when the hands moved together. This is
  // wide enough to absorb that and still far short of two separate deliberate
  // taps.
  tapWindowMs: 700,
  // How long a frozen rectangle waits for its confirming tap. The pointer's
  // click and scroll are suppressed for this whole window, so it is kept short
  // enough that abandoning a selection by waiting is not an annoying pause.
  //
  // It used to be 3000ms, measured from the freeze. That is less time than it
  // sounds: the freeze happens the instant a pinch opens, and the window has to
  // cover reading the on-screen hint, opening both hands and then making the
  // tap — after which the tap still needs its own median and hold window before
  // it is believed. Running out mid-confirm was silent, and it dropped the user
  // straight back into a live pinch that the scroller then picked up.
  confirmMs: 6000,
  medianWindow: 3,
  // How many frames behind the hands the rectangle sits.
  //
  // Opening a pinch drags the fingertips, and the pinch is not *reported* open
  // until the median and the hold window have both been served — so the last
  // frames of framing are precisely the ones contaminated by the release. Taking
  // the rectangle from a few frames back steps over them. The live rectangle
  // trails by the same amount so that what is frozen is what was on screen;
  // at 30fps this is about 100ms, which reads as steadiness rather than lag.
  settleFrames: 3,
};

/** @returns {{left:number,top:number,width:number,height:number}|null} */
function rectOf(corners) {
  if (!corners || !corners.a || !corners.b) return null;
  const left = Math.min(corners.a.x, corners.b.x);
  const top = Math.min(corners.a.y, corners.b.y);
  return {
    left,
    top,
    width: Math.abs(corners.a.x - corners.b.x),
    height: Math.abs(corners.a.y - corners.b.y),
  };
}

const diagonal = (rect) => (rect ? Math.hypot(rect.width, rect.height) : 0);

/**
 * Phases:
 *   idle     – nothing selected, waiting for both hands to pinch
 *   framing  – both pinched, rectangle follows the two pinch points
 *   pending  – rectangle frozen, waiting to be confirmed or to time out
 *   cooldown – resolved, waiting for both hands to open before anything restarts
 *
 * The cooldown phase exists because every way out of `pending` leaves at least
 * one hand mid-pinch. Returning straight to `idle` from there hands that live
 * pinch to whatever runs next: the confirming tap immediately framed a second
 * region, and an abandoned selection turned into a page scroll nobody asked
 * for. Callers already suppress the pointer while the phase is not `idle`, so
 * holding the resolved state for the few frames it takes to open a hand closes
 * both of those without any new co-ordination between the two layers.
 */
export class RegionSelector {
  constructor(options = {}) {
    const o = { ...DEFAULT_REGION_OPTIONS, ...options };
    this.o = o;

    const trigger = () =>
      new SchmittTrigger({
        enter: o.pinchEnter, exit: o.pinchExit, invert: true, holdMs: o.holdMs,
      });
    this.pinch = { a: trigger(), b: trigger() };
    this.smooth = { a: new MedianFilter(o.medianWindow), b: new MedianFilter(o.medianWindow) };

    this.phase = 'idle';
    /** Recent corner pairs, oldest first. The head is what gets used. */
    this.history = [];
    this.frozen = null;
    /** Per hand: has it opened since the rectangle froze. */
    this.opened = { a: false, b: false };
    /** Per hand: when its most recent pinch began, 0 if none is outstanding. */
    this.tap = { a: 0, b: 0 };
    /** Previous frame's pinch state, so a pinch's *start* can be detected. */
    this.pinched = { a: false, b: false };
    this.deadline = 0;
  }

  /**
   * @param {Array<object>|null} handA one hand's landmarks (the dominant one)
   * @param {Array<object>|null} handB the other hand's landmarks
   * @param {number} nowMs
   */
  update(handA, handB, nowMs) {
    const a = this._hand('a', handA, nowMs);
    const b = this._hand('b', handB, nowMs);
    // A tap is a pinch that *starts*, not one that is held. Reading the edge
    // rather than the level is what lets the two hands tap a beat apart.
    const startedA = a.pinched && !this.pinched.a;
    const startedB = b.pinched && !this.pinched.b;
    this.pinched.a = a.pinched;
    this.pinched.b = b.pinched;

    const both = a.pinched && b.pinched;
    const neither = !a.pinched && !b.pinched;

    let committed = null;
    let rejected = null;

    if (this.phase === 'idle') {
      if (both) {
        this.phase = 'framing';
        this._record(a.point, b.point);
      }
    } else if (this.phase === 'framing') {
      if (both) {
        this._record(a.point, b.point);
      } else {
        // Either pinch opening ends the framing, and so does either hand
        // leaving the frame — a hand that cannot be seen cannot be holding a
        // corner, and the last rectangle it did hold is the honest one to keep.
        const rect = rectOf(this.history[0]);
        if (rect && diagonal(rect) >= this.o.minDiagonal) {
          this._enterPending(rect, nowMs);
        } else {
          // Report the discard rather than swallowing it. From the user's side
          // the framing rectangle simply vanishes, which is indistinguishable
          // from the gesture never having been recognised at all.
          rejected = 'tooSmall';
          this._enterCooldown();
        }
      }
    } else if (this.phase === 'pending') {
      // A hand's own tap cannot be the pinch it is still letting go of: reading
      // the onset already requires that hand to have been open on the previous
      // frame, so this needs no separate latch. `opened` is tracked only so
      // callers can say which half of the gesture is still outstanding.
      if (!a.pinched) this.opened.a = true;
      if (!b.pinched) this.opened.b = true;

      if (startedA) this.tap.a = nowMs;
      if (startedB) this.tap.b = nowMs;
      // Forget a tap the other hand did not join in time, so a stale one cannot
      // pair up with a tap made much later.
      if (this.tap.a && nowMs - this.tap.a > this.o.tapWindowMs) this.tap.a = 0;
      if (this.tap.b && nowMs - this.tap.b > this.o.tapWindowMs) this.tap.b = 0;

      if (this.tap.a && this.tap.b) {
        committed = this.frozen;
        this._enterCooldown();
      } else if (this.tap.a || this.tap.b || a.settling || b.settling) {
        // A tap is under way: either one hand has tapped and the other is still
        // expected, or a hand's fingers are closing and its pinch has not been
        // believed yet. Hold the window open long enough for it to finish,
        // however little time was left — expiring in the middle of a gesture
        // the user is still making is the one moment where giving up is
        // certainly wrong, and a tap started just before the window closes is
        // not believed until ~200ms after it.
        //
        // A pinch merely being *held* deliberately does not count: it neither
        // settles nor taps again, so the extension it earns runs out and the
        // deadline still arrives. That is what keeps this bounded.
        const grace = nowMs + this.o.tapWindowMs;
        if (grace > this.deadline) this.deadline = grace;
      }

      if (this.phase === 'pending' && nowMs >= this.deadline) {
        rejected = 'timeout';
        this._enterCooldown();
      }
    } else if (this.phase === 'cooldown') {
      if (neither) this._clear();
    }

    return {
      phase: this.phase,
      /** Live while framing, frozen while pending, null otherwise. */
      rect: this.phase === 'framing' ? rectOf(this.history[0]) : this.frozen,
      /** True once both hands have opened and a confirming tap will count. */
      awaitingConfirm: this.phase === 'pending' && this.opened.a && this.opened.b,
      /** True once one hand has tapped and the other is still expected. */
      halfConfirmed: this.phase === 'pending' && !!(this.tap.a || this.tap.b),
      /** Set on exactly the frame the selection is confirmed, null otherwise. */
      committed,
      /**
       * Set on exactly the frame a selection is thrown away, naming why:
       * 'tooSmall' for a rectangle under `minDiagonal`, 'timeout' for one that
       * was never confirmed. Null on every other frame.
       */
      rejected,
    };
  }

  _hand(key, landmarks, nowMs) {
    if (!landmarks) {
      this.pinch[key].reset();
      this.smooth[key].reset();
      return { pinched: false, settling: false, point: null };
    }
    const distance = this.smooth[key].filter(
      normDistance(landmarks, LM.THUMB_TIP, LM.INDEX_TIP)
    );
    const pinched = this.pinch[key].update(distance, nowMs);
    return {
      pinched,
      /** Fingers closing, hold window not yet served: a tap on its way. */
      settling: this.pinch[key].settling,
      // The corner is where the fingers meet, not the fingertip: it stays put
      // while the pinch closes, so the rectangle does not creep as the hand
      // settles into the pose.
      point: midpoint(landmarks[LM.THUMB_TIP], landmarks[LM.INDEX_TIP]),
    };
  }

  /** Push a corner pair, keeping the buffer `settleFrames` deep. */
  _record(a, b) {
    this.history.push({ a, b });
    while (this.history.length > this.o.settleFrames) this.history.shift();
  }

  _enterPending(rect, nowMs) {
    this.phase = 'pending';
    this.history.length = 0;
    this.frozen = rect;
    this.opened = { a: false, b: false };
    this.tap = { a: 0, b: 0 };
    this.deadline = nowMs + this.o.confirmMs;
  }

  _enterCooldown() {
    this.phase = 'cooldown';
    this.history.length = 0;
    this.frozen = null;
    this.opened = { a: false, b: false };
    this.tap = { a: 0, b: 0 };
    this.deadline = 0;
  }

  _clear() {
    this._enterCooldown();
    this.phase = 'idle';
  }

  reset() {
    this._clear();
    this.pinched = { a: false, b: false };
    this.pinch.a.reset();
    this.pinch.b.reset();
    this.smooth.a.reset();
    this.smooth.b.reset();
  }
}
