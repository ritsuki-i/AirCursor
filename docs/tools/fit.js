// docs/tools/fit.js
//
// Turning labelled poses into thresholds.
//
// Kept separate from the labeler UI so it can be tested against data whose right
// answer is known — these numbers end up in the library, so a quiet mistake here
// would be expensive.
//
// The first version placed the lines at the 97th and 2nd percentiles of the two
// classes. On real recordings that failed badly: a labelled set always carries
// some contamination — the frames where the hand was still moving into the pose,
// a glitched track, a moment the fingers happened to touch — and the extreme
// tails are made almost entirely of it. Two classes whose medians sat three
// times apart were declared inseparable because a handful of frames overlapped.
//
// So the split is chosen from the whole distribution instead, by the measure
// that is standard for exactly this and barely moves when the tails are dirty:
//
//   AUC      how well the feature ranks the two classes apart at all
//   Youden   the split maximising (true positive rate − false positive rate)
//
// and the enter/exit band is placed around that split, sized by the gap between
// the two interquartile ranges. What comes back also reports the error rates the
// band actually achieves, so the number can be judged rather than trusted.

/**
 * The value below which a fraction `q` of the samples fall.
 * @param {number[]} sorted ascending
 * @param {number} q 0..1
 */
export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

/**
 * Probability that a random positive is ranked on the correct side of a random
 * negative. 1 is perfect separation, 0.5 is no information. Computed from ranks,
 * so it does not care how long the tails are.
 */
export function auc(pos, neg, direction) {
  const all = pos.map((v) => ({ v, p: true })).concat(neg.map((v) => ({ v, p: false })));
  all.sort((a, b) => a.v - b.v);

  // Average ranks over ties, so a flat feature scores 0.5 rather than 0 or 1.
  let rankSum = 0;
  for (let i = 0; i < all.length; ) {
    let j = i;
    while (j + 1 < all.length && all[j + 1].v === all[i].v) j++;
    const meanRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) if (all[k].p) rankSum += meanRank;
    i = j + 1;
  }
  const n = pos.length;
  const m = neg.length;
  const a = (rankSum - (n * (n + 1)) / 2) / (n * m);
  // `a` is the chance a positive ranks HIGHER. Flip it when the positives are
  // supposed to be the lower class.
  return direction === 'below' ? 1 - a : a;
}

/** Share of `values` on the firing side of `t`. */
function rate(values, t, direction) {
  const hit = direction === 'below'
    ? values.reduce((n, v) => n + (v <= t ? 1 : 0), 0)
    : values.reduce((n, v) => n + (v >= t ? 1 : 0), 0);
  return hit / values.length;
}

/** The split maximising true positive rate minus false positive rate. */
function youden(pos, neg, direction) {
  const candidates = [...new Set([...pos, ...neg])].sort((a, b) => a - b);
  let best = { t: candidates[0], j: -Infinity, tpr: 0, fpr: 0 };
  for (let i = 0; i < candidates.length; i++) {
    // Test between values rather than on them, so a threshold never sits
    // exactly on a sample.
    const t = i + 1 < candidates.length
      ? (candidates[i] + candidates[i + 1]) / 2
      : candidates[i];
    const tpr = rate(pos, t, direction);
    const fpr = rate(neg, t, direction);
    const j = tpr - fpr;
    if (j > best.j) best = { t, j, tpr, fpr };
  }
  return best;
}

/** AUC above this is a decision worth shipping. */
const CLEAN_AUC = 0.95;
/** Below this, the feature does not tell the poses apart usefully. */
const WEAK_AUC = 0.85;

/**
 * Fit an enter/exit pair for one decision.
 *
 * For a "below" feature such as a pinch distance, the rule is `on when
 * value < enter`, `off when value > exit`, so `enter` is the tighter line and
 * `exit` the looser one, and the band between them is what stops the gesture
 * chattering. Both sit in the gap between the two classes, placed either side of
 * the best split.
 *
 * @param {number[]} pos values from samples where the gesture is intended
 * @param {number[]} neg values from samples where it is not
 * @param {'below'|'above'} direction which side the positives sit on
 */
export function fit(pos, neg, direction) {
  if (pos.length < 20 || neg.length < 20) {
    return { ok: false, reason: 'not enough samples', pos: pos.length, neg: neg.length };
  }
  const p = [...pos].sort((a, b) => a - b);
  const n = [...neg].sort((a, b) => a - b);
  const below = direction === 'below';

  const area = auc(p, n, direction);
  const split = youden(p, n, direction);

  // The no-man's-land between the two interquartile ranges. Quartiles rather
  // than extremes, so contaminated labels do not move it.
  const posEdge = below ? quantile(p, 0.75) : quantile(p, 0.25);
  const negEdge = below ? quantile(n, 0.25) : quantile(n, 0.75);
  const gap = below ? negEdge - posEdge : posEdge - negEdge;

  // How much the feature wanders while the pose is simply being held. The
  // hysteresis band has to clear this, and has no reason to be wider.
  const spread = Math.abs(quantile(p, 0.75) - quantile(p, 0.25));
  const band = Math.max(0.04, spread * 1.5);

  let enter;
  let exit;
  if (gap > 0) {
    const step = (f) => (below ? posEdge + gap * f : posEdge - gap * f);
    // Enter a third of the way across the gap, but never more than a few times
    // the pose's own wander away from it: when two poses are very far apart, a
    // line placed by fraction-of-gap drifts somewhere nobody would ever hold
    // their hand.
    const limit = below ? posEdge + spread * 3 : posEdge - spread * 3;
    enter = below ? Math.min(step(0.30), limit) : Math.max(step(0.30), limit);

    // Exit is one band further out, and no further. Sizing it by the gap was
    // what made releasing a click need most of the travel back to an open hand
    // — the band was wide because the two poses are far apart, which is not a
    // reason for it to be wide.
    exit = below ? enter + band : enter - band;
    const edge = below ? Math.min(exit, negEdge) : Math.max(exit, negEdge);
    exit = edge;
  } else {
    // Overlapping. There is no gap to sit in, so straddle the best split by a
    // token amount and let the verdict below say it is not usable.
    const m = Math.max(0.015, Math.abs(gap) * 0.25);
    enter = below ? split.t - m : split.t + m;
    exit = below ? split.t + m : split.t - m;
  }

  const quality = area >= CLEAN_AUC ? 'clean' : area >= WEAK_AUC ? 'weak' : 'inseparable';

  return {
    ok: true,
    enter: +enter.toFixed(3),
    exit: +exit.toFixed(3),
    split: +split.t.toFixed(3),
    auc: +area.toFixed(3),
    quality,
    usable: quality !== 'inseparable',
    // What the chosen lines actually do, so they can be judged not trusted.
    fireRate: +rate(n, enter, direction).toFixed(3),
    startRate: +rate(p, enter, direction).toFixed(3),
    holdRate: +rate(p, exit, direction).toFixed(3),
    posMedian: +quantile(p, 0.5).toFixed(3),
    negMedian: +quantile(n, 0.5).toFixed(3),
    pos: pos.length,
    neg: neg.length,
  };
}
