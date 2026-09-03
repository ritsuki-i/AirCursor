// src/core/median.js
//
// A running median, for the values the gestures are decided on.
//
// The pointer position is smoothed by a One Euro filter, which is the right tool
// there: it trades smoothing against lag by speed. The gesture distances need
// something different. Their problem is not smoothness but single frames where
// the tracker puts a landmark somewhere impossible — while a hand points
// steadily, the thumb-to-index distance jumps by 0.45 hand units in one frame at
// the 99th percentile, and the whole gap between pointing and clicking is 0.14.
// One such frame is enough to fire a click.
//
// A speed-adaptive filter is the wrong answer to that, because an impulse is the
// fastest thing in the signal and so is exactly what such a filter preserves. A
// median of three discards it outright: an outlier can never be the middle value
// of a window unless it lasts more than half of it. A deliberate pinch spans
// many frames and passes through untouched, and the cost is one frame of lag.

export class MedianFilter {
  /** @param {number} [size=3] window length; must be odd */
  constructor(size = 3) {
    this.size = Math.max(1, size % 2 === 0 ? size + 1 : size);
    this.buffer = [];
  }

  /**
   * @param {number} value
   * @returns {number} the median of the last `size` values
   */
  filter(value) {
    this.buffer.push(value);
    if (this.buffer.length > this.size) this.buffer.shift();
    if (this.buffer.length === 1) return value;
    const sorted = [...this.buffer].sort((a, b) => a - b);
    return sorted[(sorted.length - 1) >> 1];
  }

  reset() {
    this.buffer.length = 0;
  }
}
