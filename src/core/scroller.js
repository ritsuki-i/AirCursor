// src/core/scroller.js
//
// Scrolling.
//
// The README calls this gesture "grab the page and drag it", but the previous
// implementation was velocity-based with per-frame friction, which is a
// different feel entirely: the page lagged behind the hand while grabbed, and
// the friction constant meant different things at 15fps and 30fps.
//
// This is position-based. Grabbing anchors the hand to a scroll offset, and
// while the grab holds, the page follows the hand one-to-one. Releasing hands
// the remaining velocity to an inertia phase, so a flick still throws the page.
//
// Everything advances on `tick(dt)` from a requestAnimationFrame loop rather
// than from the inference callback, so scrolling stays smooth even when hand
// tracking stutters.

/** Nearest ancestor that can actually scroll on the given axis. */
export function findScrollable(element, axis = 'y') {
  const overflowProp = axis === 'x' ? 'overflowX' : 'overflowY';
  const sizeProp = axis === 'x' ? 'scrollWidth' : 'scrollHeight';
  const clientProp = axis === 'x' ? 'clientWidth' : 'clientHeight';

  let node = element;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node.nodeType === 1) {
      const style = window.getComputedStyle(node);
      const overflow = style[overflowProp];
      const scrollable = overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay';
      if (scrollable && node[sizeProp] > node[clientProp] + 1) return node;
    }
    node = node.parentElement || (node.parentNode && node.parentNode.host) || null;
  }
  return null;
}

function readScroll(target, axis) {
  if (!target) {
    const root = document.scrollingElement || document.documentElement;
    return axis === 'x' ? root.scrollLeft : root.scrollTop;
  }
  return axis === 'x' ? target.scrollLeft : target.scrollTop;
}

function writeScroll(target, axis, value) {
  if (!target) {
    // Assign the scrolling root directly. `window.scrollTo()` obeys the
    // page's CSS `scroll-behavior: smooth`; calling it on every animation
    // frame continually restarts that animation and can leave the page
    // apparently stationary while a grab is held.
    const root = document.scrollingElement || document.documentElement;
    if (axis === 'x') root.scrollLeft = value;
    else root.scrollTop = value;
    return;
  }
  if (axis === 'x') target.scrollLeft = value;
  else target.scrollTop = value;
}

function maxScroll(target, axis) {
  if (!target) {
    const doc = document.scrollingElement || document.documentElement;
    return axis === 'x'
      ? Math.max(0, doc.scrollWidth - window.innerWidth)
      : Math.max(0, doc.scrollHeight - window.innerHeight);
  }
  return axis === 'x'
    ? Math.max(0, target.scrollWidth - target.clientWidth)
    : Math.max(0, target.scrollHeight - target.clientHeight);
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class GrabScroller {
  /**
   * @param {object} [options]
   * @param {number} [options.gain=2.2]       page pixels per hand pixel
   * @param {number} [options.followTau=0.055] seconds; how tightly the page tracks the hand
   * @param {number} [options.frictionTau=0.35] seconds; inertia decay time constant
   * @param {number} [options.minFlingSpeed=40] px/s below which release does not fling
   * @param {number} [options.maxFlingSpeed=4200] px/s cap
   * @param {boolean} [options.horizontal=true] also drag on the x axis
   */
  constructor({
    gain = 2.2,
    followTau = 0.055,
    frictionTau = 0.35,
    minFlingSpeed = 40,
    maxFlingSpeed = 4200,
    horizontal = true,
  } = {}) {
    this.gain = gain;
    this.followTau = followTau;
    this.frictionTau = frictionTau;
    this.minFlingSpeed = minFlingSpeed;
    this.maxFlingSpeed = maxFlingSpeed;
    this.horizontal = horizontal;

    this.active = false;
    this.targetX = null; // scrollable element, or null for the window
    this.targetY = null;

    this.anchorHand = { x: 0, y: 0 };
    this.anchorScroll = { x: 0, y: 0 };
    this.desired = { x: 0, y: 0 };
    this.current = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };

    // Short history for estimating release velocity, so a single noisy frame
    // cannot decide the fling.
    this.samples = [];
    this.savedScrollBehaviors = new Map();
  }

  _suspendSmoothScroll() {
    const root = document.scrollingElement || document.documentElement;
    for (const target of [root, this.targetX, this.targetY]) {
      if (!target || this.savedScrollBehaviors.has(target)) continue;
      this.savedScrollBehaviors.set(target, target.style.scrollBehavior);
      target.style.setProperty('scroll-behavior', 'auto', 'important');
    }
  }

  _restoreSmoothScroll() {
    for (const [target, value] of this.savedScrollBehaviors) {
      if (value) target.style.scrollBehavior = value;
      else target.style.removeProperty('scroll-behavior');
    }
    this.savedScrollBehaviors.clear();
  }

  /**
   * @param {{x:number,y:number}} hand viewport-space hand position
   * @param {Element|null} [elementUnderCursor] used to pick the scroll container
   */
  begin(hand, elementUnderCursor = null) {
    this.targetY = elementUnderCursor ? findScrollable(elementUnderCursor, 'y') : null;
    this.targetX = this.horizontal && elementUnderCursor ? findScrollable(elementUnderCursor, 'x') : null;
    this._suspendSmoothScroll();

    this.active = true;
    this.anchorHand = { x: hand.x, y: hand.y };
    this.anchorScroll = {
      x: readScroll(this.targetX, 'x'),
      y: readScroll(this.targetY, 'y'),
    };
    this.desired = { ...this.anchorScroll };
    this.current = { ...this.anchorScroll };
    this.velocity = { x: 0, y: 0 };
    this.samples = [{ t: performance.now() / 1000, x: hand.x, y: hand.y }];
  }

  /** @param {{x:number,y:number}} hand */
  update(hand) {
    if (!this.active) return;

    const dx = hand.x - this.anchorHand.x;
    const dy = hand.y - this.anchorHand.y;

    // Dragging the page: moving the hand down pulls content down, which means
    // the scroll offset decreases.
    this.desired.y = clamp(
      this.anchorScroll.y - dy * this.gain,
      0,
      maxScroll(this.targetY, 'y')
    );
    if (this.horizontal) {
      this.desired.x = clamp(
        this.anchorScroll.x - dx * this.gain,
        0,
        maxScroll(this.targetX, 'x')
      );
    }

    const now = performance.now() / 1000;
    this.samples.push({ t: now, x: hand.x, y: hand.y });
    while (this.samples.length > 2 && now - this.samples[0].t > 0.12) this.samples.shift();
  }

  /** Release the grab and hand over to inertia. */
  end() {
    if (!this.active) return;
    this.active = false;

    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    this.samples = [];
    if (!first || !last) return;

    const dt = last.t - first.t;
    if (dt < 1e-3) return;

    const vy = clamp((-(last.y - first.y) / dt) * this.gain, -this.maxFlingSpeed, this.maxFlingSpeed);
    const vx = this.horizontal
      ? clamp((-(last.x - first.x) / dt) * this.gain, -this.maxFlingSpeed, this.maxFlingSpeed)
      : 0;

    this.velocity.y = Math.abs(vy) >= this.minFlingSpeed ? vy : 0;
    this.velocity.x = Math.abs(vx) >= this.minFlingSpeed ? vx : 0;
  }

  /** Stop immediately, without inertia. */
  cancel() {
    this.active = false;
    this.velocity = { x: 0, y: 0 };
    this.samples = [];
    this._restoreSmoothScroll();
  }

  get idle() {
    return !this.active && this.velocity.x === 0 && this.velocity.y === 0;
  }

  /**
   * Advance the scroll. Call once per animation frame.
   * @param {number} dt seconds since the previous tick
   */
  tick(dt) {
    if (this.idle) return;
    const step = clamp(dt, 1 / 240, 1 / 15);

    if (this.active) {
      // Exponential approach: frame-rate independent, unlike a fixed
      // per-frame multiplier.
      const k = 1 - Math.exp(-step / this.followTau);
      this.current.y += (this.desired.y - this.current.y) * k;
      if (this.horizontal) this.current.x += (this.desired.x - this.current.x) * k;
    } else {
      const decay = Math.exp(-step / this.frictionTau);
      this.current.y = clamp(
        this.current.y + this.velocity.y * step,
        0,
        maxScroll(this.targetY, 'y')
      );
      this.velocity.y *= decay;
      if (Math.abs(this.velocity.y) < 8) this.velocity.y = 0;

      if (this.horizontal) {
        this.current.x = clamp(
          this.current.x + this.velocity.x * step,
          0,
          maxScroll(this.targetX, 'x')
        );
        this.velocity.x *= decay;
        if (Math.abs(this.velocity.x) < 8) this.velocity.x = 0;
      }
    }

    writeScroll(this.targetY, 'y', this.current.y);
    if (this.horizontal) writeScroll(this.targetX, 'x', this.current.x);
    if (this.idle) this._restoreSmoothScroll();
  }
}
