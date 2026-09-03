// src/core/landmarks.js
//
// Landmark helpers.
//
// Every distance used for gesture recognition is expressed in "hand units":
// the distance between the wrist (0) and the middle-finger MCP joint (9).
// That segment is rigid, so dividing by it makes every threshold invariant to
// how far the user sits from the camera and to the size of the viewport.
//
// The previous implementation compared raw pixel distances against constants
// (45, 50, 40) computed on a canvas sized to the window, which meant the same
// gesture read differently at a different window size or camera distance.

export const LM = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
};

export function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function centroid(...points) {
  const n = points.length;
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / n, y: y / n };
}

/**
 * Scale reference for this hand: wrist to middle-finger MCP.
 * Never returns 0, so callers can divide unconditionally.
 */
export function handScale(landmarks) {
  const s = distance2D(landmarks[LM.WRIST], landmarks[LM.MIDDLE_MCP]);
  return s > 1e-6 ? s : 1e-6;
}

/** Distance between two landmarks, in hand units. */
export function normDistance(landmarks, a, b) {
  return distance2D(landmarks[a], landmarks[b]) / handScale(landmarks);
}

/**
 * How extended a finger is, in hand units: fingertip to wrist.
 * A curled finger sits close to the wrist, an extended one far from it.
 */
export function fingerExtension(landmarks, tipIndex) {
  return distance2D(landmarks[tipIndex], landmarks[LM.WRIST]) / handScale(landmarks);
}

const FINGER_TIPS = [LM.INDEX_TIP, LM.MIDDLE_TIP, LM.RING_TIP, LM.PINKY_TIP];

/**
 * Rough "is this a closed fist" measure in [0, 1]-ish terms: the mean extension
 * of the four fingers. Used for the left-hand modifier, where we only need to
 * separate "fist" from "open", not to classify a full alphabet of poses.
 */
export function meanFingerExtension(landmarks) {
  let sum = 0;
  for (const tip of FINGER_TIPS) sum += fingerExtension(landmarks, tip);
  return sum / FINGER_TIPS.length;
}

/**
 * How much wider the neighbouring finger gaps are than the index/middle pair.
 *
 * This is the measurement the pointer gesture turns on. The obvious one — the
 * distance between the index and middle tips — does not work, and measuring it
 * on labelled poses is what showed why: an open hand has those two tips close
 * together too, so on 604 labelled frames it separated pointer from not-pointer
 * with an AUC of only 0.794. Comparing the pair against the gaps on either side
 * of it reaches 0.967, because it asks the question that actually distinguishes
 * the pose: are these two fingers held together *relative to the others*.
 */
export function neighbourGap(landmarks) {
  const scale = handScale(landmarks);
  const indexMiddle = distance2D(landmarks[LM.INDEX_TIP], landmarks[LM.MIDDLE_TIP]) / scale;
  const middleRing = distance2D(landmarks[LM.MIDDLE_TIP], landmarks[LM.RING_TIP]) / scale;
  const ringPinky = distance2D(landmarks[LM.RING_TIP], landmarks[LM.PINKY_TIP]) / scale;
  return (middleRing + ringPinky) / 2 - indexMiddle;
}

/**
 * MediaPipe reports handedness from the camera's point of view. The preview is
 * mirrored for the user, so its "Right" is the user's left hand. This returns
 * the label from the *user's* perspective, which is what gesture bindings mean.
 *
 * @param {{label?: string}} [handedness]
 * @returns {'left'|'right'|'unknown'}
 */
export function userHandFrom(handedness) {
  const label = handedness && handedness.label;
  if (label === 'Right') return 'left';
  if (label === 'Left') return 'right';
  return 'unknown';
}

/**
 * The part of the camera frame that maps to the viewport, as insets in
 * landmark space (fractions of the frame, before mirroring).
 *
 * Hand tracking needs the *whole* hand in view, but the pointer rides a
 * fingertip. Mapping the full frame to the full viewport therefore makes the
 * edges of the screen unreachable: by the time the fingertip is at the edge of
 * the camera image the wrist has already left it, the hand stops being tracked
 * and the pointer disappears — which reads as the tracker failing rather than
 * as running out of room. Reserving a margin and stretching what is left across
 * the whole viewport means the screen edge is reached while the hand is still
 * comfortably inside the frame.
 *
 * The insets are not symmetric, because a hand is not. Fingers point up and the
 * wrist trails below, so a fingertip at the top of the frame still has the
 * whole hand in view while one at the bottom does not — `bottom` is the inset
 * that has to be generous and `top` the one that can be small.
 *
 * `left` and `right` are named for the camera frame, not the user. The mapping
 * mirrors x, so the camera's left edge is the viewport's right; with the two
 * defaults equal that distinction does not bite, but it matters if they are
 * changed independently.
 */
export const DEFAULT_ACTIVE_REGION = { left: 0.14, right: 0.14, top: 0.06, bottom: 0.24 };

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Normalized landmark coordinates are in [0,1] with x increasing to the right
 * of the *camera* image. The user sees a mirrored preview, so viewport x is
 * flipped. y needs no flip.
 *
 * @param {{x:number,y:number}} landmark
 * @param {number} viewportWidth
 * @param {number} viewportHeight
 * @param {{left:number,right:number,top:number,bottom:number}} [activeRegion]
 *   Maps this sub-rectangle of the frame to the whole viewport. Omit for the
 *   plain full-frame mapping.
 */
export function landmarkToViewport(landmark, viewportWidth, viewportHeight, activeRegion) {
  let u = landmark.x;
  let v = landmark.y;

  if (activeRegion) {
    const spanX = 1 - activeRegion.left - activeRegion.right;
    const spanY = 1 - activeRegion.top - activeRegion.bottom;
    // A region with no area would divide by zero; treat it as the frame centre
    // rather than producing NaN and losing the pointer entirely.
    u = spanX > 1e-6 ? clamp01((landmark.x - activeRegion.left) / spanX) : 0.5;
    v = spanY > 1e-6 ? clamp01((landmark.y - activeRegion.top) / spanY) : 0.5;
    // Clamping rather than extrapolating is deliberate: pushing past the region
    // holds the pointer against the edge of the screen, the way running a
    // finger off the side of a trackpad does. Extrapolating would instead send
    // the pointer somewhere off-screen and make the last few pixels of each
    // edge the hardest place to land on.
  }

  return {
    x: (1 - u) * viewportWidth,
    y: v * viewportHeight,
  };
}
