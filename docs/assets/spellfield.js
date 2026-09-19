// docs/assets/spellfield.js
//
// The hero field.
//
// Nothing on this page draws a hand, and nothing draws a spell either. Every
// shape on screen is a consequence of the simulation rather than artwork: there
// are no rings, no flares and no outlines anywhere in this file, and the two
// places one crept in are commented where they were taken back out.
//
// What it is made of
// ------------------
// Two layers, and the order matters. The field itself is a full-screen pass
// whose light is the iso-contours of a smooth scalar field — long unbroken
// streamlines that belong to one flow, because contours of a scalar field
// cannot cross or end. Suspended in it is a thin scatter of points: highlights
// within the volume, and the material the hand actually gathers.
//
// It used to be the other way round, three thousand points carrying the whole
// image. However slowly they were made to move, a field of independent dots
// reads as a swarm, and the page needs the opposite of that.
//
// The sequence
// ------------
// Seven states, all of them readings of one number — `charge`, which rises only
// while a gesture is held and falls back when it is not:
//
//   Ambient      nobody is touching it, and it still has to be worth looking at
//   Detection    something is present; the field acknowledges it and no more
//   Attraction   space bends toward the hand, hard near it and barely far away
//   Compression  wide, pale and slow becomes narrow, bright and fast
//   Silence      a fifth of a second with the motion taken out and the lights down
//   Rupture      it collapses further, then fails: flash, then a wave outward
//   Afterglow    the residue, and the flow reassembling over a few seconds
//
// No stage adds an effect on top of the one before it. Each is the same field
// being deformed — attraction bends the space the contours are sampled in,
// compression contracts it, the rupture drives a displacement wave through it —
// which is what makes the sequence read as cause and effect rather than as a
// playlist. The loudest moment is set up by the quietest: take the Silence out
// and the burst is merely bright; leave it in and it lands.
//
// The gestures
// ------------
//   aim    (index + middle)          the field is drawn in and compressed
//   grab   (index + thumb)           stirs, but never charges: it is for scrolling
//   click  (index + middle + thumb)  ruptures, if there is enough charge to
//
// That last condition is the whole of the "do not let them detonate it by
// accident" rule. A hero that explodes on every click teaches nothing about
// cause, and this page is also a working demo where aiming at a button for two
// seconds is something visitors do constantly. A hold alone therefore stops
// short of the top (HOLD_CAP) and a click below RUPTURE_AT only disperses.
//
// The hand can hold CAPACITY particles. Move a full one and its trailing edge
// is shed and cools while fresh dust is taken up at the leading edge, which is
// what keeps the field circulating. After a rupture it reloads: one second to
// scatter, one dead, one before capture is at full rate again. Long-term
// density is repaired separately, by moving an unnoticed surplus point into the
// emptiest area almost dark and letting its glow develop over several seconds.
// No light flies back and nothing pops.

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_pos;
layout(location = 1) in float a_size;
layout(location = 2) in vec3 a_color;
layout(location = 3) in float a_appearance;
uniform vec2 u_resolution;
out vec3 v_color;
out float v_appearance;
void main() {
  vec2 clip = (a_pos / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  float reveal = smoothstep(0.0, 1.0, a_appearance);
  // Keep the final halo footprint and fade only its luminance. Growing a tiny
  // point into a light looked like a kernel popping into existence.
  gl_PointSize = a_size;
  v_color = a_color;
  v_appearance = reveal;
}`;

// A gaussian rather than a clamped disc: a blob with no edge at all, so
// overlapping ones merge into a continuous field instead of a pile of discs.
const FRAG = `#version 300 es
precision highp float;
in vec3 v_color;
in float v_appearance;
uniform float u_exposure;
out vec4 outColor;
void main() {
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
  // A small bright body inside a much wider, dim halo. The explicit edge mask
  // reaches zero before the point-sprite boundary; without it the Gaussian was
  // still visibly bright where WebGL cut the square off, so each light read as
  // a sharply outlined grain instead of illumination.
  float core = exp(-d * d * 3.8);
  float halo = exp(-d * d * 1.35);
  float edge = 1.0 - smoothstep(0.72, 1.0, d);
  float a = (core * 0.78 + halo * 0.22) * edge;
  // Boost RGB only. Alpha still describes the current particle footprint, so
  // this adds light without bringing temporal trails back.
  outColor = vec4(v_color * a * u_exposure * v_appearance, a * v_appearance);
}`;

const QUAD_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_quad;
out vec2 v_uv;
void main() {
  v_uv = a_quad * 0.5 + 0.5;
  gl_Position = vec4(a_quad, 0.0, 1.0);
}`;

// The field itself.
//
// Everything the page looks like when nobody is touching it is this one pass.
// It is deliberately not made of particles: a thousand independent dots read as
// a swarm no matter how they are tuned, and a swarm is the one thing this hero
// must not look like. What reads as an energy field instead is *continuity* —
// long unbroken lines of light that clearly belong to a single flow.
//
// So the lines are not drawn. A smooth scalar field psi is evaluated per pixel
// and the lines are its iso-contours. Contours of a scalar field are exactly
// the streamlines of the curl flow beneath it, which is why they never cross,
// never end in mid-air, and bend as one sheet when the field is disturbed —
// the three properties that separate a flow from a scatter. Bending the space
// psi is sampled in therefore bends every line at once, consistently, for free.
//
// That is the whole mechanism of the hero. Attraction bends the sample space
// toward the hand; compression contracts it; the rupture pushes a displacement
// wave outward through it. No stage adds an effect on top — each one is the
// same field being deformed, which is what makes the sequence read as cause
// and effect rather than as a playlist of animations.
const FLOW_FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_resolution;
/** Attractor, normalised 0..1 with y down, matching the rest of the file. */
uniform vec2 u_center;
/**
 * The flow's own clock. Advanced by the host rather than taken from the frame
 * time, so Compression can speed it up and Silence can stop it dead without
 * this shader knowing that either state exists.
 */
uniform float u_time;
/** 0..1, how strongly space bends toward the hand. */
uniform float u_pull;
/** 0..1, how far the field has been contracted into the core. */
uniform float u_compress;
/** Rupture wave position, 0..1 across its travel. 0 = no wave. */
uniform float u_shock;
/** Global multiplier. Silence uses it to take the field down a stop. */
uniform float u_dim;
out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int k = 0; k < 4; k++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return s;
}

/**
 * One sheet of streamlines.
 *
 * The contour spacing is measured in screen space with fwidth, so the lines
 * stay the same visual weight wherever the field happens to be steep. Without
 * it, the places where psi changes fastest turn into a grey wash of aliased
 * contours, and those are precisely the places the hand is pulling hardest —
 * the image would fall apart exactly where it most needs to hold together.
 */
float sheet(vec2 p, float lines, float thickness) {
  float psi = fbm(p) * lines;
  float w = fwidth(psi);
  // A sheet whose contours have collapsed below pixel spacing has no legible
  // line left in it, only noise. Fade it out rather than let it alias.
  float legible = 1.0 - smoothstep(0.28, 0.62, w);
  float band = abs(fract(psi) - 0.5) * 2.0;
  float edge = thickness + w * 1.6;
  return (1.0 - smoothstep(0.0, min(edge, 0.94), band)) * legible;
}

void main() {
  vec2 res = u_resolution;
  float aspect = res.x / max(res.y, 1.0);
  // y down, so this agrees with setAttractors and with the DOM.
  vec2 q = vec2(v_uv.x, 1.0 - v_uv.y);
  vec2 p = vec2(q.x * aspect, q.y);
  vec2 c = vec2(u_center.x * aspect, u_center.y);

  vec2 toCentre = c - p;
  float dist = length(toCentre);
  vec2 dir = toCentre / max(dist, 0.0001);

  // ---- the deformation ----------------------------------------------------
  //
  // Near space responds hard and immediately, far space barely and late. That
  // gradient is the entire read of "the hand has weight": a uniform pull moves
  // the image, a graded one bends it, and only the second looks like a field.
  float grip = 1.0 / (1.0 + dist * dist * 26.0);
  float draw = u_pull * grip;

  // Toward the hand, and around it. The rotation is what makes the lines
  // *curve* in rather than slide in; pure radial displacement only squeezes the
  // picture and reads as a lens, not as an attraction.
  float swirl = draw * 1.15 * (1.0 - u_compress * 0.35);
  float cs = cos(swirl);
  float sn = sin(swirl);
  vec2 rel = p - c;
  rel = vec2(rel.x * cs - rel.y * sn, rel.x * sn + rel.y * cs);
  // Contraction toward the core. Compression drives this much harder than
  // attraction does: it is the term that turns wide-and-pale into
  // narrow-and-bright, because pulling the sample space inward packs the
  // contours together without raising any single line's brightness directly.
  rel *= 1.0 - draw * 0.30 - u_compress * grip * 0.52;
  vec2 sp = c + rel;

  // The rupture, as a displacement wave rather than a drawn ring: space itself
  // is shoved outward in a travelling shell, so the lines it passes through
  // stretch and snap back. A drawn ring expanding over a still field always
  // looks like a decal laid on top of it.
  float shockR = u_shock * 1.9;
  float wave = 0.0;
  if (u_shock > 0.0) {
    float width = 0.055 + u_shock * 0.16;
    wave = exp(-pow((dist - shockR) / width, 2.0)) * (1.0 - u_shock);
    sp -= dir * wave * 0.34;
  }

  // ---- the sheets ---------------------------------------------------------
  //
  // Three, at different scales and drifting at different rates. The parallax is
  // the depth: nothing here is actually layered in z, but sheets that slide
  // past each other at different speeds are read as being at different
  // distances, and that is the only cue the image needs.
  vec2 stretch = vec2(0.20, 1.15);

  float far = sheet(sp * 0.85 * stretch + vec2(u_time * 0.011, u_time * 0.004), 3.2, 0.22);
  float mid = sheet(sp * 1.45 * stretch + vec2(-u_time * 0.019, u_time * 0.008 + 31.7), 4.2, 0.16);
  float near = sheet(sp * 2.40 * stretch + vec2(u_time * 0.031, -u_time * 0.014 + 73.2), 5.4, 0.11);

  // ---- haze ---------------------------------------------------------------
  // Very low frequency and with no contours of its own: the medium the lines
  // are suspended in. Without it the streamlines float on black and the hero
  // reads as a wireframe rather than as lit space.
  float haze = fbm(sp * 0.85 + vec2(u_time * 0.008, u_time * 0.004));
  haze = smoothstep(0.32, 0.95, haze);

  // Energy concentrates where the hand is, and the concentration sharpens as
  // compression proceeds: the same light occupying less and less of the screen.
  float halo = exp(-dist * dist * mix(3.4, 26.0, u_compress));
  float focus = 1.0 + (u_pull * 1.5 + u_compress * 5.0) * halo;

  // A slow breath across the whole field. It is under a tenth of a stop, and it
  // is the difference between a still image and one that is alive untouched.
  float breath = 0.93 + 0.07 * sin(u_time * 0.21) * (1.0 - u_compress);

  float lines = far * 0.34 + mid * 0.40 + near * 0.26;

  // Bright near the energy, dark at the edges of the frame. The falloff opens
  // up as the hand takes hold, so Attraction is partly the field reaching
  // further out — more of the screen becomes involved, not just brighter.
  float reach = mix(0.78, 1.40, u_pull);
  float presence = 0.30 + 0.70 * exp(-dist * dist / (reach * reach));

  float intensity = (lines * (0.52 + haze * 0.64) + haze * 0.085) * presence * focus * breath;
  // The wave brightens the streamlines it is passing through, far more than it
  // brightens the space between them. That is the difference between a shape
  // travelling *over* the field and a disturbance travelling *through* it: the
  // front inherits the field's own irregularity instead of being a clean
  // annulus of its own, and what the eye follows is the lines being shoved.
  intensity += wave * (0.22 + lines * 2.1) * (0.7 + u_shock * 0.9);

  if (intensity < 0.0015) { outColor = vec4(0.0); return; }

  // ---- colour -------------------------------------------------------------
  // One world, graded by how close to the energy a pixel is: deep crimson at
  // the edges of the screen, the page's own red through the body of the field,
  // and white only where it is genuinely hot. Keeping the far field dark is
  // what lets the hero sit behind type without fighting it.
  vec3 col = vec3(0.33, 0.035, 0.075);
  col = mix(col, vec3(1.0, 0.26, 0.34), smoothstep(0.0, 0.85, lines));
  col = mix(col, vec3(1.0, 0.74, 0.42), halo * (u_pull * 0.45 + u_compress * 0.55));
  col = mix(col, vec3(1.0, 0.97, 0.94), halo * u_compress * 0.72);

  outColor = vec4(col * intensity * u_dim, intensity * u_dim);
}`;

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
uniform float u_exposure;
/** 0..1 across State 3. Contracts the rings and concentrates the core. */
uniform float u_compress;
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

  // The spokes belong to light being held, not to light that has already
  // left. Once the wave is away they are the most graphic thing on screen and
  // they anchor the eye to a static star while everything else is moving
  // outward — so they go, and the departing particles carry the radial read.
  float ray = (rays + needles) * smoothstep(0.10, 0.38, d) / (0.34 + d * 0.18);
  ray *= 1.0 - smoothstep(0.04, 0.42, u_burst);
  // Keep the ring at least about two physical pixels thick. Scaling the whole
  // effect down must not make this sub-pixel feature disappear.
  float ringWidth = max(0.03, 1.1 / max(u_radius, 1.0));
  float ringGrowth = smoothstep(0.035, 0.34, u_charge);
  // Gathering widens the rings; compression then pulls them back in hard.
  //
  // This direction was wrong for a long time and it mattered more than it
  // looks. Energy arriving made the rings grow, so the more the field gave up
  // to the hand the *larger* and softer the result got — which is the shape of
  // something venting, not something being squeezed. Contracting the radius
  // while the brightness below climbs is the whole read of compression: less
  // space, more light, and the two changing together.
  float squeeze = 1.0 - u_compress * 0.68;
  float ringRadius = (mix(0.82, 1.72, ringGrowth)) * squeeze
    + sin(u_time * 2.4) * mix(0.025, 0.06, ringGrowth) * (1.0 - u_compress);
  float breathingRing = exp(-pow((d - ringRadius) / ringWidth, 2.0))
    * mix(0.38, 0.86, ringGrowth) * (1.0 + u_compress * 1.9);
  // A second, softer halo becomes visible only when the centre is highly
  // charged, making the rings feel like a consequence of the growing light.
  float outerRingRadius = ringRadius * 1.38;
  float outerRing = exp(-pow((d - outerRingRadius) / (ringWidth * 1.35), 2.0));
  outerRing *= smoothstep(0.20, 0.34, u_charge) * 0.34 * (1.0 + u_compress * 1.4);
  // Both rings belong to containment. Once containment has failed they are
  // circles concentric with the departing wave, and three concentric circles is
  // a target.
  float contained = 1.0 - smoothstep(0.0, 0.12, u_burst);
  breathingRing *= contained;
  outerRing *= contained;
  // Begin almost at the core so the viewer can follow the wave travelling
  // outward instead of seeing a detached circle appear at its destination.
  //
  // Not a ring, though. A thin bright circle is a drawn primitive and at this
  // size it reads as a sigil — the one thing this hero may not look like.
  // Perturbing its radius was tried and is worse: a lobed closed curve is still
  // a closed curve, and it reads as an atom. The fix is to have no locatable
  // edge at all. The front widens steeply as it travels and its peak falls off
  // with it, so what crosses the screen is a band of brightness rather than a
  // line, and there is nothing left for the eye to trace.
  float shockRadius = 0.08 + u_burst * 5.60;
  float shockWidth = ringWidth * (1.0 + u_burst * 16.0);
  // Asymmetric across the front: steep on the outside, with a long decaying
  // tail drawn back toward the centre. That profile is what a pressure wave
  // actually has, and it is also what stops this reading as a ring — a ring has
  // two edges the eye can find, and this has one.
  float sd = (d - shockRadius) / shockWidth;
  float falloff = sd > 0.0 ? 3.0 : 0.45;
  float shockRing = exp(-sd * sd * falloff)
    * u_burst * 0.42 * (1.0 - smoothstep(0.25, 1.0, u_burst));
  // A broad red ignition flash bridges the stored core and the departing
  // particles. It rises immediately, then gets out of the way of the wave.
  float ignition = smoothstep(0.0, 0.025, u_burst) * (1.0 - smoothstep(0.16, 0.34, u_burst));
  float redFlash = exp(-d * d * 0.72) * ignition * 2.25;
  float emptied = 1.0 - smoothstep(0.02, 0.30, u_burst);
  float innerGlow = exp(-d * d * mix(1.9, 7.4, u_compress)) * 0.72 * emptied;
  float core = (exp(-d * d * mix(26.0, 74.0, u_compress)) * (3.1 + u_compress * 2.6)
    + exp(-d * d * mix(96.0, 260.0, u_compress)) * (4.2 + u_compress * 5.4)) * emptied;
  float i = (ray * 2.1 + breathingRing + outerRing + shockRing + redFlash + innerGlow + core) * u_charge * pulse;
  if (i < 0.002) { outColor = vec4(0.0); return; }

  // Deep crimson tips, electric-red beams and a compressed near-white heart.
  vec3 col = mix(vec3(0.48, 0.002, 0.025), vec3(1.0, 0.025, 0.075), 1.0 - smoothstep(0.55, 5.8, d));
  col = mix(col, vec3(1.0, 0.30, 0.28), 1.0 - smoothstep(0.16, 0.85, d));
  col = mix(col, vec3(1.0, 0.96, 0.90), 1.0 - smoothstep(0.008, 0.10, d));

  outColor = vec4(col * i * u_exposure, i);
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

// The dust is no longer the field.
//
// Ambient light is the flow pass above; these points are highlights scattered
// through it — the glints a real volume of illuminated dust would throw, and
// the material the hand actually gathers. Two thirds of them went away when the
// flow arrived, because a full field of them competed with the streamlines and
// dragged the image back toward the particle demo the flow exists to replace.
// What is left also costs a third less per frame, which MediaPipe spends.
const COUNT = 1200;
/**
 * How many particles a hand can hold.
 *
 * Cut hard when the flow arrived, and for two reasons that turn out to be the
 * same reason. At 380 out of 1200 the hand ended up holding a third of every
 * grain on screen: the surrounding field visibly emptied while it charged,
 * which is the opposite of a field being concentrated, and the core itself
 * stopped being a core — several hundred overlapping sprites saturate the
 * buffer, the bright pass takes all of it, and two blur passes turn what should
 * be a small dense nucleus into a sun a quarter of the screen across.
 *
 * Compression is meant to read as less space and more light. It cannot read as
 * either if the light has nowhere left to be taken from and the bright part is
 * the largest thing in the frame.
 */
const CAPACITY = 210;
/** Seconds to fill an empty hand. */
const FILL_S = 3.0;
/** How long a released particle coasts before it can be picked up again. */
const RETURN_S = 1.1;

// The reload cycle, in seconds.
const SCATTER_S = 1.0;
const DEAD_S = 1.0;
const REGATHER_S = 1.0;

const MAX_ATTRACTORS = 3;
/**
 * The old temporal buffer retained 86% of the previous frame, making a still
 * point roughly 1 / (1 - .86) = 7.1 times brighter after it settled. Clearing
 * every frame removed the unwanted tails and that accidental exposure boost
 * together. Restore most of the light instantaneously, with no old positions.
 */
const NO_TRAIL_EXPOSURE = 5.5;

// Long-term density repair. A couple of surplus particles are recycled into the
// emptiest coarse cell at a time, then revealed over several seconds. The low
// cadence makes the work negligible and, more importantly, makes the repair
// read as light gradually returning instead of particles popping into existence.
const REBALANCE_CELL = 120;
const REBALANCE_INTERVAL_S = 0.28;
const REBALANCE_MOVES = 2;
const APPEAR_S = 3.2;

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
/** Never thin below this: past it the highlights stop reading as a layer. */
const MIN_ACTIVE = 640;
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
const MIN_CAPACITY = 120;
/** Captured particles let go per second while shedding down to a new capacity. */
const SHED_PER_S = 190;

// --- ambient drift -----------------------------------------------------------
//
// The dust moves along the same streamlines the shader draws, and it does so by
// construction rather than by resemblance: both are contours of a scalar field,
// so a grain and the line it sits on cannot disagree about which way the flow
// goes.
//
// Taking the curl of that field, rather than using it as a direction directly,
// is the part that is not optional. A direction field has sources and sinks in
// it, and dust released into one drains onto the sinks within seconds — the
// first version of this did exactly that, and the field collapsed from an even
// scatter into a handful of bright filaments that looked like scratches on the
// lens. The curl of any scalar field is divergence-free, so nothing accumulates
// anywhere and the distribution that was seeded stays the distribution.
//
// The field is specified as whole numbers of cycles across the wrapped domain
// rather than as frequencies, and that is a correctness requirement, not a
// convenience.
//
// Loose dust wraps at the edges of the canvas, so the space it lives in is a
// torus. A flow that is divergence-free on the infinite plane is not
// divergence-free on that torus unless it is also periodic over it: at the seam
// the field jumps to an unrelated phase, and wherever the far side happens to
// be flowing inward, everything that wraps into it stays. It is a sink made out
// of nothing but a coordinate wrap, and it does not look like a subtle one —
// measured over four simulated minutes, one 117px cell had collected 1100 of
// the 1200 particles while its neighbours were empty.
//
// Integer cycle counts make the seam invisible to the field, so the torus is
// exactly as incompressible as the plane. The y counts exceed the x counts
// because the flow should run across the frame rather than up and down it: the
// curl swaps them, so more cycles vertically means more speed horizontally.
const DRIFT_CYCLES_X = 1;
const DRIFT_CYCLES_Y = 2;
const DRIFT_CYCLES_X2 = 2;
const DRIFT_CYCLES_Y2 = 1;
/** Peak drift speed, in the velocity units the integrator below uses. */
const DRIFT_PEAK = 3.4;
/**
 * Converts the potential's gradient into a velocity, in the units below.
 *
 * A velocity the dust is *moved at*, not a force it is pushed with, and this
 * distinction is the whole reason the field stays even.
 *
 * Both force versions were tried and both failed the same way. Feed the flow in
 * as an acceleration, through the damped integrator the rest of the loop uses,
 * and a grain's velocity always lags the field around it. Lagging tracers in an
 * unsteady flow do not stay where they were put — they concentrate, the same
 * way dust picks out the structure of a vortex — so the scatter drained into
 * bright filaments that looked like scratches on the lens. Raising the gain so
 * the lag was small only slowed it down. Measured as occupancy variance over a
 * 16x9 grid, a uniform start at 0.36 reached 3.1 within four simulated minutes.
 *
 * Added to the position directly, a grain is a massless tracer: it has no lag
 * to concentrate by, and an incompressible field moves it without ever changing
 * how much of it is anywhere. The same measurement then stays flat.
 */

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

// --- the sequence -----------------------------------------------------------
//
// Beauty, control, attraction, compression, silence, rupture, afterglow. The
// states are not seven separate effects; they are seven readings of two
// numbers, `charge` and the clock since a rupture began. Everything the shaders
// are told each frame is derived from those, which is what keeps the stages
// continuous with each other instead of cutting between presets.
//
// The ordering principle is that the loudest moment is set up by the quietest
// one. Compression narrows and brightens, Silence then removes the motion
// entirely for a fifth of a second, and the rupture lands into that hole. Take
// the silence out and the burst is merely bright; leave it in and it arrives.

/** Seconds of unbroken hold from nothing to a fully compressed core. */
const CHARGE_S = 2.6;
/** How long the field takes to relax once the hand lets go. Slower than it
 *  filled, so releasing reads as the pull easing rather than being cut. */
const RELAX_S = 1.5;
/** Charge above which Attraction has become Compression. */
const COMPRESS_AT = 0.52;
/**
 * Charge a deliberate click needs before it will rupture anything.
 *
 * Without a floor here every click bursts, and a hero that detonates each time
 * the user happens to pinch teaches them nothing about cause. Below this the
 * click simply lets the gathered light disperse.
 */
const RUPTURE_AT = 0.45;
/**
 * The most a hold on its own may reach.
 *
 * Short of 1 on purpose. A hold that ruptures by itself turns every ordinary
 * use of the pointer into a detonation — this page is also a working demo, and
 * aiming at a button for two seconds is a thing visitors do constantly. So the
 * hold does the gathering and the compressing, all the way to the edge, and the
 * click is what tips it over. Both halves of the spec's condition are then
 * real: you cannot rupture without having held, and you cannot rupture without
 * having asked.
 */
const HOLD_CAP = 0.9;
/** The held beat before the burst. */
const SILENCE_S = 0.22;
/** How long the rupture wave takes to cross the field. */
const RUPTURE_S = 0.9;
/**
 * The fraction of the rupture spent collapsing further before anything leaves.
 * A burst that starts by growing looks like an explosion; one that starts by
 * pulling in even tighter looks like something failing under pressure, which is
 * the causal read the whole sequence is built to earn.
 */
const IMPLODE = 0.08;
/** Seconds of residue after the wave has passed, before Ambient resumes. */
const AFTERGLOW_S = 2.4;

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
      // MediaPipe and this canvas compete for GPU time. Ask the browser not to
      // put the full-screen particle renderer on a deliberately slower adapter.
      powerPreference: 'high-performance',
    });
    if (!gl) return;

    this.gl = gl;
    try {
      this.pointProgram = link(gl, VERT, FRAG);
      this.quadProgram = link(gl, QUAD_VERT, QUAD_FRAG);
      this.rayProgram = link(gl, QUAD_VERT, RAY_FRAG);
      this.flowProgram = link(gl, QUAD_VERT, FLOW_FRAG);
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
    /** 0..1 reveal for light recycled into a sparse part of the field. */
    this.appearance = new Float32Array(COUNT);
    /** Seconds left of capture cooldown. 0 means it may be gathered again. */
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
    /** Coarse all-particle grid used only by the slow density repair. */
    this.rebalanceW = 1;
    this.rebalanceH = 1;
    this.rebalanceCount = new Uint16Array(1);
    this.rebalancePending = new Uint16Array(1);
    this.rebalanceClock = 0;
    this.rebalanceFrom = 0;

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
    // The flow is rendered at half linear resolution and scaled back up. It is
    // a smooth image by construction, with no detail finer than a contour line,
    // so the only thing full resolution buys is four times the fragment cost of
    // a four-octave noise — on the same GPU that is running hand inference.
    this.flowFbo = gl.createFramebuffer();
    this.flowTex = gl.createTexture();

    this.uPointRes = gl.getUniformLocation(this.pointProgram, 'u_resolution');
    this.uPointExposure = gl.getUniformLocation(this.pointProgram, 'u_exposure');
    this.uQuadTex = gl.getUniformLocation(this.quadProgram, 'u_tex');
    this.uQuadAlpha = gl.getUniformLocation(this.quadProgram, 'u_alpha');
    this.uRayRes = gl.getUniformLocation(this.rayProgram, 'u_resolution');
    this.uRayCenter = gl.getUniformLocation(this.rayProgram, 'u_center');
    this.uRayRadius = gl.getUniformLocation(this.rayProgram, 'u_radius');
    this.uRayCharge = gl.getUniformLocation(this.rayProgram, 'u_charge');
    this.uRayTime = gl.getUniformLocation(this.rayProgram, 'u_time');
    this.uRayBurst = gl.getUniformLocation(this.rayProgram, 'u_burst');
    this.uRayExposure = gl.getUniformLocation(this.rayProgram, 'u_exposure');
    this.uRayCompress = gl.getUniformLocation(this.rayProgram, 'u_compress');
    this.uFlowRes = gl.getUniformLocation(this.flowProgram, 'u_resolution');
    this.uFlowCenter = gl.getUniformLocation(this.flowProgram, 'u_center');
    this.uFlowTime = gl.getUniformLocation(this.flowProgram, 'u_time');
    this.uFlowPull = gl.getUniformLocation(this.flowProgram, 'u_pull');
    this.uFlowCompress = gl.getUniformLocation(this.flowProgram, 'u_compress');
    this.uFlowShock = gl.getUniformLocation(this.flowProgram, 'u_shock');
    this.uFlowDim = gl.getUniformLocation(this.flowProgram, 'u_dim');
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

    // --- the sequence ------------------------------------------------------
    /** One of ambient, detect, attract, compress, silence, rupture, afterglow. */
    this.phase = 'ambient';
    /** Seconds spent in phases that run on a clock rather than on charge. */
    this.phaseClock = 0;
    /** A rupture waiting behind the Silence beat, or null. */
    this.armed = null;
    /** 0..1. How much the hand has taken from the field. Drives everything. */
    this.charge = 0;
    /** How bent space is, 0..1. */
    this.pull = 0;
    /** How contracted it is, 0..1, and above 1 during the implosion. */
    this.compression = 0;
    /** Rupture wave position, 0..1 across its travel. 0 means no wave. */
    this.shock = 0;
    /** Overall exposure. Silence takes it down, the ignition flash spikes it. */
    this.dim = 1;
    /**
     * The flow's own clock, in seconds of flow rather than seconds of wall.
     * Compression runs it fast, Silence stops it, and because the shader only
     * ever sees this number, neither state needs a branch in the shader.
     */
    this.flowTime = 0;
    /** Where the field is centred, normalised, y down. */
    this.focusX = 0.5;
    this.focusY = 0.44;

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

    this.appearanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.appearanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.appearance, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
    return vao;
  }

  _seed() {
    for (let i = 0; i < COUNT; i++) {
      this.px[i] = Math.random() * this.width;
      this.py[i] = Math.random() * this.height;
      this.appearance[i] = 1;
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
    const oldWidth = this.width;
    const oldHeight = this.height;
    // MediaPipe also uses the GPU. Capping render density avoids large Retina
    // canvases stealing frame time while remaining visually sharper than 1x.
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.35);
    this.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    // Keep the visible field aligned across a resize or DPR change.
    if (oldWidth > 0 && oldHeight > 0) {
      const scaleX = this.width / oldWidth;
      const scaleY = this.height / oldHeight;
      for (let i = 0; i < COUNT; i++) {
        this.px[i] *= scaleX;
        this.py[i] *= scaleY;
      }
    }

    this.rebalanceW = Math.max(3, Math.ceil(this.width / (REBALANCE_CELL * this.dpr)));
    this.rebalanceH = Math.max(2, Math.ceil(this.height / (REBALANCE_CELL * this.dpr)));
    this.rebalanceCount = new Uint16Array(this.rebalanceW * this.rebalanceH);
    this.rebalancePending = new Uint16Array(this.rebalanceW * this.rebalanceH);

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

    // Whole cycles across the wrapped domain, which is the canvas plus the
    // wrap margin at each edge. Recomputed here because it depends on the size.
    const spanX = this.width + 40;
    const spanY = this.height + 40;
    const TAU = Math.PI * 2;
    this.driftAx = (TAU * DRIFT_CYCLES_X) / spanX;
    this.driftBy = (TAU * DRIFT_CYCLES_Y) / spanY;
    this.driftAx2 = (TAU * DRIFT_CYCLES_X2) / spanX;
    this.driftBy2 = (TAU * DRIFT_CYCLES_Y2) / spanY;
    // Normalised so the fastest dust moves at the same visual speed whatever
    // the canvas size; the curl's magnitude otherwise scales with frequency.
    this.driftNorm = DRIFT_PEAK / (this.driftBy + 0.55 * this.driftBy2);

    this.fw = Math.max(1, this.width >> 1);
    this.fh = Math.max(1, this.height >> 1);
    gl.bindTexture(gl.TEXTURE_2D, this.flowTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.fw, this.fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.flowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.flowTex, 0);

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
    const count = points ? Math.min(points.length, MAX_ATTRACTORS) : 0;
    for (let i = 0; i < count; i++) {
      const x = points[i].x * this.dpr;
      const y = points[i].y * this.dpr;
      if (this.attractors[i]) {
        this.attractors[i].x = x;
        this.attractors[i].y = y;
      } else {
        this.attractors.push({ x, y });
      }
    }
    this.attractors.length = count;
  }

  /** A passive mouse influence: stirs loose dust but never captures it. */
  setPointer(point) {
    if (!this.supported) return;
    if (!point) {
      this.pointer = null;
    } else if (this.pointer) {
      this.pointer.x = point.x * this.dpr;
      this.pointer.y = point.y * this.dpr;
    } else {
      this.pointer = { x: point.x * this.dpr, y: point.y * this.dpr };
    }
  }

  /**
   * A click asks the field to let go.
   *
   * Whether that is a rupture depends on how much was actually gathered. This
   * is the one place the spec's "do not let them detonate it by accident" rule
   * lives: under RUPTURE_AT there is no stored energy for a burst to be the
   * consequence of, so the light simply disperses and the field carries on. A
   * hero that explodes on every click is not teaching cause and effect, it is
   * just loud.
   *
   * Above the threshold this does not fire either — it arms. The burst always
   * arrives out of the Silence beat, never directly out of the click.
   */
  release(x, y, strength = 1) {
    if (!this.supported) return;
    if (this.phase === 'silence' || this.phase === 'rupture') return;
    if (this.charge < RUPTURE_AT) {
      this.pendingRelease = {
        x: x * this.dpr,
        y: y * this.dpr,
        strength: 0.16,
        power: Math.min(1, Math.max(0, this.fill)),
        soft: true,
      };
      this.charge = Math.max(0, this.charge - 0.3);
      return;
    }
    this._arm(x, y, strength);
  }

  /** Enter Silence with a rupture waiting behind it. Coordinates are CSS px. */
  _arm(x, y, strength) {
    this.phase = 'silence';
    this.phaseClock = 0;
    this.armed = { x, y, strength, power: Math.min(1, Math.max(0, this.fill)) };
  }

  /**
   * Silence is over. The field starts failing — but nothing has left yet.
   *
   * The first slice of the rupture is spent collapsing further, and the mass
   * has to still be there to be seen collapsing. Throwing the particles here,
   * which is what this did originally, meant the core was already empty by the
   * time the implosion was drawn: the shaders showed a contraction of nothing
   * while the light was on its way out. `_burst` is deferred to the end of that
   * beat so the sequence is inward, then outward, in that order.
   */
  _fire() {
    this.phase = 'rupture';
    this.phaseClock = 0;
  }

  /** The containment gives. Everything the hand took leaves at once. */
  _burst() {
    const a = this.armed;
    this.armed = null;
    if (!a) return;
    const centre = { x: a.x * this.dpr, y: a.y * this.dpr, strength: a.strength, power: a.power };
    this.pendingRelease = centre;
    this.burstCenter = centre;
    this.releaseTime = this.time;
  }

  /**
   * Move the sequence on by one frame.
   *
   * Six of the seven states are read straight off `charge`, which rises only
   * while a gesture is actually held and falls back when it is not. That is
   * deliberately the same number the user is building: there is no hidden timer
   * deciding when the hero gets dramatic, so holding longer always means more,
   * and letting go always means less. The two states that are not read off it —
   * Silence and Rupture — are the ones that must run to completion once begun,
   * so those get a clock.
   *
   * @param {number} d seconds, already clamped by the caller
   */
  _advance(d) {
    const engaged = this.attractors.length > 0 && this.mode !== 'idle';

    if (this.phase === 'silence') {
      this.phaseClock += d;
      if (this.phaseClock >= SILENCE_S) this._fire();
    } else if (this.phase === 'rupture') {
      this.phaseClock += d;
      if (this.armed && this.phaseClock >= RUPTURE_S * IMPLODE) this._burst();
      if (this.phaseClock >= RUPTURE_S) {
        this.phase = 'afterglow';
        this.phaseClock = 0;
      }
    } else if (this.phase === 'afterglow') {
      this.phaseClock += d;
      if (this.phaseClock >= AFTERGLOW_S) {
        this.phase = engaged ? 'detect' : 'ambient';
        this.phaseClock = 0;
      }
    } else {
      this.charge = engaged
        ? Math.min(HOLD_CAP, this.charge + d / CHARGE_S)
        : Math.max(0, this.charge - d / RELAX_S);

      if (this.charge > COMPRESS_AT) {
        this.phase = 'compress';
      } else if (this.charge > 0.015) {
        this.phase = 'attract';
      } else {
        this.phase = engaged ? 'detect' : 'ambient';
      }
    }

    this._derive(d);
  }

  /**
   * Turn the current state into the handful of numbers the shaders take.
   *
   * Keeping this in one place is what stops the stages drifting apart: pull,
   * compression, the wave and the exposure are always computed together from
   * the same phase, so there is no way for the field to be bent one way while
   * the core is lit as though it were bent another.
   */
  _derive(d) {
    let speed = 1;

    if (this.phase === 'rupture') {
      const t = this.phaseClock / RUPTURE_S;
      if (t < IMPLODE) {
        // Still going inward. This is the beat that makes the burst legible as
        // a failure of containment rather than as an explosion that happened to
        // be placed here.
        const k = t / IMPLODE;
        this.compression = 1 + k * 0.42;
        this.shock = 0;
        // Picks up exactly where Silence left the exposure and keeps going
        // down. Returning to 1 here put a bright frame between the held breath
        // and the flash, which is the one place a bright frame must not be.
        this.dim = 0.74 - k * 0.12;
        speed = 0.15;
      } else {
        const w = (t - IMPLODE) / (1 - IMPLODE);
        this.shock = w;
        // The core does not fade, it is emptied: everything it held is now in
        // the wave, so this has to fall much faster than the wave travels.
        this.compression = Math.max(0, 1.42 - w * 4.6);
        const flash = Math.exp(-Math.pow(w / 0.055, 2));
        this.dim = 1 + flash * 2.8;
        speed = 1 + 3.4 * (1 - w);
      }
      this.pull = Math.max(0, 1 - this.shock * 1.7);
      this.charge = Math.max(0, this.charge - d / 0.35);
    } else if (this.phase === 'silence') {
      const k = this.phaseClock / SILENCE_S;
      this.compression = 1;
      this.shock = 0;
      this.pull = 1;
      // A quarter of a stop down and completely still. Both halves matter: the
      // darkening alone reads as a dip, the stillness alone reads as a stall,
      // and together they read as something about to give.
      this.dim = 1 - 0.26 * smoothstep(0, 0.6, k);
      speed = 0;
    } else if (this.phase === 'afterglow') {
      const k = this.phaseClock / AFTERGLOW_S;
      this.compression = 0;
      this.shock = 0;
      this.pull = Math.max(0, this.pull - d / 0.8);
      this.dim = 1 + 0.12 * (1 - k) * (1 - k);
      // The flow reassembles rather than resuming: it comes back fast and eases
      // to its ambient rate, so the field is visibly settling for a few seconds.
      speed = 1 + 0.7 * (1 - k) * (1 - k);
      this.charge = Math.max(0, this.charge - d / 0.6);
    } else {
      this.pull = smoothstep(0, COMPRESS_AT, this.charge);
      // Anything present at all bends the field a little: a mouse before the
      // camera is on, and a hand that is in frame but not yet gathering. That
      // is State 1 — enough for the visitor to see that they have been noticed,
      // and not so much that detection is mistaken for the effect itself.
      //
      // A floor rather than a separate mouse-only case. Written as a case it
      // switched off the moment a gesture began, so the field relaxed to
      // nothing for the first half second of the gather and the hand appeared
      // to push before it pulled.
      if (this.pointer) this.pull = Math.max(this.pull, 0.30);
      this.compression = smoothstep(COMPRESS_AT, 1, this.charge);
      this.shock = 0;
      this.dim = 1;
      // Wide, pale and slow becomes narrow, bright and fast. The acceleration
      // is squared so that almost all of it happens in the last third of the
      // hold, where it can be felt against the calm that preceded it.
      speed = 1 + this.pull * 0.5 + this.compression * this.compression * 4.5;
    }

    if (this.reducedMotion) speed *= 0.32;
    this.flowTime += d * speed;
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

  /**
   * Repair only the large-scale distribution of loose dust. This is deliberately
   * not a force: moving visible points toward a target makes the correction look
   * like another burst in reverse. Instead, surplus points are recycled into an
   * under-filled cell with zero light and revealed by `appearance` afterwards.
   */
  _rebalance(dt, active) {
    if (this.time - this.releaseTime < SCATTER_S + DEAD_S + REGATHER_S) {
      this.rebalanceClock = 0;
      return;
    }
    this.rebalanceClock += dt;
    if (this.rebalanceClock < REBALANCE_INTERVAL_S) return;
    this.rebalanceClock %= REBALANCE_INTERVAL_S;

    const counts = this.rebalanceCount;
    const pending = this.rebalancePending;
    counts.fill(0);
    pending.fill(0);
    const gridW = this.rebalanceW;
    const gridH = this.rebalanceH;
    const cellWidth = this.width / gridW;
    const cellHeight = this.height / gridH;
    let visible = 0;

    for (let i = 0; i < active; i++) {
      // Count a light as occupying its new cell even while it is fading in, or
      // every pass would keep filling the same apparently empty cell.
      if (this.bound[i] || this.returning[i] > 0) continue;
      const x = this.px[i];
      const y = this.py[i];
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) continue;
      const cx = Math.min(gridW - 1, (x / cellWidth) | 0);
      const cy = Math.min(gridH - 1, (y / cellHeight) | 0);
      const cell = cy * gridW + cx;
      counts[cell]++;
      if (this.appearance[i] < 0.999) pending[cell]++;
      visible++;
    }

    const cells = counts.length;
    if (visible < cells * 2) return;
    const average = visible / cells;

    for (let move = 0; move < REBALANCE_MOVES; move++) {
      // Never put a second replacement beside one that is still appearing.
      // Several individually faded particles accumulating in one empty cell
      // crossed the bloom threshold together and looked like a small burst.
      let sparseCell = -1;
      let crowdedCell = 0;
      for (let c = 0; c < cells; c++) {
        if (pending[c] === 0 && (sparseCell < 0 || counts[c] < counts[sparseCell])) {
          sparseCell = c;
        }
        if (counts[c] > counts[crowdedCell]) crowdedCell = c;
      }
      if (sparseCell < 0) return;
      // Leave ordinary random variation alone. Correction starts only when a
      // visibly thin cell coexists with a clearly crowded one.
      if (
        counts[sparseCell] >= average * 0.72 ||
        counts[crowdedCell] <= average * 1.28 ||
        counts[crowdedCell] - counts[sparseCell] < 6
      ) return;

      let source = -1;
      let crowdedFallback = -1;
      for (let k = 0; k < active; k++) {
        const i = (this.rebalanceFrom + k) % active;
        if (this.bound[i] || this.returning[i] > 0 || this.appearance[i] < 0.999) continue;
        const x = this.px[i];
        const y = this.py[i];
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
          source = i;
          break;
        }
        const cx = Math.min(gridW - 1, (x / cellWidth) | 0);
        const cy = Math.min(gridH - 1, (y / cellHeight) | 0);
        if (cy * gridW + cx === crowdedCell) crowdedFallback = i;
      }
      if (source < 0) source = crowdedFallback;
      if (source < 0) return;
      this.rebalanceFrom = (source + 1) % active;

      const targetX = sparseCell % gridW;
      const targetY = (sparseCell / gridW) | 0;
      // Keep away from cell borders so adjacent repairs do not visually merge.
      this.px[source] = (targetX + 0.16 + Math.random() * 0.68) * cellWidth;
      this.py[source] = (targetY + 0.16 + Math.random() * 0.68) * cellHeight;
      // The replacement is born in place. Motion while it is still dim reads
      // as something being fired into the gap instead of light developing.
      this.vx[source] = 0;
      this.vy[source] = 0;
      this.held[source] = 0;
      this.heat[source] = 0;
      this.density[source] = 0;
      this.bursting[source] = 0;
      this.appearance[source] = 0;

      // An offscreen source was not included in any cell. A crowded source was.
      if (source === crowdedFallback) counts[crowdedCell]--;
      counts[sparseCell]++;
      pending[sparseCell]++;
    }
  }

  step(dt) {
    if (!this.supported) return;
    // Before the clamp below: the governor wants to know how long the frame
    // really took, which is exactly what the clamp is there to hide.
    this._governCount(dt * 1000);
    // A long MediaPipe task can make the next rAF 40-80 ms late. Advancing the
    // fluid by that entire gap in one Euler step turns the gathered ball into a
    // streak and can destabilise the neighbour forces. Slow simulation time on
    // an overloaded frame instead; there was no intermediate paint to show.
    const elapsed = Math.max(0, Math.min(dt, 0.1));
    const d = Math.min(elapsed, 1 / 30);
    this.time += d;
    this._advance(d);

    // Where the field is centred. It chases the pointer rather than tracking
    // it, and that lag is the point: the cursor is weightless and the space
    // around it is not, so the same input produces an immediate cursor and a
    // slow, heavy wake. Matching them exactly made the whole page feel like a
    // texture pinned to the mouse.
    const focus = this.attractors.length > 0 ? this.attractors[0] : this.pointer;
    if (focus) {
      const k = Math.min(1, d * 6.5);
      this.focusX += (focus.x / Math.max(1, this.width) - this.focusX) * k;
      this.focusY += (focus.y / Math.max(1, this.height) - this.focusY) * k;
    }

    const active = this.active;
    this._rebalance(d, active);

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
    const appearance = this.appearance;
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
    // The flow's clock, not the wall clock: the dust must slow, stop and
    // restart with the streamlines it is suspended in, or Silence has still
    // motion in the background of it.
    const flowT = this.flowTime;
    const driftAx = this.driftAx;
    const driftBy = this.driftBy;
    const driftAx2 = this.driftAx2;
    const driftBy2 = this.driftBy2;
    const driftNorm = this.driftNorm;

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
    // Compression is a radius, not a brightness. The mass is packed into a
    // smaller volume and its own density does the rest — the fluid below is
    // already lighting particles by how close their neighbours are, so halving
    // the radius raises the core's luminance without a single term here saying
    // "get brighter". Light that is bright because it is dense looks like
    // compressed energy; light that is bright because a number went up does not.
    const squeeze = 1 - Math.min(1.42, this.compression) * 0.46;
    const spread = (14 + 23 * Math.sqrt(visualFill)) * (grabbing ? 0.82 : 1) * squeeze * dpr;
    this.spread = spread;
    const grip = spread + (grabbing ? 60 : 84) * dpr;
    const reach = (grabbing ? 250 : 320) * (regathering ? 1.5 : 1) * dpr;

    // Absorption is rate limited, which is what sets the three seconds. It is
    // not a force constant, so the timing does not shift when the physics is
    // retuned.
    // Rebuilding the light after a cast must use the same calm fill rate as the
    // first gather. The old 2.6x reload made the replacement mass arrive as a
    // second, smaller explosion immediately after the intentional burst.
    this.absorbCarry += (this.capacity / FILL_S) * d * gate;
    let budget = Math.floor(this.absorbCarry);
    this.absorbCarry -= budget;

    const release = this.pendingRelease;
    this.pendingRelease = null;
    const stillness = this.phase === 'silence' ? 0.86 : 1;

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
      const replenishing = appearance[i] < 0.999;

      // Ambient drift, slow: any motion a visitor notices should be motion
      // their own hand caused.
      //
      // The per-particle seed that used to be in here is gone, and its absence
      // is the difference between dust and a swarm: with it, every grain picked
      // its own direction and the field milled, which is what insects look
      // like. Neighbours now agree, so the dust travels along the flow instead
      // of within it. See DRIFT_* above for why this is a curl and not simply
      // a direction.
      const dxa = px[i] * driftAx + flowT * 0.050;
      const dyb = py[i] * driftBy - flowT * 0.040;
      const dxa2 = px[i] * driftAx2 - flowT * 0.031;
      const dyb2 = py[i] * driftBy2 + flowT * 0.024;
      // d(psi)/dy and d(psi)/dx of sin(ax)cos(by), two harmonics.
      const dPsiDy = -driftBy * Math.sin(dxa) * Math.sin(dyb)
        - 0.55 * driftBy2 * Math.sin(dxa2) * Math.sin(dyb2);
      const dPsiDx = driftAx * Math.cos(dxa) * Math.cos(dyb)
        + 0.55 * driftAx2 * Math.cos(dxa2) * Math.cos(dyb2);
      // Only loose dust rides the flow. Captured light belongs to the hand,
      // and light in flight from a burst is on a ballistic path of its own.
      const carried = !replenishing && !bound[i] && returning[i] === 0;
      const drift = carried ? driftNorm * motion : 0;
      const driftX = dPsiDy * drift;
      const driftY = -dPsiDx * drift;
      // `vx`/`vy` now carry only what is *disturbing* a grain — the mouse, a
      // burst — and damp back to nothing, leaving it on the flow again.
      let ax = 0;
      let ay = 0;
      let cursorLight = 0;

      // Before hand tracking starts, the mouse only ripples nearby ambient
      // dust. It cannot bind particles, charge a glow or trigger a release.
      if (!replenishing && !bound[i] && pointer) {
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
          // Shed: the hand moved on. Cool down before it can be gathered again.
          bound[i] = 0;
          held[i] = 0;
          returning[i] = RETURN_S;
        }
      } else if (
        gathering &&
        room > 0 &&
        budget > 0 &&
        returning[i] === 0 &&
        !replenishing &&
        nearest >= 0 &&
        nearestDist < reach
      ) {
        bound[i] = 1;
        room--;
        budget--;
        boundCount++;
        arriving = true;
      }

      // ---- the burst ---------------------------------------------------------
      if (release && boundBefore) {
        // A golden-angle spread fills the burst without visible radial bands.
        const angle = i * 2.399963 + (s - 0.5) * 0.12;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const startRadius = (1.5 + s * 4.5) * dpr;
        px[i] = release.x + dirX * startRadius;
        py[i] = release.y + dirY * startRadius;
        // All the pressure in the compressed mass is let go at once, so the
        // particle leaves at its highest speed and decelerates the whole way
        // out. The initial speed is chosen so that drag alone carries it well
        // across the visible field. Density correction starts only after this
        // cooldown, so it cannot bend the visible burst trajectory.
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
        // A dissipation is not a small burst. It has no heat and leaves no
        // trailing ember, so what the eye sees is light being handed back to
        // the field rather than thrown out of it.
        heat[i] = release.soft ? 0 : 0.20 + release.power * 0.80;
        returning[i] = release.soft ? RETURN_S * 0.35 : RETURN_S;
        bursting[i] = release.soft ? 0 : 1;
        if (inMass) massCount--;
        boundCount--;
        inMass = false;
        arriving = false;
      }

      // ---- coasting -----------------------------------------------------------
      // No force here. `returning` is only a cooldown that keeps a particle
      // from being picked straight back up while it is still flying; drag alone
      // decides where it stops.
      let finishedBurst = false;
      if (returning[i] > 0) {
        const wasBursting = bursting[i] > 0;
        returning[i] = Math.max(0, returning[i] - d);
        // Fade the cast state continuously instead of dropping from 1 to 0 at
        // the end. Size, brightness, red heat and drag can now all finish the
        // same uninterrupted gradient back to an ambient white particle.
        if (bursting[i] > 0) {
          bursting[i] = returning[i] / RETURN_S;
        }
        finishedBurst = wasBursting && returning[i] === 0;
      }

      // Still burning while it flies; it cools to white only once the throw is
      // spent, so a burst reads as red light thrown outward that fades on the
      // way rather than as white sparks from the start.
      if (!bound[i]) {
        const cool = 1.8 - bursting[i] * 1.58;
        heat[i] *= Math.max(0, 1 - d * cool);
      }
      if (!inMass) density[i] *= Math.max(0, 1 - d * 4);
      if (appearance[i] < 1) {
        appearance[i] = Math.min(1, appearance[i] + d / APPEAR_S);
      }

      const dampPerFrame = arriving
        ? 0.965
        : inMass
          ? 0.86
          : bursting[i] > 0
            // Enough drag to be seen slowing down over the scatter second.
            ? 0.982
            : returning[i] > 0
              ? 0.9
              : 0.935;
      // The original values are per 60 Hz frame. Make them time-correct so a
      // missed frame does not also remove most of the damping for that period.
      // Silence stops the field rather than slowing it: the contrast the
      // rupture lands against is made here.
      const damp = Math.pow(dampPerFrame * stillness, d * 60);
      vx[i] = replenishing ? 0 : (vx[i] + ax * d) * damp;
      vy[i] = replenishing ? 0 : (vy[i] + ay * d) * damp;

      const speed = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
      const cap = bursting[i] > 0 ? 225 : 44;
      if (speed > cap) {
        vx[i] = (vx[i] / speed) * cap;
        vy[i] = (vy[i] / speed) * cap;
      }
      px[i] += (vx[i] + driftX) * d * 34;
      py[i] += (vy[i] + driftY) * d * 34;

      // Loose dust wraps with its overshoot intact. Large-scale empty areas are
      // repaired by _rebalance(), through light fading in rather than motion.
      if (returning[i] === 0 && !bound[i]) {
        const margin = 20;
        const spanX = width + margin * 2;
        const spanY = height + margin * 2;
        let wrapped = false;
        // Preserve overshoot when wrapping. Assigning every escaped particle to
        // exactly -20 or width+20 made repeated bursts accumulate as edge lines.
        if (px[i] < -margin || px[i] > width + margin) {
          px[i] = ((px[i] + margin) % spanX + spanX) % spanX - margin;
          wrapped = true;
        }
        if (py[i] < -margin || py[i] > height + margin) {
          py[i] = ((py[i] + margin) % spanY + spanY) % spanY - margin;
          wrapped = true;
        }

        // A cast particle that finished offscreen is now replacement light,
        // not a continuation of the burst. Previously hundreds of these
        // wrapped on the same frame with their remaining velocity and appeared
        // to explode back into the empty field. Reintroduce them dark and still
        // so only the gradual appearance ramp is visible.
        if (wrapped && finishedBurst) {
          appearance[i] = 0;
          vx[i] = 0;
          vy[i] = 0;
          heat[i] = 0;
          density[i] = 0;
          bursting[i] = 0;
        }
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
      // Even ambient dust needs enough physical pixels for a radial gradient.
      // A 2px sprite can only look like a hard dot regardless of the shader.
      sizes[i] = (2.6 + s * s * 2.6 + held[i] * 9.5 + heat[i] * 2.4
        + ember * 2.0 + burstGlow * 2.2 + cursorLight * 5.0) * dpr;

      // A merged particle contributes very little on its own. Hundreds of them
      // overlapping is what produces the light, so the saturated core stays
      // small and everything outside it is a smooth density gradient. Making
      // each one bright instead would blow out the whole mass into a flat disc.
      // A merged particle contributes little on its own; hundreds overlapping
      // are what make the light, so the saturated core stays small and
      // everything outside it is a smooth density gradient.
      const hotness = smoothstep(12, 28, density[i]);
      // Dimmer than it was, because it is no longer carrying the picture. At
      // the old value the highlights sat on top of the streamlines and read as
      // a separate particle layer laid over them instead of as glints within.
      // Graded by seed rather than flat, and squared so the distribution is
      // bottom-heavy: most of the dust is barely there and a few grains carry
      // real light. A field where every grain is equally bright has a texture,
      // and a texture at this density reads as a swarm however slowly it moves.
      // Unevenness is what turns the same points into glints inside the volume.
      const glint = 0.05 + s * s * 0.27;
      const brightness = glint * (1 - warm) + warm * (0.05 + hotness * 0.115)
        + ember * 0.55 + burstGlow * 0.22 + cursorLight * 0.62;
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
      // Reach the low-cost configuration in roughly 1.3 seconds regardless of
      // whether the struggling device is presenting 20, 30 or 60 fps.
      this.relief = Math.min(1, this.relief + frameMs * 0.00075);
    } else if (this.frameCost < GROW_BELOW_MS) {
      // Recover slowly so quality does not seesaw around the threshold.
      this.relief = Math.max(0, this.relief - frameMs * 0.00008);
    }
    const previousActive = this.active;
    const nextActive = Math.round(COUNT + (MIN_ACTIVE - COUNT) * this.relief);

    // Particles outside `active` are not stepped. If one is brought back after
    // a cast, its last hot/bound velocity state must not reappear for one frame
    // as a tiny burst. Bring it back as fresh loose dust, fully transparent;
    // the normal `appearance` ramp reveals it gradually in place.
    if (nextActive > previousActive) {
      for (let i = previousActive; i < nextActive; i++) {
        this.bound[i] = 0;
        this.held[i] = 0;
        this.heat[i] = 0;
        this.returning[i] = 0;
        this.bursting[i] = 0;
        this.density[i] = 0;
        this.vx[i] = 0;
        this.vy[i] = 0;
        this.appearance[i] = 0;
      }
    }

    this.active = nextActive;
    this.capacity = Math.round(CAPACITY + (MIN_CAPACITY - CAPACITY) * this.relief);
  }

  render() {
    if (!this.supported) return;
    const gl = this.gl;

    // ---- the field ---------------------------------------------------------
    // Drawn first and at half resolution, into its own buffer. Everything after
    // this point is light *in* the field rather than light beside it, which is
    // why the flow goes down before the highlights and both go through the same
    // bloom: two separately glowing layers composited at the end never belong
    // to one another.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.flowFbo);
    gl.viewport(0, 0, this.fw, this.fh);
    gl.disable(gl.BLEND);
    gl.useProgram(this.flowProgram);
    gl.uniform2f(this.uFlowRes, this.fw, this.fh);
    gl.uniform2f(this.uFlowCenter, this.focusX, this.focusY);
    gl.uniform1f(this.uFlowTime, this.flowTime);
    gl.uniform1f(this.uFlowPull, this.pull);
    gl.uniform1f(this.uFlowCompress, Math.min(1, this.compression));
    gl.uniform1f(this.uFlowShock, this.shock);
    gl.uniform1f(this.uFlowDim, this.dim);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.width, this.height);

    // Start from a clean target every frame. Temporal accumulation made every
    // ambient point grow a tail at high refresh rates and stretched a moving
    // gathered mass into a line after a slow inference frame. Bloom below still
    // supplies the soft glow without retaining any previous particle position.
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(this.quadProgram);
    gl.uniform1i(this.uQuadTex, 0);
    gl.uniform1f(this.uQuadAlpha, 1.0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.flowTex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.useProgram(this.pointProgram);
    gl.uniform2f(this.uPointRes, this.width, this.height);
    // The highlights live in the same exposure as the field, so Silence dims
    // them too and the ignition flash blows them out with everything else.
    gl.uniform1f(this.uPointExposure, NO_TRAIL_EXPOSURE * Math.min(1.8, this.dim));
    gl.bindVertexArray(this.vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.positions);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sizeBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.sizes);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.colorBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.colors);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.appearanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.appearance);
    gl.drawArrays(gl.POINTS, 0, this.active);

    // ---- radiance -----------------------------------------------------------
    // Drawn into the same buffer as the particles and before the bright pass,
    // so the bloom picks the rays up too and they bleed rather than sit flat.
    // The gathered-light rays used to switch on wholesale at fill > .02.
    // Because the shader is intentionally intense near its centre, crossing
    // that threshold looked exactly like a second burst during replenishment.
    // Ease the ray energy in from zero instead. This path is only the gathered
    // light; the deliberate click burst below keeps its original envelope.
    const gatheredCharge = Math.min(1, Math.max(0, this.fill));
    const radianceReveal = smoothstep(0.01, 0.32, gatheredCharge);
    const visibleCharge = gatheredCharge * radianceReveal;
    if (visibleCharge > 0.0001 && this.attractors.length > 0) {
      gl.useProgram(this.rayProgram);
      gl.uniform2f(this.uRayRes, this.width, this.height);
      gl.uniform1f(this.uRayTime, this.time);
      gl.uniform1f(this.uRayCharge, visibleCharge / Math.sqrt(this.attractors.length));
      // Follows the same contraction as the mass, so the rays tighten into the
      // core instead of hanging around it at their gathering size.
      gl.uniform1f(this.uRayRadius, Math.min(this.spread || 22, 28 * this.dpr));
      gl.uniform1f(this.uRayBurst, 0);
      gl.uniform1f(this.uRayExposure, NO_TRAIL_EXPOSURE * Math.min(1.8, this.dim));
      gl.uniform1f(this.uRayCompress, Math.min(1, this.compression));
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
      gl.uniform1f(this.uRayExposure, NO_TRAIL_EXPOSURE * Math.min(1.8, this.dim));
      gl.uniform1f(this.uRayCompress, 0);
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
