import { WebGLFieldRenderer } from '../website/src/lib/field-renderer';
import { CanvasFieldRenderer } from '../website/src/lib/canvas-field-renderer';
import { GalaxyScene, type SceneUpdate } from './galaxy-scene';
import { initialInput } from '../website/src/lib/gravity';

type Point = { x: number; y: number };
export class GalaxyField {
  supported = true;
  paused = false;
  private worker: Worker | null = null;
  private scene: GalaxyScene | null = null;
  private input = initialInput();
  private pending: SceneUpdate = {};
  private sent = '';
  private width = 1;
  private height = 1;
  private reduced: boolean;
  private tracking = false;
  private visible = true;
  private pressure = 0;
  private slowFrames = 0;
  private readyTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(private canvas: HTMLCanvasElement, options: { reducedMotion: boolean }) {
    this.reduced = options.reducedMotion;
    this.resize();
    if (typeof Worker !== 'undefined' && canvas.transferControlToOffscreen) {
      try {
        this.worker = new Worker(new URL('./galaxy-worker.js', import.meta.url), { type: 'module' });
        this.worker.onmessage = ({ data }) => {
          if (data.type === 'fallback') this.fallback();
          else if (data.type === 'ready') { clearTimeout(this.readyTimer); canvas.parentElement!.dataset.renderer = 'webgl-worker'; }
          else if (data.type === 'state') Object.assign(canvas.parentElement!.dataset, { phase: data.phase, fieldX: Number(data.x).toFixed(3), fieldY: Number(data.y).toFixed(3), particles: String(data.particles), renderFps: String(data.fps) });
        };
        this.worker.onerror = () => this.fallback();
        const surface = canvas.transferControlToOffscreen();
        this.worker.postMessage({ type: 'init', canvas: surface, width: this.width, height: this.height, dpr: devicePixelRatio || 1, reduced: this.reduced }, [surface]);
        this.readyTimer = setTimeout(() => this.fallback(), 8000);
        return;
      } catch { this.worker?.terminate(); this.worker = null; }
    }
    this.fallback();
  }
  private fallback() {
    clearTimeout(this.readyTimer); this.worker?.terminate(); this.worker = null;
    if (this.scene) return;
    let alternate = document.createElement('canvas');
    alternate.className = 'galaxy-fallback'; alternate.setAttribute('aria-hidden', 'true');
    this.canvas.hidden = true; this.canvas.after(alternate);
    let renderer, software = false;
    try { renderer = new WebGLFieldRenderer(alternate); }
    catch {
      alternate.remove(); alternate = document.createElement('canvas');
      alternate.className = 'galaxy-fallback'; alternate.setAttribute('aria-hidden', 'true'); this.canvas.after(alternate);
      renderer = new CanvasFieldRenderer(alternate); software = true;
    }
    this.scene = new GalaxyScene(renderer, this.width, this.height, software);
    this.canvas.parentElement!.dataset.renderer = software ? 'canvas-2d' : 'webgl-main';
    alternate.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.scene?.renderer.dispose(); this.scene = null; alternate.remove(); this.fallback();
    });
    this.resize(); this.sent = '';
  }
  resize() {
    const box = this.canvas.parentElement!.getBoundingClientRect();
    this.width = Math.max(1, box.width); this.height = Math.max(1, box.height);
    this.worker?.postMessage({ type: 'resize', width: this.width, height: this.height, dpr: devicePixelRatio || 1 });
    this.scene?.resize(this.width, this.height, devicePixelRatio || 1);
  }
  setPointer(point: Point | null) {
    this.input.detected = !!point && point.x >= 0 && point.x <= this.width && point.y >= 0 && point.y <= this.height;
    if (point && this.input.detected) { this.input.x = point.x / this.width; this.input.y = point.y / this.height; }
    if (!this.input.detected) this.input.pressed = false;
  }
  setAttractors(points: Point[] | null, _mode?: string) { if (points?.length) this.setPointer(points[0]); this.input.pressed = !!points?.length && this.input.detected; }
  release(_x: number, _y: number, _strength = 1) { this.input.pressed = false; this.pending.release = true; }
  play() { this.pending.play = true; }
  setTracking(tracking: boolean) { this.tracking = tracking; }
  setVisible(visible: boolean) { this.visible = visible; this.render(); }
  setReducedMotion(reduced: boolean) { this.reduced = reduced; }
  step(delta: number) {
    // React to the input thread, not just worker CPU time: the two still
    // share a GPU, especially on integrated graphics and software renderers.
    if (this.paused || this.reduced || !this.visible) return;
    this.slowFrames = delta > .035 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - .2);
    if (this.slowFrames > 8 && this.pressure < 3) {
      this.pressure++; this.slowFrames = 0;
      this.canvas.parentElement!.dataset.quality = String(this.pressure);
    }
  }
  render() {
    const data = { input: this.input, paused: this.paused, reduced: this.reduced, tracking: this.tracking, visible: this.visible, pressure: this.pressure, ...this.pending };
    const serialized = JSON.stringify(data);
    if (serialized !== this.sent) {
      this.worker?.postMessage(data); this.scene?.update(data);
      this.sent = serialized; this.pending = {};
    }
    if (this.scene?.frame(performance.now())) Object.assign(this.canvas.parentElement!.dataset, { phase: this.scene.state.phase, fieldX: this.scene.state.x.toFixed(3), fieldY: this.scene.state.y.toFixed(3), particles: String(this.scene.particles.lights.length) });
  }
}
