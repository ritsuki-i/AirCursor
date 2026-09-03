// test/recognizer.test.mjs
//
// The recognizer replayed against the labelled recordings the thresholds were
// fitted from.
//
// The unit tests around it use synthetic hands, which prove the logic is wired
// correctly but say nothing about whether the numbers work on a real hand. These
// do, and they exist mainly to stop the accidental pointer coming back: it is
// the failure that started this whole line of work, and it is invisible to every
// other test in the suite.
//
// A drop here is not automatically a bug. It means the thresholds moved, and the
// numbers below say what that cost.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { HandGestureRecognizer } from '../dist/esm/core/gestures.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, '..', 'docs', 'tools');

function load(name) {
  const file = path.join(dataDir, name);
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8')).samples
    .filter((s) => s.landmarks && s.landmarks.length === 21);
}

const samples = [
  ...load('aircursor-gestures-604.json'),
  ...load('aircursor-gestures-102.json'),
  ...load('aircursor-gestures-34.json'),
  // A later recording, made once the V sign turned out to be accepted as a
  // pointer. Its `aim` frames are the cleanest of the three — nothing in them
  // has the two fingers more than 0.233 apart — and its `peace` frames are the
  // negative class the pointer decision had never been measured against.
  ...load('aircursor-gestures-vsign-89.json'),
];

const lmOf = (s) => s.landmarks.map(([x, y, z]) => ({ x, y, z }));

/** One pose, judged on its own — the hold window must not mask a bad threshold. */
function classify(recognizer, sample) {
  recognizer.reset();
  let out = null;
  for (let k = 0; k < 3; k++) out = recognizer.update(lmOf(sample), k * 20);
  if (out.selecting) return 'select';
  if (out.grabbing) return 'grab';
  if (out.aiming) return 'aim';
  if (out.fist) return 'fist';
  return 'idle';
}

// The recogniser has no `peace` output and should not have one: a V sign is
// simply not a gesture, so reading it as `idle` is the right answer.
const EXPECTED = { idle: 'idle', aim: 'aim', select: 'select', grab: 'grab', fist: 'fist', peace: 'idle' };

function confusion() {
  // Both holds off: this measures where the thresholds sit, not how long a
  // pose has to be held, and each frame here is judged on its own.
  const recognizer = new HandGestureRecognizer({ holdMs: 0, selectHoldMs: 0 });
  const rows = ['idle', 'aim', 'select', 'grab', 'fist', 'peace'];
  const cols = ['idle', 'aim', 'select', 'grab', 'fist'];
  const m = Object.fromEntries(rows.map((a) => [a, Object.fromEntries(cols.map((b) => [b, 0]))]));
  for (const s of samples) m[s.label][classify(recognizer, s)] += 1;
  return m;
}

const share = (row) => {
  const total = Object.values(row).reduce((a, b) => a + b, 0);
  return (key) => (total ? row[key] / total : 0);
};

test('the labelled recordings are present', () => {
  assert.ok(samples.length > 600, `expected the recordings in docs/tools, found ${samples.length} frames`);
});

test('a resting hand almost never engages the pointer', () => {
  // The original complaint, and the number this whole exercise exists to hold
  // down. It was 29% when the pointer was decided on index/middle distance.
  const m = confusion();
  const idle = share(m.idle);
  const fired = idle('aim') + idle('select');
  assert.ok(fired <= 0.05, `resting hands engaged the pointer on ${(fired * 100).toFixed(1)}% of frames`);
});

test('a fist is not mistaken for anything else', () => {
  const m = confusion();
  assert.ok(share(m.fist)('fist') >= 0.97);
});

test('a click is recognized as a click', () => {
  const m = confusion();
  const select = share(m.select);
  assert.ok(select('select') >= 0.93, `clicks recognized on ${(select('select') * 100).toFixed(0)}%`);
  // A click must never read as a grab-and-scroll: the page would move under it.
  assert.ok(select('grab') <= 0.05);
});

test('grab and pointer are told apart', () => {
  const m = confusion();
  assert.ok(share(m.grab)('grab') >= 0.85);
  assert.ok(share(m.aim)('grab') <= 0.05, 'pointing must not start scrolling the page');
});

test('the pointer engages for most intended poses', () => {
  // Measured on the frames that meet the pose as it is now defined — the two
  // fingers actually held together — rather than on everything carrying the
  // `aim` label.
  //
  // That is not the label being bent to fit the code. The pointer used to be
  // decided on the gap score alone, and under that rule a V sign is a pointer:
  // 87% of the recorded ones engaged it. Narrowing the pose to exclude them
  // also excludes 65 frames of the earlier recordings that were labelled `aim`
  // while the two fingers sat a third of a hand unit or more apart. Those
  // frames are a truthful record of what someone did, and no longer a record
  // of the gesture; scoring against them would measure agreement with a
  // definition that has been deliberately replaced.
  //
  // The floor stays low because the gap-score gate, which is untouched by any
  // of this, is what most of the remaining shortfall comes from.
  const recognizer = new HandGestureRecognizer({ holdMs: 0, selectHoldMs: 0 });
  const together = samples.filter(
    (s) => s.label === 'aim' && s.features.indexMiddle < 0.238
  );
  const engaged = together.filter((s) => classify(recognizer, s) === 'aim').length;
  assert.ok(together.length > 200, `expected a decent number of frames, got ${together.length}`);
  assert.ok(
    engaged / together.length >= 0.75,
    `pointer recall fell to ${((engaged / together.length) * 100).toFixed(1)}%`
  );
});

test('the clean pointer recording engages every time', () => {
  // The one recording made after the pose was pinned down in words — "index and
  // middle touching along their length" — and the only one with no frames that
  // contradict it. If the threshold ever stops fitting the gesture as described,
  // this is where it shows first.
  const recognizer = new HandGestureRecognizer({ holdMs: 0, selectHoldMs: 0 });
  const clean = load('aircursor-gestures-vsign-89.json').filter((s) => s.label === 'aim');
  assert.ok(clean.length > 30, 'the clean pointer recording should be present');
  const engaged = clean.filter((s) => classify(recognizer, s) === 'aim').length;
  assert.equal(engaged, clean.length);
});

test('a recorded V sign never engages the pointer', () => {
  // The reported bug, against the poses that caused it rather than against a
  // stand-in. Before the separation gate, 40 of these 46 engaged the pointer.
  const recognizer = new HandGestureRecognizer({ holdMs: 0, selectHoldMs: 0 });
  const vSigns = samples.filter((s) => s.label === 'peace');
  assert.ok(vSigns.length > 40, 'the V sign recording should be present');
  const engaged = vSigns.filter((s) => classify(recognizer, s) !== 'idle');
  assert.deepEqual(engaged, [], `${engaged.length} V signs were taken for a gesture`);
});

test('overall agreement with the labels holds', () => {
  const m = confusion();
  let correct = 0;
  let total = 0;
  for (const [label, row] of Object.entries(m)) {
    correct += row[EXPECTED[label]];
    total += Object.values(row).reduce((a, b) => a + b, 0);
  }
  // Unchanged from before the V sign work: narrowing the pointer costs recall
  // on the `aim` rows of the two earliest recordings, and adding the V signs —
  // every one of which is now read correctly — pays for it. Left where it was
  // rather than lowered, since it still holds.
  assert.ok(correct / total >= 0.83, `agreement fell to ${((correct / total) * 100).toFixed(1)}%`);
});

test('a thumb passing through click distance does not click', () => {
  // The live failure the recorded poses cannot show: a click fires while the
  // hand is on its way somewhere else, or on a single mistracked frame. The
  // whole distance between pointing and clicking is 0.14 hand units and one bad
  // frame moves the thumb by up to 0.45, so the threshold cannot carry this on
  // its own — the pose has to persist.
  // Only the clean pointer recordings: a fifth of the first one has the thumb
  // already at click distance, so settling on those poses is *supposed* to
  // click and they would not be testing what this test is about.
  const aims = [...load('aircursor-gestures-102.json'), ...load('aircursor-gestures-34.json')]
    .filter((s) => s.label === 'aim');
  const clicks = load('aircursor-gestures-34.json').filter((s) => s.label === 'select');
  assert.ok(aims.length && clicks.length);

  const dip = (frames) => {
    let fired = 0;
    for (let i = 0; i < aims.length; i++) {
      const r = new HandGestureRecognizer();
      const pointer = lmOf(aims[i]);
      const click = lmOf(clicks[i % clicks.length]);
      let t = 0;
      let saw = false;
      for (let k = 0; k < 12; k++) saw ||= r.update(pointer, (t += 33)).selecting;
      for (let k = 0; k < frames; k++) saw ||= r.update(click, (t += 33)).selecting;
      for (let k = 0; k < 8; k++) saw ||= r.update(pointer, (t += 33)).selecting;
      if (saw) fired++;
    }
    return fired / aims.length;
  };

  assert.equal(dip(1), 0, 'one bad frame must never click');
  assert.equal(dip(3), 0, 'a thumb swinging through must not click');
  assert.ok(dip(5) <= 0.02, `a brief dip clicked on ${(dip(5) * 100).toFixed(0)}% of poses`);
});

test('a deliberate click still fires, and quickly enough', () => {
  const clicks = samples.filter((s) => s.label === 'select');
  let fired = 0;
  let slowest = 0;
  for (const c of clicks) {
    const r = new HandGestureRecognizer();
    let t = 0;
    for (let k = 0; k < 12; k++) {
      if (r.update(lmOf(c), (t += 33)).selecting) { fired++; slowest = Math.max(slowest, k + 1); break; }
    }
  }
  // Not all of them: a few recorded clicks sit close enough to a grab that the
  // grab arbitration takes them, which the confusion matrix above already
  // accounts for. What matters here is that the longer hold did not cost any.
  assert.ok(fired / clicks.length >= 0.93,
    `only ${((fired / clicks.length) * 100).toFixed(0)}% of clicks registered`);
  // Eight frames at 30fps, about 260ms. The click hold accounts for most of it
  // and cannot start until the pointer itself has latched, since a click is
  // only meaningful while pointing. That is the price of the click no longer
  // firing on a thumb that was only passing through.
  assert.ok(slowest <= 8, `slowest click took ${slowest} frames (${slowest * 33}ms)`);
});

test('a single mistracked frame does not change any verdict', () => {
  // A median of three is what makes this true: an outlier cannot be the middle
  // value of a window unless it lasts more than half of it.
  const poses = samples.filter((s) => s.label === 'aim').slice(0, 60);
  const junk = lmOf(samples.find((s) => s.label === 'fist'));
  let changed = 0;
  for (const pose of poses) {
    const r = new HandGestureRecognizer();
    let t = 0;
    let before = null;
    for (let k = 0; k < 10; k++) before = r.update(lmOf(pose), (t += 33));
    const during = r.update(junk, (t += 33));
    const after = r.update(lmOf(pose), (t += 33));
    const same = (a, b) => a.aiming === b.aiming && a.selecting === b.selecting &&
      a.grabbing === b.grabbing && a.fist === b.fist;
    if (!same(before, during) || !same(before, after)) changed++;
  }
  assert.equal(changed, 0, `${changed} of ${poses.length} poses flipped on one bad frame`);
});

// ------------------------------------------------------------------ V signs

/**
 * A hand with the index and middle extended and spread by `separation` hand
 * units, the ring and pinky curled into the palm, and the thumb out of the way.
 *
 * Built rather than sampled because the labelled recordings have no V sign in
 * them — worse, some of what is labelled `aim` *is* one, held slightly open,
 * which is how the pose came to be accepted in the first place.
 */
function vSign(separation) {
  const half = (separation * 0.1) / 2;
  const lm = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.75, z: 0 }));
  lm[0] = { x: 0.50, y: 0.80, z: 0 };              // wrist
  lm[9] = { x: 0.50, y: 0.70, z: 0 };              // middle MCP -> hand scale 0.1
  lm[4] = { x: 0.40, y: 0.72, z: 0 };              // thumb tip, well clear
  lm[8] = { x: 0.50 - half, y: 0.50, z: 0 };       // index tip, extended
  lm[12] = { x: 0.50 + half, y: 0.50, z: 0 };      // middle tip, extended
  lm[16] = { x: 0.53, y: 0.68, z: 0 };             // ring tip, curled
  lm[20] = { x: 0.56, y: 0.69, z: 0 };             // pinky tip, curled
  return lm;
}

function holdFor(landmarks, ms = 400) {
  const recognizer = new HandGestureRecognizer();
  let state = null;
  for (let t = 0; t <= ms; t += 33) state = recognizer.update(landmarks, t);
  return state;
}

test('two fingers held together is the pointer', () => {
  const state = holdFor(vSign(0.15));
  assert.equal(state.aiming, true);
});

test('the same hand with the fingers spread is not', () => {
  // The reported bug. Curling the ring and pinky widens the neighbouring finger
  // gaps, and the gap score is a comparison against those — so a V sign scores
  // as a pointer no matter how far the two pointing fingers are apart. Only
  // asking whether they are actually together tells the two poses apart.
  const state = holdFor(vSign(0.5));
  assert.equal(state.aiming, false);
  assert.equal(state.selecting, false);
  assert.ok(
    state.metrics.gapScore > 0.18,
    'the gap score alone still says pointer, which is exactly the problem'
  );
});

test('a wide V is not the pointer either', () => {
  assert.equal(holdFor(vSign(1.0)).aiming, false);
});

test('spreading the fingers drops the pointer immediately', () => {
  // Not just "does not start" but "does not stay": a trigger waits out its hold
  // window on the way on and never on the way off, so the pointer has to be
  // gone within a frame of the fingers parting.
  const recognizer = new HandGestureRecognizer();
  const together = vSign(0.15);
  const apart = vSign(0.9);
  let t = 0;
  let state = null;
  for (; t <= 400; t += 33) state = recognizer.update(together, t);
  assert.equal(state.aiming, true, 'the pointer should be live to begin with');

  // Three frames is the median window: the measurement itself cannot respond
  // faster than that, and nothing should be slower than it.
  for (let i = 0; i < 3; i++) { t += 33; state = recognizer.update(apart, t); }
  assert.equal(state.aiming, false);
});

test('the separation gate leaves clicking alone', () => {
  // A hand about to click holds those two fingers together anyway, so the gate
  // must cost the click nothing. Measured on the labelled clicks rather than
  // argued.
  const clicks = samples.filter((s) => s.label === 'select');
  const fired = clicks.filter((s) => {
    const recognizer = new HandGestureRecognizer();
    let state = null;
    for (let t = 0; t <= 400; t += 33) state = recognizer.update(lmOf(s), t);
    return state.aiming;
  }).length;
  assert.ok(
    fired / clicks.length > 0.95,
    `clicks must still aim, got ${(100 * fired / clicks.length).toFixed(0)}%`
  );
});
