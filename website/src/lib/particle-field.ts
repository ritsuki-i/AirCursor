import type { FieldState, Phase } from "./gravity";

export type LightKind = "star" | "dust" | "glint" | "fragment" | "gas" | "stream";
export interface Light {
  readonly id: number;
  readonly kind: LightKind;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  readonly hx: number; readonly hy: number; readonly hz: number;
  readonly response: number; readonly drag: number; readonly swirl: number;
  readonly size: number; readonly brightness: number; readonly hue: number;
  readonly phase: number; readonly pulseRate: number;
  readonly launchSpeed: number; readonly launchDelay: number; readonly lifetime: number;
  readonly launchX: number; readonly launchY: number; readonly launchZ: number;
  captured: boolean;
  releaseAge: number;
  released: boolean;
  alpha: number;
}
export interface Streamline {
  readonly light: Light;
  readonly history: Float32Array;
  readonly length: number;
  head: number;
}
export interface FieldBudget { stars: number; dust: number; glints: number; fragments: number; streams: number; gas: number }
export const DESKTOP_BUDGET: FieldBudget = { stars: 1800, dust: 10400, glints: 1300, fragments: 180, streams: 300, gas: 56 };
export const MOBILE_BUDGET: FieldBudget = { stars: 900, dust: 4600, glints: 680, fragments: 90, streams: 160, gas: 36 };
export const FALLBACK_BUDGET: FieldBudget = { stars: 440, dust: 1700, glints: 360, fragments: 60, streams: 90, gas: 24 };
export const FIXED_STEP = 1 / 120;
const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function randomGenerator(seed: number) {
  return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
}

/**
 * Persistent, individually integrated light bodies. Rendering never changes
 * their coordinates. The hand changes acceleration, not an image transform.
 * All units are fractions of viewport height; z has fixed-camera perspective.
 */
export class ParticleField {
  readonly lights: Light[] = [];
  readonly streams: Streamline[] = [];
  readonly pointData: Float32Array;
  readonly trailData: Float32Array;
  readonly reactiveCount: number;
  readonly gasCount: number;
  time = 0;
  capturedCount = 0;
  previousPhase: Phase = "ambient";
  aspect: number;
  centerX = 0;
  centerY = 0;
  private historyTime = 0;
  private flow = new Float64Array(3);
  private captureAtRelease = 0;

  constructor(budget: FieldBudget = DESKTOP_BUDGET, aspect = 1.44, seed = 1701) {
    this.aspect = aspect;
    const random = randomGenerator(seed);
    const add = (kind: LightKind, count: number) => {
      for (let n = 0; n < count; n++) {
        const id = this.lights.length;
        const angle = random() * TAU;
        const lane = Math.floor(random() * 3);
        const thickness = (random() + random() + random() - 1.5);
        const radius = .39 + lane * .21 + thickness * .15;
        // Three sparse, intersecting ribbons form a composition, not a bitmap.
        const x = .21 * aspect + Math.cos(angle) * radius + .07 * Math.sin(angle * 2 + lane);
        const y = -.015 + Math.sin(angle) * radius * .62 + .14 * Math.sin(angle * 2 + lane * .5);
        const z = (random() - .5) * .65 + Math.cos(angle + lane) * .12;
        const phase = random() * TAU;
        const direction = random() * TAU;
        const depth = (random() - .5) * 1.2;
        const light: Light = {
          id, kind,
          x: kind === "star" ? (random() - .5) * aspect * 1.35 : x,
          y: kind === "star" ? (random() - .5) * 1.35 : y,
          z: kind === "star" ? .4 + random() * 1.2 : z,
          vx: 0, vy: 0, vz: 0, hx: x, hy: y, hz: z,
          response: .72 + random() * .95,
          drag: .7 + random() * 1.9,
          swirl: random() < .22 ? .03 : .25 + random() * .95,
          size: kind === "gas" ? 240 + random() * 280 : kind === "fragment" ? 4 + random() * 5 : kind === "glint" ? 4 + random() * 6 : 1.2 + random() * 2.5,
          brightness: kind === "gas" ? .24 + random() * .20 : kind === "dust" ? .42 + random() * .75 : .65 + random() * .9,
          hue: random(), phase, pulseRate: .30 + random() * 1.1,
          launchSpeed: .22 + Math.pow(random(), 1.2) * 1.7,
          launchDelay: random() * .12,
          lifetime: .75 + random() * 3.5,
          launchX: Math.cos(direction), launchY: Math.sin(direction), launchZ: depth,
          captured: false, releaseAge: -1, released: false, alpha: 1,
        };
        this.ambientVelocity(light.x, light.y, light.z, phase, this.flow);
        light.vx = this.flow[0] * light.response;
        light.vy = this.flow[1] * light.response;
        light.vz = this.flow[2];
        this.lights.push(light);
        if (kind === "stream") {
          const length = 54 + Math.floor(random() * 35);
          const history = new Float32Array(length * 3);
          let px = light.x, py = light.y, pz = light.z;
          // Seed each history by independently integrating its flow backwards.
          for (let j = 0; j < length; j++) {
            const index = (length - 1 - j) * 3;
            history[index] = px; history[index + 1] = py; history[index + 2] = pz;
            this.ambientVelocity(px, py, pz, phase, this.flow);
            px -= this.flow[0] * .075 * light.response;
            py -= this.flow[1] * .075 * light.response;
            pz -= this.flow[2] * .075;
          }
          this.streams.push({ light, history, length, head: length - 1 });
        }
      }
    };
    // Gas is drawn first; additive points and trajectory histories sit above it.
    add("gas", budget.gas); add("star", budget.stars); add("dust", budget.dust);
    add("glint", budget.glints); add("fragment", budget.fragments); add("stream", budget.streams);
    this.gasCount = budget.gas;
    this.reactiveCount = this.lights.filter(p => p.kind !== "star" && p.kind !== "gas").length;
    this.pointData = new Float32Array(this.lights.length * 9);
    this.trailData = new Float32Array(this.streams.reduce((sum, trail) => sum + (trail.length - 1) * 6 * 6, 0));
  }

  get captureFraction() { return this.capturedCount / Math.max(1, this.reactiveCount); }

  private ambientVelocity(x: number, y: number, z: number, seed: number, out: Float64Array) {
    const dx = x - this.aspect * .21, dy = y + .015;
    const r = Math.sqrt(dx * dx + dy * dy * 2.5 + .018);
    // Differential orbital flow plus a smooth divergence-free perturbation.
    // Frequencies depend on position and each body's response, not a group angle.
    const a = x * 3.1 + z * 1.7 + this.time * .045;
    const b = y * 4.3 - z * .9 - this.time * .038;
    out[0] = -dy * .072 / (r + .20) + Math.sin(a) * Math.sin(b) * .013;
    out[1] = dx * .032 / (r + .20) + Math.cos(a) * Math.cos(b) * .009;
    out[2] = Math.sin(x * 2.4 + y * 3.1 + seed + this.time * .13) * .007;
  }

  step(state: FieldState, delta: number) {
    const dt = Math.min(delta, 1 / 30);
    this.centerX = (state.x - .5) * this.aspect;
    this.centerY = .5 - state.y;
    if (state.phase === "silence") {
      // Hold the gathered bodies as a compact core, but keep that core attached
      // to the moving pointer. A hard return here used to make a fully charged
      // field look frozen as soon as the hand moved again.
      this.time += dt * .18;
      let captured = 0;
      for (const p of this.lights) {
        if (p.kind === "star") {
          p.x += Math.sin(p.phase + this.time * .09) * .00008 * dt;
          p.y += Math.cos(p.phase + this.time * .07) * .00006 * dt;
        } else if (p.captured) {
          p.x = this.centerX + p.launchX * .002;
          p.y = this.centerY + p.launchY * .002;
          p.z = p.launchZ * .002;
          p.alpha = p.kind === "gas" ? .02 : .15;
          if (p.kind !== "gas") captured++;
        }
      }
      this.capturedCount = captured;
      this.previousPhase = state.phase;
      return;
    }
    this.time += dt;
    if (state.phase === "rupture" && this.previousPhase !== "rupture") {
      this.captureAtRelease = this.captureFraction;
      for (const p of this.lights) {
        if (p.kind === "star") continue;
        p.releaseAge = -p.launchDelay;
        p.released = false;
      }
    }
    const attracting = state.phase === "attraction" || state.phase === "compression";
    const releasing = state.phase === "rupture" || state.phase === "afterglow";
    let captured = 0;
    for (const p of this.lights) {
      if (p.kind === "star") {
        p.x += Math.sin(p.phase + this.time * .09) * .00025 * dt;
        p.y += Math.cos(p.phase + this.time * .07) * .00018 * dt;
        continue;
      }
      let dx = this.centerX - p.x, dy = this.centerY - p.y, dz = -p.z;
      const r2 = dx * dx + dy * dy + dz * dz * .4;
      const r = Math.sqrt(r2 + .000001);
      if (p.captured && attracting) {
        // Already absorbed bodies remain distinct at their own tiny core offsets.
        p.x = this.centerX + p.launchX * .002;
        p.y = this.centerY + p.launchY * .002;
        p.z = p.launchZ * .002;
        p.alpha = p.kind === "gas" ? .02 : .15;
        if (p.kind !== "gas") captured++;
        continue;
      }
      if (releasing && p.releaseAge > -1) {
        p.releaseAge += dt;
        if (p.releaseAge >= 0 && !p.released) {
          const attenuation = p.captured ? 1 : 1 / (1 + r * 3);
          // A one-time individual impulse. Position is never reset to an emitter.
          p.vx = p.launchX * p.launchSpeed * attenuation + p.vx * .12;
          p.vy = p.launchY * p.launchSpeed * attenuation + p.vy * .12;
          p.vz = p.launchZ * p.launchSpeed * attenuation;
          p.captured = false; p.released = true;
        }
        if (p.captured) { if (p.kind !== "gas") captured++; continue; }
      } else if (!attracting) p.captured = false;

      this.ambientVelocity(p.x, p.y, p.z, p.phase, this.flow);
      let ax = (this.flow[0] * p.response - p.vx) * .7;
      let ay = (this.flow[1] * p.response - p.vy) * .7;
      let az = (this.flow[2] - p.vz) * .7;
      if (attracting) {
        const strength = (.30 + state.compression * state.compression * 4.5) * p.response;
        const k = strength / (.085 + r2);
        const viscosity = Math.sqrt(k) * (1.35 + p.drag * .13);
        const angular = p.swirl * (1 - state.compression * .85) * k * .30;
        ax = dx * k - dy * angular - p.vx * viscosity;
        ay = dy * k + dx * angular - p.vy * viscosity;
        az = dz * k - p.vz * viscosity;
        if (r < .012 + state.compression * .01 && state.compression > .2) {
          p.captured = true; p.alpha = .15;
          if (p.kind !== "gas") captured++;
          continue;
        }
      } else if (state.phase === "detection") {
        // Local response: distant lights barely change; near ones curve first.
        const proximity = Math.exp(-r2 / .065) * .26 * p.response;
        ax += dx * proximity - dy * proximity * p.swirl;
        ay += dy * proximity + dx * proximity * p.swirl;
        az += dz * proximity;
      }
      if (releasing && p.released) {
        const returning = state.phase === "afterglow" ? clamp((state.elapsed - .2) / 2.0, 0, 1) : 0;
        const damping = p.drag * .55 + returning * 2.0;
        ax = -p.vx * damping + (p.hx - p.x) * returning * (1.5 + p.response);
        ay = -p.vy * damping + (p.hy - p.y) * returning * (1.5 + p.response);
        az = -p.vz * damping + (p.hz - p.z) * returning * 2;
        ax -= p.vy * p.swirl * .65;
        ay += p.vx * p.swirl * .65;
        const tail = Math.exp(-Math.max(0, p.releaseAge) / p.lifetime);
        p.alpha = tail * (p.kind === "fragment" ? 1.8 : 1.25) + returning * .7;
      } else {
        // Gentle confinement and independent drift prevent a single rigid orbit.
        if (!attracting) {
          ax += (p.hx + Math.sin(this.time * .07 + p.phase) * .10 - p.x) * .018;
          ay += (p.hy + Math.cos(this.time * .09 + p.phase) * .055 - p.y) * .018;
          az += (p.hz - p.z) * .05;
        }
        p.alpha += (1 - p.alpha) * Math.min(1, dt * 3);
        if (p.releaseAge >= 0) { p.releaseAge = -1; p.released = false; }
      }
      p.vx += ax * dt; p.vy += ay * dt; p.vz += az * dt;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
      if (speed > 4.5) { const limit = 4.5 / speed; p.vx *= limit; p.vy *= limit; p.vz *= limit; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    this.capturedCount = captured;
    this.historyTime += dt;
    if (this.historyTime >= .045) {
      this.historyTime %= .045;
      for (const trail of this.streams) {
        if (trail.light.captured) {
          for (let j = 0; j < trail.length; j++) {
            trail.history[j * 3] = trail.light.x;
            trail.history[j * 3 + 1] = trail.light.y;
            trail.history[j * 3 + 2] = trail.light.z;
          }
        }
        trail.head = (trail.head + 1) % trail.length;
        const offset = trail.head * 3;
        trail.history[offset] = trail.light.x;
        trail.history[offset + 1] = trail.light.y;
        trail.history[offset + 2] = trail.light.z;
      }
    }
    this.previousPhase = state.phase;
  }

  /** Pack independently simulated bodies; neither renderer applies a group transform. */
  pack(state: FieldState, reduced: boolean) {
    let pointOffset = 0;
    const quiet = state.phase === "silence";
    for (const p of this.lights) {
      const kind = p.kind === "gas" ? 3 : p.kind === "fragment" ? 2 : p.kind === "glint" ? 1 : 0;
      const alpha = p.alpha * p.brightness * (quiet && p.kind === "star" ? .08 : 1);
      const data = this.pointData;
      data[pointOffset++] = p.x; data[pointOffset++] = p.y; data[pointOffset++] = p.z;
      data[pointOffset++] = p.size; data[pointOffset++] = alpha;
      data[pointOffset++] = p.hue; data[pointOffset++] = kind;
      data[pointOffset++] = p.phase; data[pointOffset++] = p.pulseRate;
    }
    let lineOffset = 0;
    for (const trail of this.streams) {
      const p = trail.light;
      const alpha = p.brightness * p.alpha * (p.captured ? .006 : 1) * (quiet ? .02 : 1) * (reduced ? .5 : 1);
      const samples = p.released ? Math.min(trail.length,4+Math.floor(p.lifetime*3)) : trail.length;
      // Retain every recorded position for physics, but connect every third
      // sample for rendering. At this scale adjacent samples are subpixel.
      const stride = p.released ? 1 : 3;
      for (let j = 0; j < samples - 1; j += stride) {
        const next = Math.min(j + stride, samples - 1);
        const a = ((trail.head-j+trail.length)%trail.length)*3;
        const b = ((trail.head-next+trail.length)%trail.length)*3;
        const az = Math.max(.55,1+trail.history[a+2]*.32), bz = Math.max(.55,1+trail.history[b+2]*.32);
        const dx = trail.history[b]/bz-trail.history[a]/az;
        const dy = trail.history[b+1]/bz-trail.history[a+1]/az;
        const length = Math.hypot(dx,dy)+.000001;
        const halfWidth = .00065 + p.hue*.00055;
        const nx = -dy/length*halfWidth, ny = dx/length*halfWidth;
        // A feathered ribbon follows this body's history; it has no shared path.
        for (let vertex = 0; vertex < 6; vertex++) {
          const endpoint = vertex===2 || vertex===4 || vertex===5 ? 1 : 0;
          const side = vertex===0 || vertex===3 || vertex===5 ? -1 : 1;
          const index = endpoint ? b : a, depth = endpoint ? bz : az;
          const fade = Math.pow(1-(endpoint ? next : j)/(samples-1),1.6);
          this.trailData[lineOffset++] = trail.history[index]+nx*side*depth;
          this.trailData[lineOffset++] = trail.history[index+1]+ny*side*depth;
          this.trailData[lineOffset++] = trail.history[index+2];
          this.trailData[lineOffset++] = alpha*fade*.78;
          this.trailData[lineOffset++] = p.hue;
          this.trailData[lineOffset++] = side;
        }
      }
    }
    return { points: this.lights.length, vertices: lineOffset / 6 };
  }

  get releasedEnergy() { return this.captureAtRelease; }
}
