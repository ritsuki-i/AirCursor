import { WebGLFieldRenderer } from '../website/src/lib/field-renderer';
import { GalaxyScene } from './galaxy-scene';

let scene: GalaxyScene | null = null;
let timer: ReturnType<typeof setTimeout>;
let scheduled = false;
let phase = '', reportAt = 0, frames = 0;
function schedule(delay = 0) {
  if (scheduled || !scene) return;
  scheduled = true;
  timer = setTimeout(frame, delay);
}
function frame() {
  scheduled = false;
  if (!scene) return;
  const now = performance.now();
  if (scene.frame(now)) frames++;
  if (scene.state.phase !== phase || now - reportAt >= 1000) {
    phase = scene.state.phase;
    self.postMessage({ type: 'state', phase, x: scene.state.x, y: scene.state.y, particles: scene.particles.lights.length, fps: Math.round(frames * 1000 / Math.max(1, now - reportAt)), scale: scene.renderScale });
    reportAt = now; frames = 0;
  }
  if (scene.visible && !scene.paused && !scene.reduced) schedule(scene.tracking ? 16 : 8);
}
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') {
      const canvas = data.canvas as OffscreenCanvas;
      scene = new GalaxyScene(new WebGLFieldRenderer(canvas), data.width, data.height);
      canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); clearTimeout(timer); scene = null; self.postMessage({ type: 'fallback' }); });
      scene.update(data); scene.resize(data.width, data.height, data.dpr);
      self.postMessage({ type: 'ready' });
    } else if (scene && data.type === 'resize') scene.resize(data.width, data.height, data.dpr);
    else scene?.update(data);
    // Input can arrive at 60fps while the tracked scene intentionally renders
    // at 30fps. Keep the existing render reservation: cancelling it for every
    // coordinate update can starve the worker until the hand stops moving.
    schedule();
  } catch { clearTimeout(timer); scheduled = false; scene = null; self.postMessage({ type: 'fallback' }); }
};
