// test/core.test.js
//
// The filtering and gesture layers are pure functions of landmarks and time,
// so they can be checked without a DOM or a camera.

const test = require('node:test');
const assert = require('node:assert/strict');

const { OneEuroFilter } = require('../dist/cjs/core/oneEuro.js');
const { AirCursorEngine, DEFAULT_OPTIONS } = require('../dist/cjs/core/engine.js');
const { SchmittTrigger, HandGestureRecognizer } = require('../dist/cjs/core/gestures.js');

test('stopping inside a click callback does not emit another cursor state', () => {
  const engine = new AirCursorEngine({ video: null, regionSelectEnabled: false });
  let emitted = 0;
  engine.running = true;
  engine.wasPressed = true;
  engine.onState = () => emitted++;
  engine.pointer = { move() {}, release() { engine.running = false; } };
  engine.latest = { point: { x: 50, y: 40 }, state: { dominant: { selecting: false }, dominantLandmarks: [{}] } };
  const previousWindow = global.window;
  global.window = { innerWidth: 200, innerHeight: 120 };
  try { engine._step(1000, 1 / 60); } finally { global.window = previousWindow; }
  assert.equal(emitted, 0);
});

test('stopping during an engine frame schedules no extra frame or scroll', () => {
  const engine = new AirCursorEngine({ video: null });
  engine.running = true;
  engine._step = () => { engine.running = false; };
  let ticks = 0, frames = 0;
  engine.scroller.tick = () => ticks++;
  const previousRaf = global.requestAnimationFrame;
  global.requestAnimationFrame = () => frames++;
  try { engine._loop(); } finally { global.requestAnimationFrame = previousRaf; }
  assert.equal(ticks, 0);
  assert.equal(frames, 0);
});
const {
  handScale, normDistance, LM, userHandFrom, landmarkToViewport, DEFAULT_ACTIVE_REGION,
} = require('../dist/cjs/core/landmarks.js');

// ------------------------------------------------------------------ One Euro

test('One Euro removes jitter from a stationary signal', () => {
  const filter = new OneEuroFilter({ minCutoff: 1.2, beta: 0.012 });
  // A hand held still, with the frame-to-frame noise MediaPipe actually shows.
  const noise = [0, 1.8, -1.5, 2.1, -2.0, 1.2, -1.1, 1.9, -1.7, 0.8, -0.9, 1.4];
  let last = 0;
  let maxStep = 0;
  noise.forEach((n, i) => {
    const out = filter.filter(500 + n, i / 30);
    if (i > 2) maxStep = Math.max(maxStep, Math.abs(out - last));
    last = out;
  });
  assert.ok(maxStep < 0.9, `residual jitter should be well under the input noise, got ${maxStep.toFixed(3)}`);
});

test('One Euro still tracks a fast movement without falling far behind', () => {
  const filter = new OneEuroFilter({ minCutoff: 1.2, beta: 0.012 });
  let out = 0;
  for (let i = 0; i < 30; i++) out = filter.filter(i * 30, i / 30);
  const truth = 29 * 30;
  assert.ok(truth - out < truth * 0.35, `lag should stay modest, got ${(truth - out).toFixed(1)}px`);
});

test('One Euro survives a stalled frame without exploding', () => {
  const filter = new OneEuroFilter();
  filter.filter(100, 0);
  const out = filter.filter(120, 45); // 45 second gap, as after a backgrounded tab
  assert.ok(Number.isFinite(out));
});

// ------------------------------------------------------------ SchmittTrigger

test('SchmittTrigger does not chatter at the threshold', () => {
  const trigger = new SchmittTrigger({ enter: 0.4, exit: 0.6, invert: true, holdMs: 0 });
  let flips = 0;
  let previous = false;
  // A value hovering right around the enter threshold.
  for (let i = 0; i < 40; i++) {
    const value = 0.40 + (i % 2 === 0 ? -0.01 : 0.01);
    const state = trigger.update(value, i * 16);
    if (state !== previous) flips += 1;
    previous = state;
  }
  assert.equal(flips, 1, 'should latch on once and stay on inside the hysteresis band');
});

test('SchmittTrigger needs the hold window before switching on', () => {
  const trigger = new SchmittTrigger({ enter: 0.4, exit: 0.6, invert: true, holdMs: 60 });
  assert.equal(trigger.update(0.2, 0), false, 'not yet');
  assert.equal(trigger.update(0.2, 30), false, 'still inside the hold window');
  assert.equal(trigger.update(0.2, 70), true, 'held long enough');
  // Release is immediate: a dropped gesture must never stick.
  assert.equal(trigger.update(0.9, 71), false);
});

// -------------------------------------------------------------- normalization

/**
 * Synthetic hand. Fingertips are laid out along a row so the distances the
 * recognizer cares about can be set directly: `indexMiddle` is the gap between
 * the index and middle tips, `middleRing` the gap to the ring finger.
 */
function makeHand({ scale = 0.2, pinch = 0.02, indexMiddle = 0.02, middleRing = null, curl = 0 } = {}) {
  const lm = [];
  for (let i = 0; i < 21; i++) lm.push({ x: 0.5, y: 0.5, z: 0 });
  const y = 0.5 - scale * (1 - curl);
  // An open hand spaces the fingers roughly evenly; callers override this to
  // build the deliberate two-finger pose.
  const ring = middleRing === null ? indexMiddle : middleRing;
  lm[LM.WRIST] = { x: 0.5, y: 0.5 + scale, z: 0 };
  lm[LM.MIDDLE_MCP] = { x: 0.5, y: 0.5, z: 0 };
  lm[LM.INDEX_TIP] = { x: 0.5, y, z: 0 };
  lm[LM.THUMB_TIP] = { x: 0.5 + pinch, y, z: 0 };
  lm[LM.MIDDLE_TIP] = { x: 0.5 + indexMiddle, y, z: 0 };
  lm[LM.RING_TIP] = { x: 0.5 + indexMiddle + ring, y, z: 0 };
  lm[LM.PINKY_TIP] = { x: 0.5 + indexMiddle + ring * 2, y, z: 0 };
  return lm;
}

/** The two-finger pointer pose: index and middle together, ring well clear. */
function aimPose(scale) {
  return makeHand({ scale, pinch: scale * 0.9, indexMiddle: scale * 0.1, middleRing: scale * 0.5 });
}

test('hand-unit distances are invariant to how large the hand appears', () => {
  // Same pose, one hand twice as far from the camera as the other.
  const near = makeHand({ scale: 0.30, pinch: 0.30 * 0.2 });
  const far = makeHand({ scale: 0.15, pinch: 0.15 * 0.2 });

  assert.ok(Math.abs(handScale(near) - 0.30) < 1e-9);
  assert.ok(Math.abs(handScale(far) - 0.15) < 1e-9);

  const dNear = normDistance(near, LM.THUMB_TIP, LM.INDEX_TIP);
  const dFar = normDistance(far, LM.THUMB_TIP, LM.INDEX_TIP);
  assert.ok(Math.abs(dNear - dFar) < 1e-9, 'this is what the raw-pixel thresholds in v1 got wrong');
});

test('the same gesture is recognized at both camera distances', () => {
  const near = new HandGestureRecognizer();
  const far = new HandGestureRecognizer();
  const poseNear = aimPose(0.30);
  const poseFar = aimPose(0.12);

  let a = null;
  let b = null;
  for (let t = 0; t <= 120; t += 20) {
    a = near.update(poseNear, t);
    b = far.update(poseFar, t);
  }
  assert.equal(a.aiming, true);
  assert.equal(b.aiming, true);
  assert.equal(a.aiming, b.aiming);
});

test('grab and aim are mutually exclusive', () => {
  // Clicking has its own, longer hold; these frames only span 120ms, so it is
  // switched off here to keep the test about the poses rather than the timing.
  const recognizer = new HandGestureRecognizer({ selectHoldMs: 0 });
  // All three fingertips together: this is "select", not "grab".
  const pose = makeHand({ scale: 0.2, pinch: 0.2 * 0.1, indexMiddle: 0.2 * 0.1, middleRing: 0.2 * 0.5 });
  let state = null;
  for (let t = 0; t <= 120; t += 20) state = recognizer.update(pose, t);

  assert.equal(state.aiming, true);
  assert.equal(state.selecting, true);
  assert.equal(state.grabbing, false, 'v1 reported a grab here too, so clicking also scrolled');
});

test('changing directly from pointer to grab starts scrolling inside aim hysteresis', () => {
  const recognizer = new HandGestureRecognizer();
  let state = null;
  for (let t = 0; t <= 120; t += 20) state = recognizer.update(aimPose(0.2), t);
  assert.equal(state.aiming, true);

  // 0.36 is below aimExit (0.42), so the aim Schmitt trigger is still latched,
  // but it is visibly separated enough to be the documented grab pose.
  const grab = makeHand({
    scale: 0.2,
    pinch: 0.2 * 0.1,
    indexMiddle: 0.2 * 0.36,
    middleRing: 0.2 * 0.65,
  });
  for (let t = 140; t <= 260; t += 20) state = recognizer.update(grab, t);

  assert.equal(state.grabbing, true);
  assert.equal(state.aiming, false);
  assert.equal(state.selecting, false);
});

test('handedness is reported from the user perspective, not the camera', () => {
  assert.equal(userHandFrom({ label: 'Right' }), 'left');
  assert.equal(userHandFrom({ label: 'Left' }), 'right');
  assert.equal(userHandFrom(undefined), 'unknown');
});

test('landmarks map to a mirrored viewport', () => {
  const point = landmarkToViewport({ x: 0.25, y: 0.5 }, 1000, 600);
  assert.equal(point.x, 750);
  assert.equal(point.y, 300);
});

// ------------------------------------------------------------- active region

test('the active region stretches its corners to the corners of the screen', () => {
  const r = DEFAULT_ACTIVE_REGION;
  const topLeft = landmarkToViewport({ x: r.left, y: r.top }, 1000, 800, r);
  const bottomRight = landmarkToViewport(
    { x: 1 - r.right, y: 1 - r.bottom }, 1000, 800, r
  );
  // x is mirrored on the way, so the frame's left edge is the screen's right.
  assert.equal(Math.round(topLeft.x), 1000);
  assert.equal(Math.round(topLeft.y), 0);
  assert.equal(Math.round(bottomRight.x), 0);
  assert.equal(Math.round(bottomRight.y), 800);
});

test('a hand outside the active region holds the pointer against the edge', () => {
  // The point of the region: the screen edge is reached while the hand is still
  // well inside the camera frame, where the tracker can still see all of it.
  // Past the region the pointer stops rather than flying off or jumping.
  const r = DEFAULT_ACTIVE_REGION;
  const past = landmarkToViewport({ x: 0.5, y: 0.98 }, 1000, 800, r);
  assert.equal(past.y, 800);
  const wayPast = landmarkToViewport({ x: 0.5, y: 4 }, 1000, 800, r);
  assert.equal(wayPast.y, 800, 'clamped, not extrapolated');
  const before = landmarkToViewport({ x: 0.01, y: 0.5 }, 1000, 800, r);
  assert.equal(before.x, 1000);
});

test('the bottom inset is the generous one, because the wrist trails the fingers', () => {
  // Reaching the bottom of the screen is the case that breaks a full-frame
  // mapping: the fingertip gets there first and the rest of the hand leaves the
  // camera behind it. Reaching the top does not, so that inset can be small.
  assert.ok(
    DEFAULT_ACTIVE_REGION.bottom > DEFAULT_ACTIVE_REGION.top * 2,
    'the margin below the pointer has to hold a whole hand'
  );
});

test('omitting the region keeps the plain full-frame mapping', () => {
  const plain = landmarkToViewport({ x: 0.25, y: 0.5 }, 1000, 600);
  const explicitNone = landmarkToViewport({ x: 0.25, y: 0.5 }, 1000, 600, null);
  assert.deepEqual(plain, explicitNone);
});

test('a relaxed open hand does not engage the pointer', () => {
  const recognizer = new HandGestureRecognizer();
  // Fingers evenly spaced, as they are when a hand simply rests in frame. The
  // index and middle tips are close, but no closer than the middle and ring.
  const open = makeHand({ scale: 0.2, pinch: 0.2 * 0.9, indexMiddle: 0.2 * 0.22 });
  let state = null;
  for (let t = 0; t <= 400; t += 20) state = recognizer.update(open, t);
  assert.equal(state.aiming, false, 'closeness alone must not be enough');
  assert.equal(state.selecting, false);
});

test('the pointer engages once the ring finger parts from the pair', () => {
  const recognizer = new HandGestureRecognizer();
  const pose = aimPose(0.2);
  let state = null;
  for (let t = 0; t <= 400; t += 20) state = recognizer.update(pose, t);
  assert.equal(state.aiming, true);
});

// ------------------------------------------------------- options and defaults

test('an option passed as undefined does not blank its default', () => {
  // How a React component's unset prop arrives. Spreading it over the defaults
  // let it win, which blanked the MediaPipe CDN address: the tracker then asked
  // the application's own server for `/undefined/hands_solution_...js`, got
  // index.html back, and threw `Unexpected token '<'` once per frame.
  //
  // Constructed without a video element, which `start()` would need but the
  // constructor does not — this is about option merging only.
  const engine = new AirCursorEngine({
    video: null,
    mediapipeBasePath: undefined,
    inferenceFps: undefined,
    activeRegion: undefined,
    dominantHand: undefined,
    camera: undefined,
  });
  assert.equal(engine.options.mediapipeBasePath, DEFAULT_OPTIONS.mediapipeBasePath);
  assert.ok(engine.options.mediapipeBasePath.startsWith('https://'));
  assert.equal(engine.options.inferenceFps, DEFAULT_OPTIONS.inferenceFps);
  assert.equal(engine.options.dominantHand, DEFAULT_OPTIONS.dominantHand);
  assert.deepEqual(engine.options.camera, DEFAULT_OPTIONS.camera);
  assert.deepEqual(engine.options.activeRegion, DEFAULT_ACTIVE_REGION);
});

test('a value that is deliberately null still overrides its default', () => {
  // `null` is a real choice — the full-frame mapping — and must survive the
  // filtering that drops `undefined`.
  const engine = new AirCursorEngine({ video: null, activeRegion: null });
  assert.equal(engine.options.activeRegion, null);
});

test('options that are actually passed still win', () => {
  const engine = new AirCursorEngine({
    video: null,
    mediapipeBasePath: '/vendor/mediapipe',
    inferenceFps: 15,
    camera: { width: 320 },
    activeRegion: { bottom: 0.4 },
  });
  assert.equal(engine.options.mediapipeBasePath, '/vendor/mediapipe');
  assert.equal(engine.options.inferenceFps, 15);
  assert.equal(engine.options.camera.width, 320);
  // Partial objects merge over the default rather than replacing it.
  assert.equal(engine.options.camera.height, DEFAULT_OPTIONS.camera.height);
  assert.equal(engine.options.activeRegion.bottom, 0.4);
  assert.equal(engine.options.activeRegion.left, DEFAULT_ACTIVE_REGION.left);
});

test('seeing a second hand cancels grab scroll before region framing settles', () => {
  const engine = new AirCursorEngine({ video: null });
  let scrollCancels = 0;
  let scrollBegins = 0;
  engine.pointer = {
    currentTarget: null,
    move() {}, press() {}, release() {}, cancel() {}, clear() {}, contextMenu() {},
  };
  engine.scroller = {
    begin() { scrollBegins++; },
    update() {}, end() {}, tick() {},
    cancel() { scrollCancels++; },
  };
  // The region recognizer has not served its median/hold window yet. The raw
  // presence of the off hand must still reserve the pinch for region framing.
  engine.region = {
    update: () => ({ phase: 'idle', rect: null, committed: null, rejected: null }),
    cancel: () => false,
    reset() {},
  };
  engine.latest = {
    timestamp: 1000,
    point: { x: 50, y: 40 },
    state: {
      dominant: { grabbing: true, selecting: false, aiming: false },
      dominantLandmarks: [{}],
      offLandmarks: [{}],
      modifier: false,
    },
  };
  engine.wasGrabbing = true;

  const previousWindow = global.window;
  global.window = { innerWidth: 200, innerHeight: 120 };
  try {
    engine._step(1000, 1 / 60);
  } finally {
    global.window = previousWindow;
  }

  assert.equal(scrollCancels, 1, 'an in-flight scroll is cancelled without inertia');
  assert.equal(scrollBegins, 0, 'no new scroll starts during the region hold window');
  assert.equal(engine.wasGrabbing, false);
});

test('holding both fists cancels a live region without a pointer click', () => {
  let cancelCalls = 0;
  let emitted = null;
  const engine = new AirCursorEngine({ video: null, onState: (state) => { emitted = state; } });
  engine.pointer = {
    move() {}, press() {}, release() {}, cancel() {}, clear() {}, contextMenu() {},
  };
  engine.scroller = {
    begin() {}, update() {}, end() {}, cancel() {}, tick() {},
  };
  engine.region = {
    o: { cancelFistHoldMs: 450 },
    update: () => ({ phase: 'pending', rect: { left: 0, top: 0, width: 0.5, height: 0.5 }, committed: null, rejected: null }),
    cancel: () => { cancelCalls++; return true; },
    reset() {},
  };
  engine.latest = {
    timestamp: 1000,
    point: { x: 50, y: 40 },
    state: {
      dominant: { grabbing: false, selecting: false, aiming: false, fist: true },
      dominantLandmarks: [{}],
      off: { fist: true },
      offLandmarks: [{}],
      modifier: true,
    },
  };

  const previousWindow = global.window;
  global.window = { innerWidth: 200, innerHeight: 120 };
  try {
    engine._step(1000, 1 / 60);
    engine._step(2000, 1 / 60);
    assert.equal(cancelCalls, 0, 'one stale inference is not mistaken for a hold');
    engine.latest.timestamp = 1449;
    engine._step(1449, 1 / 60);
    assert.equal(cancelCalls, 0, 'a short two-fist pose is not enough');
    engine.latest.timestamp = 1450;
    engine._step(1450, 1 / 60);
  } finally {
    global.window = previousWindow;
  }

  assert.equal(cancelCalls, 1);
  assert.equal(emitted.region.rejected, 'cancelled');
  assert.equal(emitted.region.rect, null);
});
