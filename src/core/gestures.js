// src/core/gestures.js
//
// Gesture recognition.
//
// Two rules keep this stable where the previous single-threshold if/else was not:
//
//  1. Every threshold is in hand units (see landmarks.js), so it does not drift
//     with camera distance or window size.
//  2. Every boolean uses a Schmitt trigger: it takes a tighter value to turn on
//     than to turn off. A hand hovering exactly at one threshold used to
//     chatter on and off every frame; with separate enter/exit thresholds it
//     cannot.
//
// Additionally, a gesture must hold for a short debounce window before it is
// reported. Most false positives happen *between* poses, while the hand is
// travelling from one shape to another, and those intermediate frames do not
// survive the hold requirement.

import { MedianFilter } from './median.js';
import {
  LM,
  normDistance,
  neighbourGap,
  meanFingerExtension,
  userHandFrom,
} from './landmarks.js';

/**
 * Boolean with separate enter/exit thresholds plus a hold time.
 * `invert: true` means "true when the value is BELOW the threshold", which is
 * what pinch distances need.
 */
export class SchmittTrigger {
  /**
   * @param {object} options
   * @param {number} options.enter    threshold to switch on
   * @param {number} options.exit     threshold to switch off (must be looser than enter)
   * @param {boolean} [options.invert=false] true when value < threshold
   * @param {number} [options.holdMs=0] how long the raw condition must persist
   */
  constructor({ enter, exit, invert = false, holdMs = 0 }) {
    this.enter = enter;
    this.exit = exit;
    this.invert = invert;
    this.holdMs = holdMs;
    this.state = false;
    this.pendingSince = null;
  }

  /**
   * @param {number} value
   * @param {number} nowMs
   * @returns {boolean} debounced state
   */
  update(value, nowMs) {
    const raw = this.state
      ? (this.invert ? value < this.exit : value > this.exit)
      : (this.invert ? value < this.enter : value > this.enter);

    if (raw === this.state) {
      this.pendingSince = null;
      return this.state;
    }

    // Turning off is immediate: a dropped gesture should never stick. Turning
    // on waits for the hold window so transitions do not fire it.
    if (this.state === true) {
      this.state = false;
      this.pendingSince = null;
      return this.state;
    }

    if (this.pendingSince === null) this.pendingSince = nowMs;
    if (nowMs - this.pendingSince >= this.holdMs) {
      this.state = true;
      this.pendingSince = null;
    }
    return this.state;
  }

  /**
   * True while the raw condition is being held but the hold window has not yet
   * been served: a gesture that is arriving rather than one that has arrived.
   *
   * Exposed because a deadline that has to survive a gesture in progress cannot
   * be judged on the debounced state alone. The hold window plus the median are
   * around 200ms at 30fps, so a pose made just before a window closes is not
   * believed until well after it — and every one of those was being thrown away
   * while the user was still making it.
   */
  get settling() {
    return !this.state && this.pendingSince !== null;
  }

  reset() {
    this.state = false;
    this.pendingSince = null;
  }
}

/**
 * Fitted, not chosen. Every number here except `grabSeparation` and `holdMs`
 * comes from 740 labelled frames put through docs/tools/labeler.html, the last
 * 34 of which are deliberate near misses: clicks made without fully closing the
 * thumb, and pointer poses with the thumb only half open. Those are the frames
 * that decide where the line between the two actually belongs, and no amount of
 * clearly-separated data can stand in for them.
 *
 * Each decision is fitted on the frames that are correctly labelled *for that
 * decision*, which is not always all of them. The first pointer recording had
 * the thumb already at click distance in a fifth of its frames, so those frames
 * are a truthful record of the pointer pose but a corrupt negative set for the
 * click decision — fitting the click threshold against the later, clean
 * recording alone takes it from an AUC of 0.922 to 1.0.
 *
 * Distances are in hand units. Pinch distances are compared with `invert`, so
 * for those `enter` is the tighter (smaller) number.
 */
export const DEFAULT_THRESHOLDS = {
  // thumb tip <-> index tip: the "grab" pose that scrolls. AUC 0.907 — the
  // weakest of the five, and the next one worth a better measurement.
  grabEnter: 0.204,
  grabExit: 0.287,
  // index tip <-> middle tip separation that distinguishes grab from click.
  // This sits inside the aim trigger's hysteresis band on purpose: when a
  // user changes directly from pointer to grab, the old aim state must not
  // remain latched and swallow the scroll gesture.
  grabSeparation: 0.34,
  // The "aim" pose, decided on how much wider the neighbouring finger gaps are
  // than the index/middle pair (see neighbourGap). Larger means more of a
  // pointer pose, so this pair is not inverted. AUC 0.954.
  //
  // Opened slightly from where the fit put it, after reading the trade-off it
  // sits on: from here to 0.20 costs six points of pointer recall and buys back
  // no accidental firing at all, and below here the accidental firing climbs
  // quickly. It starts 87% of intended pointer poses and fires on 2% of resting
  // hands.
  aimEnter: 0.180,
  aimExit: 0.058,
  // Cap on the index/middle tip separation while aiming: a V sign is not a
  // pointer. AUC 0.989 over 139 pointer frames against 46 recorded V signs.
  //
  // The gap score above cannot make this decision, and a V sign is the pose
  // that shows why. It measures how much wider the *neighbouring* finger gaps
  // are than the index/middle pair, so curling the ring and pinky raises it
  // however far the two pointing fingers are spread — and a V sign curls
  // exactly those two fingers. Measured on the recording: with no cap at all,
  // 87% of V signs engage the pointer. Not an edge case; the pose is simply
  // indistinguishable from a pointer to that score.
  //
  // Asking additionally that the two fingers actually be *together* closes it
  // completely: none of the 46 fire. It costs nothing on the pointer side —
  // every frame of the clean pointer recording still starts it, and 96% of
  // labelled clicks do, because a hand about to click holds those two fingers
  // together anyway.
  //
  // These replace a first pass fitted against `grab` as a stand-in negative,
  // for want of any recorded V signs at the time. That gave 0.342/0.524 and
  // still let 9% of real V signs through — the stand-in shares the spread
  // fingers but not the curled ones, so it sat the line in the wrong place.
  // Worth remembering the next time a negative class is unavailable: a
  // near-enough pose is not near enough.
  aimSeparationEnter: 0.238,
  aimSeparationExit: 0.388,
  // thumb tip <-> index tip while aiming: the "select" pose that clicks.
  // AUC 1.0, including against pointer poses held with the thumb half open.
  // Starts 99% of intended clicks and fires on none of the near misses.
  //
  // The exit line used to sit at 0.84, which made letting go of a click need
  // most of the travel back to an open hand. That came from sizing the
  // hysteresis band as a fraction of the distance between the two poses — but
  // how far apart two poses are is no reason for the band between them to be
  // wide. It is now sized by how much the pinch itself wanders while it is held,
  // which is what a band has to clear and nothing more.
  selectEnter: 0.303,
  selectExit: 0.384,
  // mean finger extension below which a hand counts as a fist. AUC 0.996.
  fistEnter: 1.033,
  fistExit: 1.216,
  // how long a pose must hold before it is reported
  holdMs: 60,
  // Clicking gets its own, longer hold. Every other gesture is reversible —
  // the pointer moving or the page scrolling costs nothing if it was not meant
  // — but a click activates something, so it is the one worth being slow about.
  //
  // It also has the least room. The whole distance between a click and a
  // pointer pose is 0.14 hand units, while a single mistracked frame moves the
  // thumb by up to 0.45. No threshold survives that; only requiring the pose to
  // persist does. At about 30fps this is four frames, on top of the median.
  // Measured cost: a click lands 8 frames (~260ms) after the pose is made, and
  // a thumb dipping to click distance for up to 5 frames is ignored entirely.
  selectHoldMs: 140,
  // Window of the running median applied to each measurement before it is
  // thresholded. 3 removes a single bad frame, which is the whole problem; 1
  // turns the filtering off.
  medianWindow: 3,
};

/**
 * Recognizes the gestures of a single hand.
 *
 * Emitted state:
 *   grabbing  – thumb+index pinched, fingers apart: drag the page to scroll
 *   aiming    – index+middle together: pointer is live
 *   selecting – aiming plus thumb: pointer is pressed (click / drag)
 *   fist      – all fingers curled: used as a modifier by the off hand
 */
export class HandGestureRecognizer {
  constructor(thresholds = {}) {
    const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.t = t;

    this.grab = new SchmittTrigger({
      enter: t.grabEnter, exit: t.grabExit, invert: true, holdMs: t.holdMs,
    });
    // Not inverted: a larger gap score means more of a pointer pose.
    this.aim = new SchmittTrigger({
      enter: t.aimEnter, exit: t.aimExit, holdMs: t.holdMs,
    });
    // Inverted: the pointer pose is the one where the two tips are *close*.
    this.together = new SchmittTrigger({
      enter: t.aimSeparationEnter,
      exit: t.aimSeparationExit,
      invert: true,
      holdMs: t.holdMs,
    });
    this.select = new SchmittTrigger({
      enter: t.selectEnter,
      exit: t.selectExit,
      invert: true,
      holdMs: t.selectHoldMs != null ? t.selectHoldMs : t.holdMs,
    });
    this.fist = new SchmittTrigger({
      enter: t.fistEnter, exit: t.fistExit, invert: true, holdMs: t.holdMs,
    });

    // Every measurement goes through a median before it is compared with
    // anything. Without this a lone mistracked frame lands the full width of
    // the gap between two gestures and fires the wrong one.
    this.smooth = {
      thumbIndex: new MedianFilter(t.medianWindow),
      indexMiddle: new MedianFilter(t.medianWindow),
      gapScore: new MedianFilter(t.medianWindow),
      extension: new MedianFilter(t.medianWindow),
    };
  }

  /**
   * @param {Array<{x:number,y:number,z:number}>} landmarks
   * @param {number} nowMs
   */
  update(landmarks, nowMs) {
    const thumbIndex = this.smooth.thumbIndex.filter(normDistance(landmarks, LM.THUMB_TIP, LM.INDEX_TIP));
    const indexMiddle = this.smooth.indexMiddle.filter(normDistance(landmarks, LM.INDEX_TIP, LM.MIDDLE_TIP));
    const gapScore = this.smooth.gapScore.filter(neighbourGap(landmarks));
    const extension = this.smooth.extension.filter(meanFingerExtension(landmarks));

    // One measurement, because on labelled poses it is the only one that works.
    // Testing the index/middle distance as well only reintroduced the failure it
    // was meant to prevent: on an open hand those two tips are close together
    // too, and alone that distance separates pointer from not-pointer with an
    // AUC of just 0.794.
    const aimCandidate = this.aim.update(gapScore, nowMs);
    // Both halves of the pointer pose are required: the two fingers held
    // together *relative to the others*, and held together at all. Spreading
    // them drops the pointer immediately, because a trigger only waits out its
    // hold window on the way on.
    const fingersTogether = this.together.update(indexMiddle, nowMs);
    const grabPinched = this.grab.update(thumbIndex, nowMs);
    // Use the current index/middle separation to resolve the overlap between
    // click and grab. Relying only on the latched `aim` trigger leaves the
    // previous pointer pose active until aimExit (0.42), so a perfectly valid
    // grab in that hysteresis band never reaches the scroller.
    const grabbing = grabPinched && indexMiddle > this.t.grabSeparation;
    const aiming = aimCandidate && fingersTogether && !grabbing;
    const selecting = aiming ? this.select.update(thumbIndex, nowMs) : this.select.update(Infinity, nowMs);
    const fist = this.fist.update(extension, nowMs);

    return {
      grabbing,
      aiming,
      selecting,
      fist,
      metrics: { thumbIndex, indexMiddle, gapScore, extension },
    };
  }

  reset() {
    for (const f of Object.values(this.smooth)) f.reset();
    this.grab.reset();
    this.aim.reset();
    this.together.reset();
    this.select.reset();
    this.fist.reset();
  }
}

/**
 * Tracks both hands and assigns roles.
 *
 * The dominant hand does continuous work (pointer, scroll). The off hand acts
 * as a modifier key. Splitting the two along MediaPipe's own handedness output
 * means the two gesture vocabularies never have to be told apart from each
 * other, which is where most cross-talk would otherwise come from.
 */
export class TwoHandRecognizer {
  /**
   * @param {object} [options]
   * @param {'left'|'right'} [options.dominantHand='right']
   * @param {object} [options.thresholds]
   */
  constructor({ dominantHand = 'right', thresholds } = {}) {
    this.dominantHand = dominantHand;
    this.dominant = new HandGestureRecognizer(thresholds);
    this.off = new HandGestureRecognizer(thresholds);
  }

  /**
   * @param {Array<Array<object>>} multiHandLandmarks
   * @param {Array<{label:string}>} [multiHandedness]
   * @param {number} nowMs
   */
  update(multiHandLandmarks, multiHandedness, nowMs) {
    let dominantLandmarks = null;
    let offLandmarks = null;

    if (multiHandLandmarks && multiHandLandmarks.length > 0) {
      for (let i = 0; i < multiHandLandmarks.length; i++) {
        const side = userHandFrom(multiHandedness && multiHandedness[i]);
        if (side === this.dominantHand) {
          dominantLandmarks = multiHandLandmarks[i];
        } else if (side === 'unknown') {
          // No handedness information: fall back to treating the first hand as
          // dominant so single-hand use keeps working.
          if (!dominantLandmarks) dominantLandmarks = multiHandLandmarks[i];
        } else {
          offLandmarks = multiHandLandmarks[i];
        }
      }
    }

    const dominantState = dominantLandmarks
      ? this.dominant.update(dominantLandmarks, nowMs)
      : (this.dominant.reset(), null);

    const offState = offLandmarks
      ? this.off.update(offLandmarks, nowMs)
      : (this.off.reset(), null);

    return {
      dominant: dominantState,
      dominantLandmarks,
      off: offState,
      offLandmarks,
      /** Off-hand fist acts like holding a modifier key. */
      modifier: !!(offState && offState.fist),
    };
  }

  reset() {
    this.dominant.reset();
    this.off.reset();
  }
}
