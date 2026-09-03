// docs/assets/spellfield.js
//
// The particle field.
//
// Nothing on this page draws a hand, and nothing draws a spell either. Light is
// pulled out of the surrounding dust and into the fingertips the tracker
// reports, and every shape you see is the result of the simulation rather than
// artwork: there are no rings, no flares, no outlines anywhere in this file.
//
// How the light is made
// ---------------------
// Captured particles obey a small fluid model — attraction to the fingertip,
// short-range repulsion from each other, and a little viscosity — so they pack
// the way a liquid would and the mass finds its own radius. They are drawn as
// soft additive blobs, so brightness is simply density: where the packing is
// tightest the channels saturate and the core goes white, and it falls away
// smoothly outward with no edge anywhere. Making the light out of density
// rather than out of drawn shapes is the whole point; a ring or a cross drawn
// by hand always looks drawn.
//
// The gestures
// ------------
//   aim    (index + middle)          light is drawn in over three seconds
//   grab   (index + thumb)           the same, held tighter
//   click  (index + middle + thumb)  the mass bursts
//
// Every particle remembers where it was taken from, and a burst throws it in
// that direction — but nothing pulls it there. It is one action: the mass is
// released, it coasts outward, drag brings it to rest, and wherever it stops is
// simply where that dust now lives. An earlier version added a homing force
// after the throw, which read as a second, uninvited motion.
//
// It stays red while it travels and cools to white as it settles.
//
// The hand can only hold CAPACITY particles. Move a full one and its trailing
// edge is shed and heads home while fresh dust is taken up at the leading edge,
// which is what keeps the whole field circulating.
//
// After a click the field reloads: one second to scatter, one second dead, one
// second before capture is at full rate again.

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in float a_size;
layout(location = 2) in vec3 a_color;
uniform vec2 u_resolution;
out vec3 v_color;
void main() {
  vec2 clip = (a_pos / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = a_size;
  v_color = a_color;
}`;

// A gaussian rather than a clamped disc: a blob with no edge at all, so
// overlapping ones merge into a continuous field instead of a pile of discs.
const FRAG = `#version 300 es
precision highp float;
in vec3 v_color;
out vec4 outColor;
void main() {
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
  float a = exp(-d * d * 2.7);
  outColor = vec4(v_color * a, a);
}`;

const QUAD_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_quad;
out vec2 v_uv;
void main() {
  v_uv = a_quad * 0.5 + 0.5;
  gl_Position = vec4(a_quad, 0.0, 1.0);
}`;

const FADE_FRAG = `#version 300 es
precision highp float;
uniform float u_alpha;
out vec4 outColor;
void main() { outColor = vec4(0.0, 0.0, 0.0, u_alpha); }`;

// Radiance. The compressed mass is not a glowing ball — light escaping a point
// leaves along rays. These are generated, not drawn: the angular profile is a
// sum of sines at incommensurate frequencies, raised to a power so it breaks
// into distinct streaks of uneven length and brightness. That irregularity is
// the whole trick. Four clean spokes read as a graphic; forty uneven ones read
// as light being thrown.
const RAY_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_resolution;
uniform vec2 u_center;
uniform float u_radius;
uniform float u_charge;
uniform float u_time;
uniform float u_burst;
out vec4 outColor;

float hash(float n) {
  return fract(sin(n * 91.3458) * 47453.5453);
}

float beam(float a, float direction, float width) {
  float delta = abs(atan(sin(a - direction), cos(a - direction)));
  return exp(-delta * delta / max(width * width, 0.00001));
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y);
  vec2 q = (p - u_center) / max(u_radius, 1.0);
  float d = length(q);
  if (d > 10.5) { outColor = vec4(0.0); return; }
  float a = atan(q.y, q.x);

  float pulse = 0.94 + 0.06 * sin(u_time * 3.1);
  // Stop spatial growth at approximately the first second of charge. More
  // energy after this point raises brightness without inflating the effect.
  float sizeCharge = min(u_charge, 0.34);
  float sharp = 0.030 / (1.0 + d * 0.42);
  float rays = 0.0;
  // Eight strong but slightly asymmetric beams: unmistakably radial without
  // looking like a geometrically perfect star icon.
  for (int k = 0; k < 8; k++) {
    float fk = float(k);
    float direction = fk * 0.785398 + (hash(fk + 2.0) - 0.5) * 0.19;
    float reach = (2.5 + hash(fk + 8.0) * 3.8) * (0.58 + sizeCharge * 0.72);
    float energy = 0.62 + hash(fk + 19.0) * 0.65;
    rays += beam(a, direction, sharp) * energy * exp(-d / reach);
  }

  // Sparse needle-like fragments between the eight hero beams.
  float needles = pow(max(0.0, sin(a * 19.0 + 1.8) * sin(a * 31.0 - 0.6)), 18.0);
  needles *= exp(-d / (1.2 + sizeCharge * 2.2)) * 0.42;

  float ray = (rays + needles) * smoothstep(0.10, 0.38, d) / (0.34 + d * 0.18);
  // Keep the ring at least about two physical pixels thick. Scaling the whole
  // effect down must not make this sub-pixel feature disappear.
  float ringWidth = max(0.03, 1.1 / max(u_radius, 1.0));
  float ringGrowth = smoothstep(0.035, 0.34, u_charge);
  float ringRadius = mix(0.82, 1.72, ringGrowth) + sin(u_time * 2.4) * mix(0.025, 0.06, ringGrowth);
  float breathingRing = exp(-pow((d - ringRadius) / ringWidth, 2.0)) * mix(0.38, 0.86, ringGrowth);
  // A second, softer halo becomes visible only when the centre is highly
  // charged, making the rings feel like a consequence of the growing light.
  float outerRingRadius = ringRadius * 1.38;
  float outerRing = exp(-pow((d - outerRingRadius) / (ringWidth * 1.35), 2.0));
  outerRing *= smoothstep(0.20, 0.34, u_charge) * 0.34;
  // Begin almost at the core so the viewer can follow the wave travelling
  // outward instead of seeing a detached circle appear at its destination.
  float shockRadius = 0.08 + u_burst * 5.60;
  float shockWidth = ringWidth * (1.0 + u_burst * 0.45);
  float shockRing = exp(-pow((d - shockRadius) / shockWidth, 2.0)) * u_burst * 1.55;
  // A broad red ignition flash bridges the stored core and the departing
  // particles. It rises immediately, then gets out of the way of the wave.
  float ignition = smoothstep(0.0, 0.025, u_burst) * (1.0 - smoothstep(0.16, 0.34, u_burst));
  float redFlash = exp(-d * d * 0.72) * ignition * 2.25;
  float innerGlow = exp(-d * d * 1.9) * 0.72;
  float core = exp(-d * d * 26.0) * 3.1 + exp(-d * d * 96.0) * 4.2;
  float i = (ray * 2.1 + breathingRing + outerRing + shockRing + redFlash + innerGlow + core) * u_charge * pulse;
  if (i < 0.002) { outColor = vec4(0.0); return; }

  // Deep crimson tips, electric-red beams and a compressed near-white heart.
  vec3 col = mix(vec3(0.48, 0.002, 0.025), vec3(1.0, 0.025, 0.075), 1.0 - smoothstep(0.55, 5.8, d));
  col = mix(col, vec3(1.0, 0.30, 0.28), 1.0 - smoothstep(0.16, 0.85, d));
  col = mix(col, vec3(1.0, 0.96, 0.90), 1.0 - smoothstep(0.008, 0.10, d));

  outColor = vec4(col * i, i);
}`;

// Bloom. Density alone gives a bright core with a gradient, but a bright core
// is not yet *light*: what sells light is the halo that spills past its own
// edges. This is the cheap version — bright pass and a separable blur at a
// quarter resolution — added back over the sharp image.
const BRIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_threshold;
out vec4 outColor;
void main() {
  vec4 c = texture(u_tex, v_uv);
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(u_threshold, u_threshold + 0.30, l);
  outColor = c * k;
}`;

const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_dir;
out vec4 outColor;
void main() {
  vec4 sum = texture(u_tex, v_uv) * 0.227027;
  sum += texture(u_tex, v_uv + u_dir * 1.384615) * 0.316216;
  sum += texture(u_tex, v_uv - u_dir * 1.384615) * 0.316216;
  sum += texture(u_tex, v_uv + u_dir * 3.230769) * 0.070270;
  sum += texture(u_tex, v_uv - u_dir * 3.230769) * 0.070270;
  outColor = sum;
}`;

const QUAD_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_alpha;
out vec4 outColor;
void main() { outColor = texture(u_tex, v_uv) * u_alpha; }`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) || 'shader compile failed');
  }
  return shader;
}

function link(gl, vertSource, fragSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vertSource));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fragSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'program link failed');
  }
  return program;
}

/** Loose dust: faint and white, so a full field of it never fights the type. */
const LOOSE = [0.80, 0.82, 0.90];
/** Light under the hand's influence. */
const HOT = [1.0, 0.13, 0.20];
/** What the densest part of the mass burns at. */
const WHITE = [1.0, 0.94, 0.90];

const COUNT = 3400;
/** How many particles a hand can hold. */
const CAPACITY = 560;
/** Seconds to fill an empty hand. */
const FILL_S = 3.0;
/** How long a released particle coasts before it can be picked up again. */
const RETURN_S = 1.1;

// The reload cycle, in seconds.
const SCATTER_S = 1.0;
const DEAD_S = 1.0;
const REGATHER_S = 1.0;

const MAX_ATTRACTORS = 3;

// --- giving ground ----------------------------------------------------------
//
// The field shares the main thread with MediaPipe, and hand inference is not a
// few hundred microseconds — it is most of a frame on its own. Measured here,
// the simulation costs about 5.4ms of a 60Hz frame's 16.7ms with the whole
// field captured; put an inference beside that and the frame is gone.
//
// So the field gives ground rather than stuttering. Of the two ways to spend a
// frame that is too small — fewer particles moving smoothly, or all of them
// moving unevenly — the first looks considerably better, because the count is
// something nobody is watching and the motion is the entire point.
//
// What it reacts to is frames actually being missed, not its own cost. Judging
// by cost needs a budget, and any budget is a guess about a machine: the first
// version used one and thinned the field to half on a machine that was hitting
// 60fps with room to spare, because the number was simply set too low. Frames
// missed is the thing actually worth avoiding, and it needs no guess.
//
/**
 * Frame interval, in ms, above which the field starts giving ground, and below
 * which it fills back in. 20ms is 50fps and 17.5ms is 57fps, so the band sits
 * either side of a 60Hz frame with enough room that ordinary variation does not
 * cross it.
 *
 * Fixed rather than measured against the display's own rate. Learning that rate
 * was tried and is worse than it sounds: rAF hands out the occasional short
 * interval even on a steady 60Hz panel, and one of those is enough to convince
 * a running minimum that every normal frame afterwards is late. On a display
 * genuinely slower than 50Hz this sits at MIN_ACTIVE, which is the right answer
 * anyway on a machine that cannot present frames faster than that.
 */
const SHRINK_ABOVE_MS = 20;
const GROW_BELOW_MS = 17.5;
/** Never thin below this: past it the field stops reading as a field. */
const MIN_ACTIVE = 1500;
/**
 * …and the fewest particles the hand may hold.
 *
 * Thinning the ambient dust alone turned out to relieve the wrong half. The
 * simulation costs 1.7ms per frame with no hand in it and 5.3ms with a hand at
 * full charge, and all of that difference is the fluid, which runs over the
 * *captured* particles only — the ones `active` does not govern. Measured
 * against capacity: 560 costs 5.3ms, 420 costs 3.6ms, 200 costs 2.7ms.
 *
 * Half is as far as it goes. The mass gets less dense rather than smaller,
 * since the visual radius follows `fill`, which is normalised by whatever the
 * capacity currently is.
 */
const MIN_CAPACITY = 280;
/** Captured particles let go per second while shedding down to a new capacity. */
const SHED_PER_S = 190;

// --- fluid constants ---------------------------------------------------------
/** Interaction radius, CSS pixels. Sets the spacing the mass settles at. */
const H = 9.5;
/** Pressure between neighbours. Higher spreads the mass wider. */
const K_REPEL = 420;
/**
 * Attraction, as an inverse square. A particle therefore accelerates as it
 * closes on the fingertip rather than easing in, which is both what gravity
 * does and what makes the gathering feel like it is being pulled rather than
 * animated.
 */
const G_ATTRACT = 900000;
/** Softening length, CSS px: caps the pull so the core cannot blow up. */
const SOFTEN = 42;
/** Velocity sharing between neighbours, which is what makes it read as liquid. */
const K_VISCOSITY = 1.9;

const smoothstep = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export class SpellField {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} [options]
   * @param {boolean} [options.reducedMotion]
   */
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.reducedMotion = reducedMotion;
    this.supported = false;

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      powerPreference: 'low-power',
    });
    if (!gl) return;

    this.gl = gl;
    try {
      this.pointProgram = link(gl, VERT, FRAG);
      this.quadProgram = link(gl, QUAD_VERT, QUAD_FRAG);
      this.fadeProgram = link(gl, QUAD_VERT, FADE_FRAG);
      this.rayProgram = link(gl, QUAD_VERT, RAY_FRAG);
      this.brightProgram = link(gl, QUAD_VERT, BRIGHT_FRAG);
      this.blurProgram = link(gl, QUAD_VERT, BLUR_FRAG);
    } catch (e) {
      return;
    }
    this.supported = true;

    this.px = new Float32Array(COUNT);
    this.py = new Float32Array(COUNT);
    this.vx = new Float32Array(COUNT);
    this.vy = new Float32Array(COUNT);
    this.seed = new Float32Array(COUNT);
    /** 1 once the hand has taken a particle, whether or not it has arrived. */
    this.bound = new Uint8Array(COUNT);
    /** 0 = loose dust, 1 = fully merged into the mass. Distance, not a timer. */
    this.held = new Float32Array(COUNT);
    /** Residual redness once a particle has left the mass. Cools to white. */
    this.heat = new Float32Array(COUNT);
    /** Where this particle was taken from, and must go back to. */
    this.homeX = new Float32Array(COUNT);
    this.homeY = new Float32Array(COUNT);
    /** Seconds left of the journey home. 0 means it is not travelling. */
    this.returning = new Float32Array(COUNT);
    /** 1 while still flying outward from a burst. */
    this.bursting = new Float32Array(COUNT);
    /** Neighbour count, smoothed. Where the mass is densest it burns white. */
    this.density = new Float32Array(COUNT);

    this.positions = new Float32Array(COUNT * 2);
    this.sizes = new Float32Array(COUNT);
    this.colors = new Float32Array(COUNT * 3);

    // Neighbour lookup for the fluid, over the captured particles only.
    this.cellOf = new Int32Array(COUNT);
    this.order = new Int32Array(COUNT);
    /**
     * Which particles are captured, gathered before the grid is built.
     * A separate array because _buildGrid writes `order` while reading this —
     * the two cannot be the same one. It used to be a fresh `order.slice()`
     * every frame, which is 560 elements of garbage per frame for a buffer
     * whose size never changes.
     */
    this.pending = new Int32Array(COUNT);

    /**
     * How many particles are simulated and drawn this frame. Held at COUNT
     * while there is room in the frame and walked down when there is not.
     * Particles are laid out in no spatial order, so thinning by index removes
     * dust evenly across the canvas rather than clearing a region of it.
     */
    this.active = COUNT;
    /**
     * How many particles the hand may hold. Governed alongside `active`,
     * because this is the number the expensive part of the simulation is
     * actually driven by: the fluid runs over the captured particles only, and
     * a denser mass costs more per particle as well as having more of them.
     */
    this.capacity = CAPACITY;
    /** Smoothed frame interval, in ms. What the counts are chosen from. */
    this.frameCost = 0;
    /**
     * How much has been given up, 0 to 1. One number drives both counts so
     * they move together: relieving one and not the other is what the first
     * version of this did, and it relieved the cheaper one.
     */
    this.relief = 0;
    /** Fractional part of the shed rate, carried between frames. */
    this.shedCarry = 0;
    this.cellStart = new Int32Array(1);
    this.cellCount = new Int32Array(1);

    this.vao = this._makeVao();

    this.quadVao = gl.createVertexArray();
    gl.bindVertexArray(this.quadVao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    this.fbo = gl.createFramebuffer();
    this.texture = gl.createTexture();
    this.bloomFbo = [gl.createFramebuffer(), gl.createFramebuffer()];
    this.bloomTex = [gl.createTexture(), gl.createTexture()];

    this.uPointRes = gl.getUniformLocation(this.pointProgram, 'u_resolution');
    this.uQuadTex = gl.getUniformLocation(this.quadProgram, 'u_tex');
    this.uQuadAlpha = gl.getUniformLocation(this.quadProgram, 'u_alpha');
    this.uFadeAlpha = gl.getUniformLocation(this.fadeProgram, 'u_alpha');
    this.uRayRes = gl.getUniformLocation(this.rayProgram, 'u_resolution');
    this.uRayCenter = gl.getUniformLocation(this.rayProgram, 'u_center');
    this.uRayRadius = gl.getUniformLocation(this.rayProgram, 'u_radius');
    this.uRayCharge = gl.getUniformLocation(this.rayProgram, 'u_charge');
    this.uRayTime = gl.getUniformLocation(this.rayProgram, 'u_time');
    this.uRayBurst = gl.getUniformLocation(this.rayProgram, 'u_burst');
    this.uBrightTex = gl.getUniformLocation(this.brightProgram, 'u_tex');
    this.uBrightThreshold = gl.getUniformLocation(this.brightProgram, 'u_threshold');
    this.uBlurTex = gl.getUniformLocation(this.blurProgram, 'u_tex');
    this.uBlurDir = gl.getUniformLocation(this.blurProgram, 'u_dir');

    this.attractors = [];
    this.pointer = null;
    this.mode = 'idle';
    this.pendingRelease = null;
    this.heldCount = 0;
    this.boundCount = 0;
    this.fill = 0;
    this.releaseTime = -Infinity;
    this.burstCenter = null;
    this.absorbCarry = 0;
    this.scanFrom = 0;

    this.time = 0;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;

    this.resize();
    this._seed();
  }

  _makeVao() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    this.posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.sizeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.sizes, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);

    this.colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.colors, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    return vao;
  }

  _seed() {
    for (let i = 0; i < COUNT; i++) {
      this.px[i] = Math.random() * this.width;
      this.py[i] = Math.random() * this.height;
      this.homeX[i] = this.px[i];
      this.homeY[i] = this.py[i];
      this.vx[i] = (Math.random() - 0.5) * 3;
      this.vy[i] = (Math.random() - 0.5) * 3;
      this.seed[i] = Math.random();
      this.bound[i] = 0;
      this.held[i] = 0;
      this.heat[i] = 0;
      this.returning[i] = 0;
      this.bursting[i] = 0;
      this.density[i] = 0;
    }
  }

  resize() {
    if (!this.supported) return;
    const gl = this.gl;
    const rect = this.canvas.getBoundingClientRect();
    // MediaPipe also uses the GPU. Capping render density avoids large Retina
    // canvases stealing frame time while remaining visually sharper than 1x.
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.35);
    this.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // Neighbour grid, one cell per interaction radius.
    this.cell = H * this.dpr;
    this.gridW = Math.max(1, Math.ceil(this.width / this.cell) + 2);
    this.gridH = Math.max(1, Math.ceil(this.height / this.cell) + 2);
    const cells = this.gridW * this.gridH;
    this.cellStart = new Int32Array(cells + 1);
    this.cellCount = new Int32Array(cells);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);

    this.bw = Math.max(1, this.width >> 2);
    this.bh = Math.max(1, this.height >> 2);
    for (let k = 0; k < 2; k++) {
      gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[k]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.bw, this.bh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbo[k]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.bloomTex[k], 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Where the light gathers. Pass the fingertips the current gesture is made
   * of; the light collecting on them is what stands in for the hand.
   *
   * @param {Array<{x:number,y:number}>|null} points canvas-relative CSS pixels
   * @param {'idle'|'aim'|'grab'} mode
   */
  setAttractors(points, mode = 'aim') {
    if (!this.supported) return;
    this.mode = points && points.length ? mode : 'idle';
    this.attractors.length = 0;
    if (!points) return;
    for (let i = 0; i < Math.min(points.length, MAX_ATTRACTORS); i++) {
      this.attractors.push({ x: points[i].x * this.dpr, y: points[i].y * this.dpr });
    }
  }

  /** A passive mouse influence: stirs loose dust but never captures it. */
  setPointer(point) {
    if (!this.supported) return;
    this.pointer = point
      ? { x: point.x * this.dpr, y: point.y * this.dpr }
      : null;
  }

  /**
   * A click. The mass is thrown back toward the dust it was taken from, which
   * is what returns the field to its resting state.
   */
  release(x, y, strength = 1) {
    if (!this.supported) return;
    const power = Math.min(1, Math.max(0, this.fill));
    this.pendingRelease = { x: x * this.dpr, y: y * this.dpr, strength, power };
    this.burstCenter = { x: x * this.dpr, y: y * this.dpr, strength, power };
    this.releaseTime = this.time;
  }

  /** Bucket the captured particles so the fluid can find neighbours cheaply. */
  _buildGrid(indices, n) {
    const { gridW, gridH, cell } = this;
    this.cellCount.fill(0);
    for (let k = 0; k < n; k++) {
      const i = indices[k];
      const cx = Math.min(gridW - 1, Math.max(0, (this.px[i] / cell + 1) | 0));
      const cy = Math.min(gridH - 1, Math.max(0, (this.py[i] / cell + 1) | 0));
      const c = cy * gridW + cx;
      this.cellOf[i] = c;
      this.cellCount[c]++;
    }
    let sum = 0;
    for (let c = 0; c < this.cellCount.length; c++) {
      this.cellStart[c] = sum;
      sum += this.cellCount[c];
      this.cellCount[c] = 0;
    }
    this.cellStart[this.cellCount.length] = sum;
    for (let k = 0; k < n; k++) {
      const i = indices[k];
      const c = this.cellOf[i];
      this.order[this.cellStart[c] + this.cellCount[c]] = i;
      this.cellCount[c]++;
    }
  }

  step(dt) {
    if (!this.supported) return;
    // Before the clamp below: the governor wants to know how long the frame
    // really took, which is exactly what the clamp is there to hide.
    this._governCount(dt * 1000);
    const d = Math.min(dt, 1 / 20);
    this.time += d;
    const active = this.active;

    const t = this.time;
    const dpr = this.dpr;
    const motion = this.reducedMotion ? 0.3 : 1;
    const grabbing = this.mode === 'grab';

    // Every one of these is read or written a dozen times per particle, 3400
    // times a frame. Reached through `this` each time, that is tens of
    // thousands of property loads before a single number is touched; bound to
    // a local once, the loop below reads straight into the typed array.
    const px = this.px;
    const py = this.py;
    const vx = this.vx;
    const vy = this.vy;
    const held = this.held;
    const heat = this.heat;
    const bound = this.bound;
    const seed = this.seed;
    const density = this.density;
    const returning = this.returning;
    const bursting = this.bursting;
    const homeX = this.homeX;
    const homeY = this.homeY;
    const order = this.order;
    const cellStart = this.cellStart;
    const cellCount = this.cellCount;
    const positions = this.positions;
    const sizes = this.sizes;
    const colors = this.colors;
    const gridW = this.gridW;
    const gridH = this.gridH;
    const width = this.width;
    const height = this.height;
    const pointer = this.pointer;

    // The attractors flattened into plain numbers. There are at most three, but
    // the loop below reads them once per particle, and `attractors[a].x` is an
    // array load plus a property load every time.
    const nAttractors = Math.min(this.attractors.length, MAX_ATTRACTORS);
    const attractorX = this._ax || (this._ax = new Float64Array(MAX_ATTRACTORS));
    const attractorY = this._ay || (this._ay = new Float64Array(MAX_ATTRACTORS));
    for (let a = 0; a < nAttractors; a++) {
      attractorX[a] = this.attractors[a].x;
      attractorY[a] = this.attractors[a].y;
    }

    // ---- the reload cycle -------------------------------------------------
    const since = this.time - this.releaseTime;
    let gate = 1;
    let regathering = false;
    if (since < SCATTER_S + DEAD_S) {
      gate = 0;
    } else if (since < SCATTER_S + DEAD_S + REGATHER_S) {
      gate = smoothstep(0, 0.6, (since - SCATTER_S - DEAD_S) / REGATHER_S);
      regathering = true;
    }
    const gathering = this.mode !== 'idle' && this.attractors.length > 0 && gate > 0;

    // How far the hand's influence extends, and how far a particle may stray
    // before it is shed.
    const visualFill = Math.min(this.fill, 1 / 3);
    const spread = (14 + 23 * Math.sqrt(visualFill)) * (grabbing ? 0.82 : 1) * dpr;
    this.spread = spread;
    const grip = spread + (grabbing ? 60 : 84) * dpr;
    const reach = (grabbing ? 250 : 320) * (regathering ? 1.5 : 1) * dpr;

    // Absorption is rate limited, which is what sets the three seconds. It is
    // not a force constant, so the timing does not shift when the physics is
    // retuned.
    this.absorbCarry += (this.capacity / FILL_S) * d * gate * (regathering ? 2.6 : 1);
    let budget = Math.floor(this.absorbCarry);
    this.absorbCarry -= budget;

    const release = this.pendingRelease;
    this.pendingRelease = null;

    // ---- neighbour grid over what is currently captured --------------------
    let nCaptured = 0;
    for (let i = 0; i < active; i++) {
      if (held[i] > 0.15) this.pending[nCaptured++] = i;
    }
    if (nCaptured > 0) this._buildGrid(this.pending, nCaptured);

    const h = this.cell;
    const h2 = h * h;
    // Per-frame, not per-particle: both were recomputed 3400 times a frame.
    const mergeRate = Math.min(1, d * 5);
    const densityRate = Math.min(1, d * 6);
    const softenSq = (SOFTEN * dpr) * (SOFTEN * dpr);
    let massCount = 0;
    let boundCount = 0;
    let room = Math.max(0, this.capacity - this.boundCount);

    // Lowering the capacity does not on its own let anything go. A bound
    // particle is only shed when the hand moves away from it, so a hand held
    // still would keep the whole mass and the relief would never actually
    // arrive. Release the excess deliberately, rate limited so it reads as the
    // hand letting dust go — which is a thing it already does — rather than as
    // the light flickering.
    let shedBudget = 0;
    if (this.boundCount > this.capacity) {
      this.shedCarry += SHED_PER_S * d;
      shedBudget = Math.min(this.boundCount - this.capacity, Math.floor(this.shedCarry));
      this.shedCarry -= shedBudget;
    } else {
      this.shedCarry = 0;
    }
    const start = this.scanFrom % active;
    this.scanFrom = (this.scanFrom + 137) % active;

    for (let n = 0; n < active; n++) {
      const i = (start + n) % active;
      const s = seed[i];

      // Ambient drift, slow: any motion a visitor notices should be motion
      // their own hand caused.
      const angle = Math.sin(px[i] * 0.0015 + t * 0.2 + s * 6.28) +
                    Math.cos(py[i] * 0.0013 - t * 0.16 + s * 3.14);
      let ax = Math.cos(angle * 2.1) * 5 * motion;
      let ay = Math.sin(angle * 2.1) * 5 * motion;
      let cursorLight = 0;

      // Before hand tracking starts, the mouse only ripples nearby ambient
      // dust. It cannot bind particles, charge a glow or trigger a release.
      if (!bound[i] && pointer) {
        const mdx = px[i] - pointer.x;
        const mdy = py[i] - pointer.y;
        // sqrt of the sum rather than Math.hypot: identical here (these are
        // screen pixels, nowhere near overflowing) and measurably cheaper at
        // one call per particle per frame.
        const md = Math.sqrt(mdx * mdx + mdy * mdy);
        const mouseReach = 105 * dpr;
        if (md > 0.5 && md < mouseReach) {
          const proximity = 1 - md / mouseReach;
          const influence = proximity * 42 * motion;
          // The touched dust lights red at the point of interaction. This is a
          // visual response only: no particle is captured or charged.
          cursorLight = proximity * proximity;
          ax += (mdx / md) * influence - (mdy / md) * influence * 0.42;
          ay += (mdy / md) * influence + (mdx / md) * influence * 0.42;
        }
      }

      let nearest = -1;
      let nearestDist = Infinity;
      if (gathering) {
        for (let a = 0; a < nAttractors; a++) {
          const dx = attractorX[a] - px[i];
          const dy = attractorY[a] - py[i];
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = a;
          }
        }
      }

      const boundBefore = bound[i];
      let inMass = false;
      let arriving = false;

      if (bound[i]) {
        // Over capacity: this one goes, on the same path as a particle the hand
        // has moved away from.
        if (shedBudget > 0) {
          shedBudget--;
          bound[i] = 0;
          held[i] = 0;
          returning[i] = RETURN_S;
        } else if (nearest >= 0 && nearestDist < reach * 1.3) {
          boundCount++;
          const inside = nearestDist < grip;
          arriving = !inside;
          // Merge is a function of where the particle is, not of how long it
          // has been bound.
          const merge = inside ? 1 : 0.12;
          held[i] += (merge - held[i]) * mergeRate;
          if (held[i] > 0.5) {
            massCount++;
            inMass = true;
          }
          heat[i] = Math.max(heat[i], held[i]);

          const dx = attractorX[nearest] - px[i];
          const dy = attractorY[nearest] - py[i];

          // Attraction as an inverse square, so the pull strengthens the whole
          // way in and the mass keeps compressing toward the centre. The
          // softening term is what stops it diverging at r = 0.
          const r2 = dx * dx + dy * dy;
          const rr = Math.sqrt(r2) + 1e-4;
          const soft = Math.max(r2, softenSq);
          const g = G_ATTRACT / soft;
          ax += (dx / rr) * g;
          ay += (dy / rr) * g;

          if (inside) {

          // Repulsion and viscosity from neighbours. The equilibrium between
          // this and the pull above is what gives the mass its radius, and the
          // reason it behaves like a body of liquid rather than a cloud.
          let neighbours = 0;
          // None of these four change while the neighbours are scanned, and the
          // scan visits nine cells. Read inside it they were the single most
          // repeated memory access in the whole simulation.
          const pxi = px[i];
          const pyi = py[i];
          const vxi = vx[i];
          const vyi = vy[i];
          const cx = Math.min(gridW - 1, Math.max(0, (pxi / h + 1) | 0));
          const cy = Math.min(gridH - 1, Math.max(0, (pyi / h + 1) | 0));
          for (let oy = -1; oy <= 1; oy++) {
            const ry = cy + oy;
            if (ry < 0 || ry >= gridH) continue;
            const rowBase = ry * gridW;
            for (let ox = -1; ox <= 1; ox++) {
              const rx = cx + ox;
              if (rx < 0 || rx >= gridW) continue;
              const c = rowBase + rx;
              const from = cellStart[c];
              const to = from + cellCount[c];
              for (let k = from; k < to; k++) {
                const j = order[k];
                if (j === i) continue;
                const rxd = pxi - px[j];
                const ryd = pyi - py[j];
                const r2 = rxd * rxd + ryd * ryd;
                if (r2 >= h2 || r2 < 1e-6) continue;
                const r = Math.sqrt(r2);
                const w = 1 - r / h;
                neighbours += w;
                const push = (K_REPEL * w * w) / r;
                ax += rxd * push;
                ay += ryd * push;
                ax += (vx[j] - vxi) * K_VISCOSITY * w;
                ay += (vy[j] - vyi) * K_VISCOSITY * w;
              }
            }
          }
          // Temperature follows compression: the crush at the centre is what
          // turns the light white, and it cools back to red toward the edge.
          density[i] += (neighbours - density[i]) * densityRate;
          }
        } else {
          // Shed: the hand moved on. Head home, still warm.
          bound[i] = 0;
          held[i] = 0;
          returning[i] = RETURN_S;
        }
      } else if (
        gathering &&
        room > 0 &&
        budget > 0 &&
        returning[i] === 0 &&
        nearest >= 0 &&
        nearestDist < reach
      ) {
        homeX[i] = px[i];
        homeY[i] = py[i];
        bound[i] = 1;
        room--;
        budget--;
        boundCount++;
        arriving = true;
      }

      // ---- the burst ---------------------------------------------------------
      if (release && boundBefore) {
        // Thrown toward the place it came from, not merely let go. The whole
        // mass flies outward along the paths it arrived by.
        const angle = i * 2.399963 + (s - 0.5) * 0.12;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const startRadius = (1.5 + s * 4.5) * dpr;
        px[i] = release.x + dirX * startRadius;
        py[i] = release.y + dirY * startRadius;
        // All the pressure in the compressed mass is let go at once, so the
        // particle leaves at its highest speed and decelerates the whole way
        // out. The initial speed is chosen so that drag alone carries it about
        // as far as it came from — no correction is applied afterwards.
        // A blast occupies the whole radius, not only its outer shell. The
        // power curve leaves plenty of slow embers near the cast centre while
        // the high-seed tail still travels to the full explosion range.
        const castPower = 0.22 + release.power * 0.78;
        const band = (s * 13.37 + i * 0.754877666) % 1;
        // One continuous, outward-weighted speed gradient. The exponent below
        // one keeps a few particles near the core but places progressively
        // more of them toward the far edge, without creating two speed bands.
        const baseSpeed = 3.5 + 54.5 * Math.pow(band, 0.38);
        const speed = baseSpeed * release.strength * castPower;
        vx[i] = dirX * speed;
        vy[i] = dirY * speed;
        bound[i] = 0;
        held[i] = 0;
        heat[i] = 0.20 + release.power * 0.80;
        returning[i] = RETURN_S;
        bursting[i] = 1;
        if (inMass) massCount--;
        boundCount--;
        inMass = false;
        arriving = false;
      }

      // ---- coasting -----------------------------------------------------------
      // No force here. `returning` is only a cooldown that keeps a particle
      // from being picked straight back up while it is still flying; drag alone
      // decides where it stops.
      if (returning[i] > 0) {
        returning[i] = Math.max(0, returning[i] - d);
        // Fade the cast state continuously instead of dropping from 1 to 0 at
        // the end. Size, brightness, red heat and drag can now all finish the
        // same uninterrupted gradient back to an ambient white particle.
        if (bursting[i] > 0) {
          bursting[i] = returning[i] / RETURN_S;
        }
      }

      // Still burning while it flies; it cools to white only once the throw is
      // spent, so a burst reads as red light thrown outward that fades on the
      // way rather than as white sparks from the start.
      if (!bound[i]) {
        const cool = 1.8 - bursting[i] * 1.58;
        heat[i] *= Math.max(0, 1 - d * cool);
      }
      if (!inMass) density[i] *= Math.max(0, 1 - d * 4);

      const damp = arriving
        ? 0.965
        : inMass
          ? 0.86
          : bursting[i] > 0
            // Enough drag to be seen slowing down over the scatter second.
            ? 0.982
            : returning[i] > 0
              ? 0.9
              : 0.935;
      vx[i] = (vx[i] + ax * d) * damp;
      vy[i] = (vy[i] + ay * d) * damp;

      const speed = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      const cap = bursting[i] > 0 ? 225 : 44;
      if (speed > cap) {
        vx[i] = (vx[i] / speed) * cap;
        vy[i] = (vy[i] / speed) * cap;
      }
      px[i] += vx[i] * d * 34;
      py[i] += vy[i] * d * 34;

      // Loose dust wraps, so the field reads as continuing past the edges. A
      // particle on its way home must not, or it would never arrive.
      if (returning[i] === 0 && !bound[i]) {
        if (px[i] < -20) px[i] = width + 20;
        else if (px[i] > width + 20) px[i] = -20;
        if (py[i] < -20) py[i] = height + 20;
        else if (py[i] > height + 20) py[i] = -20;
        homeX[i] = px[i];
        homeY[i] = py[i];
      }

      // ---- appearance ---------------------------------------------------------
      const warm = Math.max(held[i], heat[i]);
      const i2 = i * 2;
      const i3 = i * 3;

      // Loose dust close to the mass catches its light: a sparse scatter of
      // small red embers, rather than a clean circular edge around the effect.
      let ember = 0;
      if (!inMass && gathering && nearestDist < Infinity) {
        ember = smoothstep(spread * 5.0, spread * 1.1, nearestDist) * this.fill * (0.35 + s * 0.65);
      }

      positions[i2] = px[i];
      positions[i2 + 1] = py[i];
      // Captured particles are wide and soft. They are not meant to be seen
      // individually: overlapping, they add up into one body of light.
      const burstGlow = bursting[i] * heat[i];
      sizes[i] = (1.8 + s * 1.0 + warm * 10.0 + ember * 1.1 + burstGlow * 4.5 + cursorLight * 4.0) * dpr;

      // A merged particle contributes very little on its own. Hundreds of them
      // overlapping is what produces the light, so the saturated core stays
      // small and everything outside it is a smooth density gradient. Making
      // each one bright instead would blow out the whole mass into a flat disc.
      // A merged particle contributes little on its own; hundreds overlapping
      // are what make the light, so the saturated core stays small and
      // everything outside it is a smooth density gradient.
      const hotness = smoothstep(12, 28, density[i]);
      const brightness = 0.40 * (1 - warm) + warm * (0.05 + hotness * 0.115) + ember * 0.55 + burstGlow * 0.38 + cursorLight * 0.62;
      const tone = Math.max(warm, ember, cursorLight);
      for (let c = 0; c < 3; c++) {
        const tint = HOT[c] * (1 - hotness) + WHITE[c] * hotness;
        colors[i3 + c] = (LOOSE[c] * (1 - tone) + tint * tone) * brightness;
      }
    }

    this.heldCount = Math.max(0, massCount);
    this.boundCount = Math.max(0, boundCount);
    const target = this.heldCount / this.capacity;
    const rate = target > this.fill ? 3.2 : 9;
    this.fill += (target - this.fill) * Math.min(1, d * rate);
  }

  /**
   * Choose how much of the field to simulate, from whether frames are landing.
   *
   * Smoothed, because one slow frame is usually something else on the page — a
   * layout, a garbage collection — and reacting to it would make the count
   * jitter for no reason. Asymmetric, because the two directions are not
   * equally urgent: ground has to be given while frames are still being missed,
   * and taken back slowly enough that nobody watches the field refill.
   *
   * @param {number} frameMs interval since the previous frame
   */
  _governCount(frameMs) {
    // A tab that was backgrounded, or a breakpoint, produces a gap that says
    // nothing about how the page is performing.
    if (!(frameMs > 3 && frameMs < 100)) return;
    this.frameCost = this.frameCost === 0
      ? frameMs
      : this.frameCost + (frameMs - this.frameCost) * 0.1;

    // Three times quicker to give ground than to take it back. Frames are
    // being missed while it gives, and nobody should watch the field refill.
    if (this.frameCost > SHRINK_ABOVE_MS) {
      this.relief = Math.min(1, this.relief + 0.012);
    } else if (this.frameCost < GROW_BELOW_MS) {
      this.relief = Math.max(0, this.relief - 0.004);
    }
    this.active = Math.round(COUNT + (MIN_ACTIVE - COUNT) * this.relief);
    this.capacity = Math.round(CAPACITY + (MIN_CAPACITY - CAPACITY) * this.relief);
  }

  render() {
    if (!this.supported) return;
    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ZERO, gl.SRC_ALPHA);
    gl.useProgram(this.fadeProgram);
    gl.uniform1f(this.uFadeAlpha, 0.86);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.pointProgram);
    gl.uniform2f(this.uPointRes, this.width, this.height);
    gl.bindVertexArray(this.vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.positions);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.sizes);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.colors);
    gl.drawArrays(gl.POINTS, 0, this.active);

    // ---- radiance -----------------------------------------------------------
    // Drawn into the same buffer as the particles and before the bright pass,
    // so the bloom picks the rays up too and they bleed rather than sit flat.
    if (this.fill > 0.02 && this.attractors.length > 0) {
      gl.useProgram(this.rayProgram);
      gl.uniform2f(this.uRayRes, this.width, this.height);
      gl.uniform1f(this.uRayTime, this.time);
      gl.uniform1f(this.uRayCharge, Math.min(1, this.fill) / Math.sqrt(this.attractors.length));
      gl.uniform1f(this.uRayRadius, Math.min(this.spread || 22, 28 * this.dpr));
      gl.uniform1f(this.uRayBurst, 0);
      gl.bindVertexArray(this.quadVao);
      for (const a of this.attractors) {
        gl.uniform2f(this.uRayCenter, a.x, a.y);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
    }

    // A short shock ring remains at the exact cast centre after the gathered
    // mass has been released. Its normalized phase drives the ring outward.
    const burstAge = this.time - this.releaseTime;
    if (this.burstCenter && burstAge >= 0 && burstAge < 0.72) {
      const phase = burstAge / 0.72;
      const envelope = (1 - phase) * this.burstCenter.strength;
      const power = this.burstCenter.power;
      const visiblePower = 0.06 + power * 0.94;
      gl.useProgram(this.rayProgram);
      gl.uniform2f(this.uRayRes, this.width, this.height);
      gl.uniform2f(this.uRayCenter, this.burstCenter.x, this.burstCenter.y);
      gl.uniform1f(this.uRayRadius, (10 + 18 * Math.sqrt(power)) * this.dpr);
      gl.uniform1f(this.uRayCharge, Math.max(0.015, envelope * visiblePower));
      gl.uniform1f(this.uRayTime, this.time);
      gl.uniform1f(this.uRayBurst, phase);
      gl.bindVertexArray(this.quadVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // ---- bloom -------------------------------------------------------------
    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.quadVao);
    gl.activeTexture(gl.TEXTURE0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbo[0]);
    gl.viewport(0, 0, this.bw, this.bh);
    gl.useProgram(this.brightProgram);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uBrightTex, 0);
    gl.uniform1f(this.uBrightThreshold, 0.22);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(this.blurProgram);
    gl.uniform1i(this.uBlurTex, 0);
    // Two separable passes, and then two more at a wider step, which gives a
    // much broader falloff than one pass can without a large kernel.
    const spread = [1, 2.6];
    for (const mul of spread) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbo[1]);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[0]);
      gl.uniform2f(this.uBlurDir, mul / this.bw, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomFbo[0]);
      gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[1]);
      gl.uniform2f(this.uBlurDir, 0, mul / this.bh);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    // ---- to the screen ------------------------------------------------------
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.useProgram(this.quadProgram);
    gl.uniform1i(this.uQuadTex, 0);

    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(this.uQuadAlpha, 1.0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.blendFunc(gl.ONE, gl.ONE);
    gl.uniform1f(this.uQuadAlpha, 1.35);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomTex[0]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindVertexArray(null);
  }
}
