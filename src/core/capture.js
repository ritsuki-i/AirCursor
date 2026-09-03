// src/core/capture.js
//
// Turning a reported region into an image.
//
// The library reports rectangles and does not capture anything itself, for a
// reason that has not changed: what a region is *for* differs per application,
// and the capture APIs a screenshot would need are gated behind a real user
// gesture that a synthetic pointer cannot supply. This file does not change
// that. It carries the two corrections that are easy to get wrong and expensive
// to find, and nothing else.
//
// Both of them fail *after* the gesture has worked, which is what makes them
// costly: the rectangle is framed, the selection is confirmed, and then the
// crop comes back wrong or not at all — so the gesture is what gets blamed and
// rewritten.
//
//   1. Coordinates. The rectangle arrives in viewport pixels and html2canvas
//      wants document pixels, so the scroll offset is added — and then
//      `scrollX`/`scrollY` have to be pinned to zero, because they default to
//      the current window scroll and are applied on top of x/y, cancelling the
//      offset just added. Measured across four scroll positions, the default
//      captured the right rectangle only at the very top of the page.
//
//   2. Colour. html2canvas 1.4.1 predates the modern CSS colour functions and
//      does not skip one it cannot read — it throws, aborting the whole
//      capture. Chrome serializes `color-mix(in srgb, …)` as `color(srgb …)`,
//      so a single color-mix() anywhere on the page is enough to make every
//      crop fail with "Attempting to parse an unsupported color function".
//
// html2canvas is passed in rather than imported, so the library takes no
// dependency on it and applications that capture some other way pay nothing.

/** Colour functions html2canvas 1.x cannot parse. */
const COLOR_FUNCTION = /\b(?:color|color-mix|oklch|oklab|lab|lch|hwb)\((?:[^()]|\([^()]*\))*\)/g;

/** Every computed property html2canvas reads as a colour. */
const COLOR_PROPERTIES = [
  'color', 'backgroundColor', 'backgroundImage', 'boxShadow', 'textShadow',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'outlineColor', 'textDecorationColor', 'textEmphasisColor', 'caretColor',
  'columnRuleColor', 'fill', 'stroke', 'stopColor', 'webkitTextFillColor',
  'webkitTextStrokeColor',
];

/**
 * AirCursor's own on-screen furniture, by the class names the component gives
 * it. Excluded from every crop by default.
 *
 * Found by using the shipped package rather than by reading it: the obvious
 * thing to write is `ignoreElements: (el) => el.id === 'cursor'`, and the
 * component uses classes, so a first crop comes back with the pointer and the
 * camera preview sitting in it. Nobody wants their own cursor in a screenshot,
 * so this is not a decision worth making per application.
 */
const OWN_CLASSES = ['aircursor-preview', 'aircursor-root', 'aircursor-cursor'];

/** True for AirCursor's own cursor, preview and overlay root. */
export function isAirCursorFurniture(el) {
  if (!el || !el.classList) return false;
  for (const name of OWN_CLASSES) if (el.classList.contains(name)) return true;
  return false;
}

let probe = null;

/**
 * Resolve any CSS colour to `rgba(r, g, b, a)`.
 *
 * Painting it onto a 1x1 canvas and reading the pixel back gets an exact answer
 * for any colour the *browser* understands, which is a superset of what
 * html2canvas does — so no colour-space arithmetic is needed here, and a
 * notation invented after this file was written still resolves.
 */
export function resolveColor(value) {
  if (!probe) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    probe = canvas.getContext('2d', { willReadFrequently: true });
  }
  // 'copy' writes the alpha straight through instead of compositing it against
  // what is already there, so a translucent colour reads back at its own alpha.
  probe.globalCompositeOperation = 'copy';
  probe.fillStyle = '#000';
  probe.fillStyle = value;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})`;
}

/**
 * Rewrite unreadable colour functions as rgba(), inline, on a cloned document.
 *
 * Pass as html2canvas's `onclone`. Safe to run on a page with none: it walks
 * computed styles and touches only the values that actually match.
 *
 * @param {HTMLElement} root usually the cloned document's body
 */
export function inlineModernColors(root) {
  if (!root || !root.querySelectorAll) return;
  const view = root.ownerDocument.defaultView;
  for (const el of root.querySelectorAll('*')) {
    const computed = view.getComputedStyle(el);
    for (const property of COLOR_PROPERTIES) {
      const value = computed[property];
      if (typeof value !== 'string' || !COLOR_FUNCTION.test(value)) continue;
      COLOR_FUNCTION.lastIndex = 0;
      // Only the colour functions inside the value are replaced: a gradient or
      // a shadow carries lengths and keywords that have to survive intact.
      el.style[property] = value.replace(COLOR_FUNCTION, resolveColor);
    }
  }
}

/**
 * Crop a reported region out of the page with html2canvas.
 *
 * @param {Function} html2canvas the html2canvas function itself
 * @param {{left:number,top:number,width:number,height:number}} rect
 *   viewport pixels, exactly as `onRegionSelect` reports them
 * @param {object} [options]
 * @param {HTMLElement} [options.element=document.body] what to render
 * @param {(el: Element) => boolean} [options.ignoreElements] leave more elements
 *   out; AirCursor's own cursor and preview are already excluded
 * @param {number} [options.scale] device pixel ratio, capped at 2 by default
 * @param {string|null} [options.backgroundColor=null]
 * @param {object} [options.html2canvasOptions] merged in last, for anything else
 * @returns {Promise<HTMLCanvasElement>}
 */
export function cropRegion(html2canvas, rect, options = {}) {
  const {
    element = document.body,
    ignoreElements,
    scale = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1),
    backgroundColor = null,
    html2canvasOptions = {},
  } = options;

  return html2canvas(element, {
    // Viewport pixels to document pixels…
    x: rect.left + window.scrollX,
    y: rect.top + window.scrollY,
    // …and then no second helping of the same offset. See the note at the top:
    // these default to the current scroll and are applied on top of x/y.
    scrollX: 0,
    scrollY: 0,
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
    scale,
    backgroundColor,
    logging: false,
    ignoreElements: (el) => isAirCursorFurniture(el)
      || (ignoreElements ? ignoreElements(el) : false),
    onclone: (clonedDocument) => inlineModernColors(clonedDocument.body),
    ...html2canvasOptions,
  });
}

/**
 * What the fix above costs, stated because it is a real limitation and not a
 * detail: with `scrollX`/`scrollY` pinned, html2canvas draws `position: fixed`
 * elements at their viewport offset from the *document* top. A fixed overlay
 * therefore lands in a crop taken near the top of the page rather than in the
 * one that was framed. It is the lesser of the two errors by a wide margin —
 * the alternative is every crop below the fold being of the wrong place — but
 * if a page's fixed furniture matters, exclude it with `ignoreElements`.
 */
export const CAPTURE_LIMITATIONS = Object.freeze({
  fixedElementsMisplaced: true,
  crossOriginIframes: false,
  videoElements: false,
  webglWithoutPreserveDrawingBuffer: false,
});
