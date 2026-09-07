// test/region.test.mjs
//
// Two-hand region selection.
//
// The gesture is deliberately harder to trigger than any other in the library,
// because it is the only one that both hands take part in and the only one whose
// framing pose overlaps an existing gesture (a one-hand pinch is the scroll).
// Most of what is worth testing here is therefore what it refuses to do.

import test from 'node:test';
import assert from 'node:assert/strict';

import { RegionSelector, DEFAULT_REGION_OPTIONS } from '../dist/esm/core/region.js';

// A synthetic hand: 21 landmarks, wrist to middle-MCP fixed at 0.2 so one hand
// unit is 0.2 of the frame, with the thumb and index tips placed by hand.
function hand({ x, y, pinch }) {
  const lm = Array.from({ length: 21 }, () => ({ x, y, z: 0 }));
  lm[0] = { x, y: y + 0.2, z: 0 };   // wrist
  lm[9] = { x, y, z: 0 };            // middle MCP -> hand scale 0.2
  // Straddle the requested point so its midpoint — the rectangle corner — is
  // exactly (x, y) whatever the pinch distance.
  const half = (pinch * 0.2) / 2;
  lm[4] = { x: x - half, y, z: 0 };  // thumb tip
  lm[8] = { x: x + half, y, z: 0 };  // index tip
  return lm;
}

const CLOSED = 0.10;   // well inside pinchEnter 0.204
const OPEN = 0.60;     // well outside pinchExit 0.287

/** Feed the same pose for a while, at 30fps, and return the last state. */
function hold(sel, a, b, ms, clock) {
  let last = null;
  const end = clock.t + ms;
  while (clock.t < end) {
    clock.t += 33;
    last = sel.update(a, b, clock.t);
    if (last.committed) return last;   // stop on the frame it fires
  }
  return last;
}

const newClock = () => ({ t: 1000 });

const LEFT_CLOSED = () => hand({ x: 0.25, y: 0.30, pinch: CLOSED });
const RIGHT_CLOSED = () => hand({ x: 0.70, y: 0.75, pinch: CLOSED });
const LEFT_OPEN = () => hand({ x: 0.25, y: 0.30, pinch: OPEN });
const RIGHT_OPEN = () => hand({ x: 0.70, y: 0.75, pinch: OPEN });

/** The full gesture: frame, open, confirm. */
function fullGesture(sel, clock) {
  hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 400, clock);
  hold(sel, LEFT_OPEN(), RIGHT_OPEN(), 200, clock);
  return hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 400, clock);
}

test('both hands pinching frames a rectangle between the pinch points', () => {
  const sel = new RegionSelector();
  const clock = newClock();
  const state = hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 400, clock);

  assert.equal(state.phase, 'framing');
  assert.ok(Math.abs(state.rect.left - 0.25) < 1e-6);
  assert.ok(Math.abs(state.rect.top - 0.30) < 1e-6);
  assert.ok(Math.abs(state.rect.width - 0.45) < 1e-6);
  assert.ok(Math.abs(state.rect.height - 0.45) < 1e-6);
  assert.equal(state.committed, null);
});

test('one hand pinching alone does nothing', () => {
  // The failure that matters most: a one-hand pinch is already the scroll
  // gesture, and every ordinary scroll would start a selection if this broke.
  const sel = new RegionSelector();
  const clock = newClock();
  const state = hold(sel, LEFT_CLOSED(), RIGHT_OPEN(), 2000, clock);
  assert.equal(state.phase, 'idle');
  assert.equal(state.rect, null);
});

test('opening a pinch freezes the rectangle instead of committing it', () => {
  const sel = new RegionSelector();
  const clock = newClock();
  const framed = hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 400, clock);
  const frozen = hold(sel, LEFT_OPEN(), RIGHT_OPEN(), 200, clock);

  assert.equal(frozen.phase, 'pending');
  assert.equal(frozen.committed, null, 'releasing must not commit on its own');
  assert.deepEqual(frozen.rect, framed.rect, 'the frozen rectangle is the framed one');
  assert.equal(frozen.awaitingConfirm, true);
});

test('a frozen rectangle does not follow the hands', () => {
  const sel = new RegionSelector();
  const clock = newClock();
  const framed = hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 400, clock);
  const moved = hold(
    sel,
    hand({ x: 0.05, y: 0.05, pinch: OPEN }),
    hand({ x: 0.95, y: 0.95, pinch: OPEN }),
    300,
    clock
  );
  assert.deepEqual(moved.rect, framed.rect);
});

test('tapping both hands once more confirms it', () => {
  const sel = new RegionSelector();
  const clock = newClock();
  const done = fullGesture(sel, clock);

  assert.ok(done.committed, 'the second pinch must commit');
  assert.ok(Math.abs(done.committed.width - 0.45) < 1e-6);
  assert.equal(done.rect, null);
  // Not idle: the confirming tap leaves both hands pinched, and handing that
  // live pinch back to the rest of the library is what made a capture scroll
  // the page and frame a second region on the very next frame.
  assert.equal(done.phase, 'cooldown', 'the hands have to open before anything restarts');
  const opened = hold(sel, LEFT_OPEN(), RIGHT_OPEN(), 100, clock);
  assert.equal(opened.phase, 'idle');
});

test('the confirming taps do not have to overlap', () => {
  // The case the gesture actually failed on. A pinch is believed only after a
  // 3-frame median and a 100ms hold, and stops being believed the moment the
  // fingers part — so two hands tapping together are almost never *reported*
  // pinched on the same frame. Requiring one such frame dropped most honest
  // confirming taps. The overlap check makes sure this cannot pass by
  // accidentally satisfying the old rule.
  const sel = new RegionSelector();
  const clock = newClock();
  hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 400, clock);
  hold(sel, LEFT_OPEN(), RIGHT_OPEN(), 200, clock);

  let overlapped = false;
  const step = (a, b, ms) => {
    const end = clock.t + ms;
    let last = null;
    while (clock.t < end) {
      clock.t += 33;
      last = sel.update(a, b, clock.t);
      if (sel.pinched.a && sel.pinched.b) overlapped = true;
      if (last.committed) return last;
    }
    return last;
  };

  step(LEFT_CLOSED(), RIGHT_OPEN(), 300);   // one hand taps
  step(LEFT_OPEN(), RIGHT_OPEN(), 150);     // and lets go before the other starts
  const done = step(LEFT_OPEN(), RIGHT_CLOSED(), 300);

  assert.equal(overlapped, false, 'the two pinches were never simultaneous');
  assert.ok(done && done.committed, 'and the selection was still confirmed');
});

test('taps further apart than tapWindowMs are two gestures, not one', () => {
  const sel = new RegionSelector({ tapWindowMs: 300, confirmMs: 60000 });
  const clock = newClock();
  hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 400, clock);
  hold(sel, LEFT_OPEN(), RIGHT_OPEN(), 200, clock);
  hold(sel, LEFT_CLOSED(), RIGHT_OPEN(), 300, clock);
  const waited = hold(sel, LEFT_OPEN(), RIGHT_OPEN(), 1000, clock);
  assert.equal(waited.committed, null);
  const late = hold(sel, LEFT_OPEN(), RIGHT_CLOSED(), 300, clock);
  assert.equal(late.committed, null, 'the first tap must not still be waiting');
});

test('one hand having tapped is reported, so the page can ask for the other', () => {
  const sel = new RegionSelector();
  const clock = newClock();
  hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 400, clock);
  hold(sel, LEFT_OPEN(), RIGHT_OPEN(), 200, clock);
  const half = hold(sel, LEFT_CLOSED(), RIGHT_OPEN(), 300, clock);
  assert.equal(half.phase, 'pending');
  assert.ok(half.halfConfirmed);
  assert.equal(half.committed, null);
});

test('the phase stays non-idle until both hands open', () => {
  // Callers suppress clicking and scrolling for as long as the phase is not
  // idle, so this is the whole mechanism that stops a resolved selection from
  // leaking its still-live pinch into the scroller.
  const sel = new RegionSelector();
  const clock = newClock();
  assert.ok(fullGesture(sel, clock).committed);
  const oneOpen = hold(sel, LEFT_CLOSED(), RIGHT_OPEN(), 200, clock);
  assert.equal(oneOpen.phase, 'cooldown', 'one hand is still pinched');
  assert.equal(hold(sel, LEFT_OPEN(), RIGHT_OPEN(), 100, clock).phase, 'idle');
});

test('holding the confirming pinch does not frame a second region', () => {
  const sel = new RegionSelector();
  const clock = newClock();
  assert.ok(fullGesture(sel, clock).committed);
  const held = hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 1000, clock);
  assert.equal(held.phase, 'cooldown');
  assert.equal(held.rect, null, 'no new rectangle from the pinch that just captured');
});

test('the hand still pinched at the end of framing cannot confirm on its own', () => {
  // Without the arming rule this is one motion, not two: the off hand opens to
  // freeze the rectangle and closing it again immediately commits, so a hand
  // that merely wobbled through the pinch threshold would confirm a selection.
  const sel = new RegionSelector();
  const clock = newClock();
  hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 400, clock);
  const freeze = hold(sel, LEFT_CLOSED(), RIGHT_OPEN(), 200, clock);
  assert.equal(freeze.phase, 'pending');
  assert.equal(freeze.awaitingConfirm, false, 'not armed while a hand is still pinched');

  const reclose = hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 300, clock);
  assert.equal(reclose.committed, null, 'the off hand alone must not commit');
});

test('a rectangle too small to be meant is discarded, and says so', () => {
  const sel = new RegionSelector();
  const clock = newClock();
  const near = 0.04;   // diagonal ~0.057, under minDiagonal 0.12
  hold(sel, hand({ x: 0.50, y: 0.50, pinch: CLOSED }),
            hand({ x: 0.50 + near, y: 0.50 + near, pinch: CLOSED }), 400, clock);
  // Reported rather than swallowed: from the user's side a rectangle that
  // simply vanishes is indistinguishable from a gesture that was never seen.
  let reason = null;
  const end = clock.t + 200;
  let after = null;
  while (clock.t < end) {
    clock.t += 33;
    after = sel.update(hand({ x: 0.50, y: 0.50, pinch: OPEN }),
                       hand({ x: 0.54, y: 0.54, pinch: OPEN }), clock.t);
    if (after.rejected) reason = after.rejected;
  }
  assert.equal(reason, 'tooSmall');
  assert.equal(after.phase, 'idle');
  assert.equal(after.rect, null);
});

test('an unconfirmed rectangle times out, and says so', () => {
  const sel = new RegionSelector();
  const clock = newClock();
  hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 400, clock);
  const waiting = hold(sel, LEFT_OPEN(), RIGHT_OPEN(), DEFAULT_REGION_OPTIONS.confirmMs - 500, clock);
  assert.equal(waiting.phase, 'pending');

  let reason = null;
  const end = clock.t + 1000;
  let expired = null;
  while (clock.t < end) {
    clock.t += 33;
    expired = sel.update(LEFT_OPEN(), RIGHT_OPEN(), clock.t);
    if (expired.rejected) reason = expired.rejected;
  }
  assert.equal(reason, 'timeout');
  assert.equal(expired.phase, 'idle', 'waiting it out is how a selection is abandoned');
});

test('the confirm window does not expire while a tap is being made', () => {
  // A tap started just before the deadline is not believed until ~200ms after
  // it, so judging the deadline on the believed pinch alone threw away taps
  // the user was still in the middle of making.
  const sel = new RegionSelector({ confirmMs: 600, tapWindowMs: 700 });
  const clock = newClock();
  hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 400, clock);
  hold(sel, LEFT_OPEN(), RIGHT_OPEN(), 400, clock);   // most of the window gone
  const first = hold(sel, LEFT_CLOSED(), RIGHT_OPEN(), 300, clock);
  assert.equal(first.phase, 'pending', 'the window must have survived the first tap');
  hold(sel, LEFT_OPEN(), RIGHT_OPEN(), 100, clock);
  const done = hold(sel, LEFT_OPEN(), RIGHT_CLOSED(), 300, clock);
  assert.ok(done.committed, 'a gesture already in progress is allowed to finish');
});

test('a pinch held indefinitely still gives the pointer back', () => {
  // The other half of the rule above: extending the window has to stay
  // bounded, or a hand resting in a pinch would suppress clicking and
  // scrolling for as long as it stayed there.
  const sel = new RegionSelector({ confirmMs: 500, tapWindowMs: 300 });
  const clock = newClock();
  hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 400, clock);
  hold(sel, LEFT_OPEN(), RIGHT_OPEN(), 200, clock);
  let reason = null;
  const end = clock.t + 8000;
  while (clock.t < end) {
    clock.t += 33;
    const out = sel.update(LEFT_CLOSED(), RIGHT_OPEN(), clock.t);
    if (out.rejected) reason = out.rejected;
  }
  assert.equal(reason, 'timeout');
  assert.equal(sel.phase, 'cooldown', 'still pinched, so not yet idle');
});

test('the default coincidence window clears the pinch detector own lag', () => {
  // A regression guard on the numbers themselves. If the window were narrower
  // than the delay the detector adds, two perfectly made taps could never pair
  // up however well they were timed.
  const frame = 1000 / 30;
  const detectionLagMs =
    (DEFAULT_REGION_OPTIONS.medianWindow / 2 + 1) * frame + DEFAULT_REGION_OPTIONS.holdMs;
  assert.ok(
    DEFAULT_REGION_OPTIONS.tapWindowMs > detectionLagMs,
    `tapWindowMs ${DEFAULT_REGION_OPTIONS.tapWindowMs} must exceed the ~${Math.round(detectionLagMs)}ms detection lag`
  );
  assert.ok(DEFAULT_REGION_OPTIONS.confirmMs > DEFAULT_REGION_OPTIONS.tapWindowMs * 2);
});

test('a brief dropped hand does not interrupt framing', () => {
  const sel = new RegionSelector();
  const clock = newClock();
  const framed = hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 400, clock);
  const dropped = hold(sel, LEFT_CLOSED(), null, 200, clock);
  assert.equal(dropped.phase, 'framing');
  assert.deepEqual(dropped.rect, framed.rect);

  const resumed = hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 200, clock);
  assert.equal(resumed.phase, 'framing', 'the same pinch continues after detection returns');
});

test('a brief dropped hand does not consume the confirmation gesture', () => {
  const sel = new RegionSelector();
  const clock = newClock();
  hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 400, clock);
  const frozen = hold(sel, LEFT_OPEN(), RIGHT_OPEN(), 200, clock);
  const dropped = hold(sel, LEFT_OPEN(), null, 200, clock);
  assert.equal(dropped.phase, 'pending');
  assert.deepEqual(dropped.rect, frozen.rect);

  const confirmed = hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 400, clock);
  assert.ok(confirmed.committed, 'confirmation still works after detection returns');
});

test('losing a hand beyond the grace period freezes the last honest rectangle', () => {
  const sel = new RegionSelector();
  const clock = newClock();
  const framed = hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 400, clock);
  const lost = hold(sel, LEFT_CLOSED(), null, DEFAULT_REGION_OPTIONS.lostHandGraceMs + 200, clock);
  assert.equal(lost.phase, 'pending');
  assert.deepEqual(lost.rect, framed.rect, 'the last rectangle the hand held is kept');
});

test('a pinch too brief to be meant does not start framing', () => {
  // Both hands have to satisfy the hold window at the same time. One frame of
  // mistracking on each hand, even simultaneously, is not a selection.
  const sel = new RegionSelector();
  const clock = newClock();
  hold(sel, LEFT_OPEN(), RIGHT_OPEN(), 300, clock);
  const blip = hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 34, clock);
  assert.equal(blip.phase, 'idle', 'one frame is not a pinch');
});

test('the gesture can be made twice in a row', () => {
  const sel = new RegionSelector();
  const clock = newClock();
  assert.ok(fullGesture(sel, clock).committed);
  hold(sel, LEFT_OPEN(), RIGHT_OPEN(), 200, clock);
  assert.ok(fullGesture(sel, clock).committed, 'no state left over from the first');
});

test('reset clears a selection in progress', () => {
  const sel = new RegionSelector();
  const clock = newClock();
  hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 400, clock);
  sel.reset();
  const after = sel.update(LEFT_CLOSED(), RIGHT_CLOSED(), (clock.t += 33));
  assert.equal(after.phase, 'idle', 'the hold window has to be served again');
});

test('cancel abandons a live rectangle and waits for both hands to open', () => {
  const sel = new RegionSelector();
  const clock = newClock();
  hold(sel, LEFT_CLOSED(), RIGHT_CLOSED(), 400, clock);

  assert.equal(sel.cancel(), true);
  assert.equal(sel.phase, 'cooldown');
  assert.equal(sel.update(LEFT_CLOSED(), RIGHT_CLOSED(), (clock.t += 33)).rect, null);
  assert.equal(sel.phase, 'cooldown', 'the cancelling pose must not restart selection');

  hold(sel, LEFT_OPEN(), RIGHT_OPEN(), 100, clock);
  assert.equal(sel.phase, 'idle');
  assert.equal(sel.cancel(), false, 'nothing idle can be cancelled');
});
