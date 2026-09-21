import { advanceField, initialField, initialInput, type FieldInput } from '../website/src/lib/gravity';
import { ParticleField, DESKTOP_BUDGET, MOBILE_BUDGET, FALLBACK_BUDGET } from '../website/src/lib/particle-field';
import type { FieldRenderer } from '../website/src/lib/field-renderer';

export interface SceneUpdate { input?: FieldInput; paused?: boolean; reduced?: boolean; tracking?: boolean; visible?: boolean; play?: boolean; release?: boolean; pressure?: number }
export class GalaxyScene {
  readonly state = initialField();
  readonly input = initialInput();
  readonly particles: ParticleField;
  paused = false;
  reduced = false;
  tracking = false;
  visible = true;
  dirty = true;
  private previous = 0;
  private accumulator = 0;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private quality = 1;
  private slow = 0;
  private fast = 0;
  private pressure = 0;
  renderScale = 1;
  constructor(readonly renderer: FieldRenderer, width: number, height: number, readonly fallback = false) {
    this.particles = new ParticleField(fallback ? FALLBACK_BUDGET : width < 650 ? MOBILE_BUDGET : DESKTOP_BUDGET, width / height);
  }
  resize(width = this.width, height = this.height, dpr = this.dpr) {
    this.width = Math.max(1, width); this.height = Math.max(1, height); this.dpr = dpr;
    this.particles.aspect = this.width / this.height;
    // Camera startup no longer forces a lower-resolution canvas. Start from
    // the same pixel budget and let measured GPU/main-thread pressure adapt it.
    const pixels = 1_100_000 / (1 + this.pressure * .28);
    this.renderScale = this.quality * Math.min(dpr, 1.25, Math.sqrt(pixels / (this.width * this.height)));
    this.renderer.resize(this.width, this.height, this.renderScale);
    this.dirty = true;
  }
  update(data: SceneUpdate) {
    if (data.input) {
      // The demo flag belongs to the state machine and clears after a cycle.
      const { demo: _demo, launch: _launch, ...pointer } = data.input;
      Object.assign(this.input, pointer);
    }
    if (data.visible !== undefined && data.visible !== this.visible) { this.visible = data.visible; this.previous = 0; }
    if (data.paused !== undefined) this.paused = data.paused;
    if (data.reduced !== undefined && this.reduced !== data.reduced) { this.reduced = data.reduced; this.dirty = true; }
    if (data.tracking !== undefined && this.tracking !== data.tracking) { this.tracking = data.tracking; this.resize(); }
    if (data.pressure !== undefined && data.pressure !== this.pressure) { this.pressure = data.pressure; this.resize(); }
    if (data.play) {
      if (['attraction', 'compression', 'silence'].includes(this.state.phase)) this.input.launch = true;
      else if (['ambient', 'detection'].includes(this.state.phase)) { this.input.demo = true; this.state.armed = true; }
    }
    if (data.release) {
      this.input.pressed = false;
      this.input.launch = true;
    }
  }
  frame(now: number) {
    if (!this.visible || ((this.paused || this.reduced) && !this.dirty)) { this.previous = 0; return false; }
    const fps = this.fallback ? 24 : this.tracking ? 45 : 60;
    const interval = 1000 / Math.max(24, fps - this.pressure * 8);
    if (!this.dirty && now - this.previous < interval - 1) return false;
    const delta = this.previous ? Math.min((now - this.previous) / 1000, .05) : 1 / 60;
    this.previous = now;
    const start = performance.now();
    if (!this.paused && !this.reduced) {
      this.accumulator = Math.min(this.accumulator + delta, 1 / 30);
      while (this.accumulator >= 1 / 60) {
        advanceField(this.state, this.input, 1 / 60, this.particles);
        this.particles.step(this.state, 1 / 60);
        this.accumulator -= 1 / 60;
      }
    }
    this.renderer.draw(this.particles, this.state, this.reduced);
    this.dirty = false;
    const cost = performance.now() - start;
    if (cost > interval * .82) {
      this.slow++; this.fast = 0;
    } else {
      this.slow = Math.max(0, this.slow - 1);
      this.fast = cost < interval * .5 ? this.fast + 1 : Math.max(0, this.fast - 1);
    }
    if (this.slow > 30 && this.quality > .75) {
      this.quality = Math.max(.75, this.quality * .9); this.resize(); this.slow = 0; this.fast = 0;
    } else if (this.fast > 180 && this.quality < 1) {
      this.quality = Math.min(1, this.quality + .05); this.resize(); this.slow = 0; this.fast = 0;
    }
    return true;
  }
}
