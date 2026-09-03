// test/fit.test.mjs
//
// The threshold fitting used by the labeler, checked against data whose right
// answer is known. This fit decides the thresholds the library ships with, so a
// mistake here would be invisible and would land in every consumer.
//
// The rule it implements: `enter` sits where 97% of the intended poses reach it,
// so the gesture starts when it is meant to; `exit` sits where only 2% of
// everything else does, so a held gesture can drift without dropping. enter is
// the tighter line and exit the looser one — the asymmetry hysteresis is for.
//
// The first version of this had those two swapped, which these tests caught.

import test from 'node:test';
import assert from 'node:assert/strict';

import { quantile, fit } from '../docs/tools/fit.js';

/** Deterministic normal samples, so a failure is reproducible. */
function gaussian(mean, sd, n, seed = 1) {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = Math.max(1e-9, rand());
    const v = rand();
    out.push(mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
  }
  return out;
}

test('quantile interpolates between neighbours', () => {
  const xs = [0, 1, 2, 3, 4];
  assert.equal(quantile(xs, 0), 0);
  assert.equal(quantile(xs, 1), 4);
  assert.equal(quantile(xs, 0.5), 2);
  assert.equal(quantile(xs, 0.25), 1);
});

test('cleanly separated classes give a usable band in the right order', () => {
  // Positives low, negatives high: the shape a pinch distance has.
  const pos = gaussian(0.15, 0.03, 400, 7);
  const neg = gaussian(0.60, 0.08, 400, 13);
  const r = fit(pos, neg, 'below');

  assert.equal(r.ok, true);
  assert.equal(r.usable, true);
  assert.ok(r.enter < r.exit, `entering (${r.enter}) must be tighter than staying (${r.exit})`);
  assert.ok(r.enter > 0.15, 'the enter line sits at the far edge of the positive cloud');
  assert.ok(r.exit < 0.60, 'and the exit line below the negative cloud');
  assert.ok(r.fireRate < 0.02, `non-gestures should almost never cross enter, got ${r.fireRate}`);
  assert.ok(r.startRate > 0.95, `intended poses should reliably start, got ${r.startRate}`);
  assert.ok(r.auc > 0.99, `cleanly separated data should score a high AUC, got ${r.auc}`);
});

test('the same holds when the positives are the higher class', () => {
  const pos = gaussian(0.80, 0.05, 400, 3);
  const neg = gaussian(0.20, 0.05, 400, 29);
  const r = fit(pos, neg, 'above');

  assert.equal(r.usable, true);
  assert.ok(r.enter > r.exit, 'above: entering takes a higher value than staying does');
  assert.ok(r.enter < 0.80 && r.enter > 0.20);
});

test('overlapping classes are reported as inseparable rather than fitted', () => {
  // The case the hand-picked numbers were silently in: two poses the chosen
  // measurement cannot tell apart at all.
  const pos = gaussian(0.40, 0.12, 400, 5);
  const neg = gaussian(0.44, 0.12, 400, 11);
  const r = fit(pos, neg, 'below');

  assert.equal(r.ok, true);
  assert.equal(r.usable, false, 'it must not hand back a threshold it cannot justify');
});

test('a thin sample set is refused', () => {
  const r = fit(gaussian(0.2, 0.02, 5), gaussian(0.8, 0.02, 400), 'below');
  assert.equal(r.ok, false);
  assert.match(r.reason, /not enough/);
});

test('the fitted band holds up on samples it was not fitted to', () => {
  const pos = gaussian(0.18, 0.04, 600, 17);
  const neg = gaussian(0.55, 0.10, 600, 23);
  const r = fit(pos.slice(0, 300), neg.slice(0, 300), 'below');

  const heldPos = pos.slice(300);
  const heldNeg = neg.slice(300);
  const falseFires = heldNeg.filter((v) => v < r.enter).length / heldNeg.length;
  const drops = heldPos.filter((v) => v > r.exit).length / heldPos.length;

  assert.ok(falseFires < 0.06, `unwanted firing should stay rare, got ${falseFires.toFixed(3)}`);
  assert.ok(drops < 0.08, `a held gesture should not drop, got ${drops.toFixed(3)}`);
});
