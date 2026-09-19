import type { FieldState } from "./gravity";
import type { FieldRenderer } from "./field-renderer";
import type { ParticleField } from "./particle-field";

/** The fallback draws the same individual bodies and histories with Canvas 2D. */
export class CanvasFieldRenderer implements FieldRenderer {
  private ctx: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private glow: HTMLCanvasElement;
  private clouds: HTMLCanvasElement[] = [];
  private colors = ['#5282ff', '#51dbed', '#a271ff', '#e47bbc', '#ffd4a1'];
  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.glow = document.createElement("canvas"); this.glow.width = this.glow.height = 64;
    const sprite = this.glow.getContext("2d")!;
    const gradient = sprite.createRadialGradient(32,32,0,32,32,32);
    gradient.addColorStop(0,"#dceaff"); gradient.addColorStop(.12,"#88b7ff"); gradient.addColorStop(.4,"#315dda60"); gradient.addColorStop(1,"#11285000");
    sprite.fillStyle = gradient; sprite.fillRect(0,0,64,64);
    this.clouds = this.colors.map(color => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      const cloud = ctx.createRadialGradient(32,32,0,32,32,32);
      cloud.addColorStop(0, color); cloud.addColorStop(.25, color + '80'); cloud.addColorStop(1, color + '00');
      ctx.fillStyle = cloud; ctx.fillRect(0,0,64,64);
      return canvas;
    });
  }
  resize(width: number, height: number, dpr: number) {
    this.width = width; this.height = height; this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(width * dpr)); this.canvas.height = Math.max(1, Math.round(height * dpr));
  }
  draw(field: ParticleField, state: FieldState, reduced: boolean) {
    const ctx = this.ctx, h = this.height, w = this.width;
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.fillStyle = "#010306"; ctx.fillRect(0,0,w,h);
    ctx.globalCompositeOperation = "lighter";
    for (const p of field.lights) {
      const depth = 1 / Math.max(.55, 1 + p.z * .32);
      const x = w * .5 + p.x * depth * h, y = h * .5 - p.y * depth * h;
      if (x < -300 || x > w + 300 || y < -300 || y > h + 300) continue;
      const pulse = reduced ? 1 : .66 + .34 * Math.sin(field.time * p.pulseRate + p.phase);
      const veil = Math.max(.3, Math.min(1, x / w * 1.8));
      ctx.globalAlpha = Math.min(1,p.brightness * p.alpha * pulse * veil * (state.phase === "silence" && p.kind === "star" ? .08 : 1));
      if (p.kind === "gas" || p.kind === "glint" || p.kind === "fragment") {
        const size = p.size * (p.kind === "gas" ? h / 1000 : 2) * depth;
        ctx.drawImage(this.clouds[Math.min(4, Math.floor(p.hue * 5))],x-size/2,y-size/2,size,size);
      } else {
        ctx.fillStyle = p.hue > .82 ? "#dceaff" : this.colors[Math.min(4, Math.floor(p.hue * 5))];
        ctx.fillRect(x,y,Math.max(.6,p.size*.55*depth),Math.max(.6,p.size*.55*depth));
      }
    }
    ctx.lineWidth = .65; ctx.strokeStyle = "#9ebdff";
    for (const trail of field.streams) {
      if (trail.light.captured || state.phase === "silence") continue;
      ctx.globalAlpha = trail.light.brightness * trail.light.alpha * .23;
      ctx.strokeStyle = this.colors[Math.min(4, Math.floor(trail.light.hue * 5))];
      ctx.beginPath();
      for (let j = 0; j < trail.length; j++) {
        const index = ((trail.head-j+trail.length)%trail.length)*3;
        const depth = 1/Math.max(.55,1+trail.history[index+2]*.32);
        const x = w*.5+trail.history[index]*depth*h, y = h*.5-trail.history[index+1]*depth*h;
        if (j===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    const energy = reduced ? state.compression*.15 : Math.max(field.captureFraction,state.glow*.6);
    if (energy > .01) {
      const x=w*.5+field.centerX*h,y=h*.5-field.centerY*h,size=85;
      ctx.globalAlpha=Math.min(1,energy); ctx.drawImage(this.glow,x-size/2,y-size/2,size,size);
    }
    ctx.globalAlpha = 1;
  }
  dispose() { this.glow.width = this.glow.height = 1; this.clouds.forEach(canvas => { canvas.width = canvas.height = 1; }); }
}
