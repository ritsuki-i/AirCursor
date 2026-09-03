// src/core/oneEuro.js
//
// One Euro Filter.
// Casiez, Roussel & Vogel (CHI 2012), "1€ Filter: A Simple Speed-based Low-pass
// Filter for Noisy Input in Interactive Systems".
//
// Why this and not a plain EMA: a fixed low-pass filter forces a trade-off
// between jitter at rest and lag while moving. The One Euro filter adapts its
// cutoff to the observed speed, so a still hand is smoothed hard (no jitter)
// while a fast hand is barely filtered (no lag).

const TWO_PI = 2 * Math.PI;

function alphaFor(cutoff, dt) {
  const tau = 1 / (TWO_PI * cutoff);
  return 1 / (1 + tau / dt);
}

class LowPass {
  constructor() {
    this.hasLast = false;
    this.last = 0;
  }

  filter(value, alpha) {
    const out = this.hasLast ? alpha * value + (1 - alpha) * this.last : value;
    this.last = out;
    this.hasLast = true;
    return out;
  }

  reset() {
    this.hasLast = false;
    this.last = 0;
  }
}

export class OneEuroFilter {
  /**
   * @param {object}  [options]
   * @param {number}  [options.minCutoff=1.0] Cutoff (Hz) at zero speed. Lower = steadier at rest.
   * @param {number}  [options.beta=0.0]      Speed coefficient. Higher = less lag when moving fast.
   * @param {number}  [options.dCutoff=1.0]   Cutoff (Hz) for the derivative estimate.
   */
  constructor({ minCutoff = 1.0, beta = 0.0, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.x = new LowPass();
    this.dx = new LowPass();
    this.lastTime = null;
  }

  /**
   * @param {number} value
   * @param {number} timestampSec monotonic seconds (performance.now() / 1000)
   * @returns {number}
   */
  filter(value, timestampSec) {
    let dt = 1 / 60;
    if (this.lastTime !== null) {
      const delta = timestampSec - this.lastTime;
      // Guard against a stalled tab, a clock jump, or two results in the same ms.
      if (delta > 1e-4 && delta < 1) dt = delta;
    }
    this.lastTime = timestampSec;

    const prev = this.x.hasLast ? this.x.last : value;
    const rawDerivative = (value - prev) / dt;
    const derivative = this.dx.filter(rawDerivative, alphaFor(this.dCutoff, dt));

    const cutoff = this.minCutoff + this.beta * Math.abs(derivative);
    return this.x.filter(value, alphaFor(cutoff, dt));
  }

  reset() {
    this.x.reset();
    this.dx.reset();
    this.lastTime = null;
  }
}

/** Two independent One Euro filters, for a 2D point. */
export class OneEuroPoint {
  constructor(options) {
    this.fx = new OneEuroFilter(options);
    this.fy = new OneEuroFilter(options);
  }

  filter(point, timestampSec) {
    return {
      x: this.fx.filter(point.x, timestampSec),
      y: this.fy.filter(point.y, timestampSec),
    };
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
  }
}
