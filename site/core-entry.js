// Browser bundle for the demo site.
//
// Only the dependency-free part of the library is bundled here: filtering,
// gesture recognition, pointer synthesis and scrolling. MediaPipe itself is
// loaded from a CDN by the page, so the bundle stays a few kilobytes and the
// heavy wasm download only happens when a visitor actually starts the demo.

export { AirCursorEngine, DEFAULT_OPTIONS } from '../src/core/engine.js';

export { OneEuroPoint, OneEuroFilter } from '../src/core/oneEuro.js';
export { MedianFilter } from '../src/core/median.js';
export { TwoHandRecognizer, HandGestureRecognizer, DEFAULT_THRESHOLDS } from '../src/core/gestures.js';
export { VirtualPointer, hitTest, HOVER_CLASS } from '../src/core/pointer.js';
export { GrabScroller } from '../src/core/scroller.js';
export { RegionSelector, DEFAULT_REGION_OPTIONS } from '../src/core/region.js';
export {
  cropRegion,
  inlineModernColors,
  resolveColor,
  isAirCursorFurniture,
} from '../src/core/capture.js';
export {
  LM,
  midpoint,
  landmarkToViewport,
  DEFAULT_ACTIVE_REGION,
  normDistance,
  handScale,
  fingerExtension,
  meanFingerExtension,
  neighbourGap,
  userHandFrom,
} from '../src/core/landmarks.js';
