// src/index.js
//
// Public surface.
//
// The default export stays the React component so that `import AirCursor from
// 'air-cursor'` keeps working. Everything under ./core is exported too, because
// the engine has no React dependency and is usable from plain JS, Vue or Svelte.

export { default, default as AirCursor, enLabels, jaLabels } from './AirCursor.js';

export { AirCursorEngine, DEFAULT_OPTIONS } from './core/engine.js';
export { VirtualPointer, hitTest, HOVER_CLASS } from './core/pointer.js';
export { GrabScroller, findScrollable } from './core/scroller.js';
export { RegionSelector, DEFAULT_REGION_OPTIONS } from './core/region.js';
// Optional: html2canvas is passed in, so importing these adds no dependency.
export {
  cropRegion,
  inlineModernColors,
  resolveColor,
  isAirCursorFurniture,
  CAPTURE_LIMITATIONS,
} from './core/capture.js';
export {
  HandGestureRecognizer,
  TwoHandRecognizer,
  SchmittTrigger,
  DEFAULT_THRESHOLDS,
} from './core/gestures.js';
export { OneEuroFilter, OneEuroPoint } from './core/oneEuro.js';
export { MedianFilter } from './core/median.js';
export {
  LM,
  distance2D,
  midpoint,
  centroid,
  handScale,
  normDistance,
  fingerExtension,
  meanFingerExtension,
  neighbourGap,
  userHandFrom,
  landmarkToViewport,
  DEFAULT_ACTIVE_REGION,
} from './core/landmarks.js';
