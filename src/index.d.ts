// Type definitions for air-cursor
// Project: https://github.com/ritsuki-i/AirCursor

import type { ComponentType } from 'react';

export type HandSide = 'left' | 'right';
export type PreviewPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
export type CursorMode = 'idle' | 'aim' | 'press' | 'grab' | 'region';

/** Insets, as fractions of the camera frame, in landmark space. */
export interface ActiveRegion {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The part of the camera frame mapped to the whole viewport.
 *
 * Tracking needs the whole hand in view but the pointer rides a fingertip, so
 * a full-frame mapping makes the screen edges unreachable: the fingertip gets
 * there only once the wrist has left the frame and tracking has dropped. The
 * insets are asymmetric because a hand is — the wrist trails below the fingers,
 * so `bottom` is the one that has to be generous.
 */
export declare const DEFAULT_ACTIVE_REGION: ActiveRegion;

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface Point2D {
  x: number;
  y: number;
}

/** Parameters of the One Euro filter applied to the pointer position. */
export interface FilterOptions {
  /** Cutoff frequency (Hz) at zero speed. Lower is steadier at rest. Default 1.2 */
  minCutoff?: number;
  /** Speed coefficient. Higher reduces lag when moving fast. Default 0.012 */
  beta?: number;
  /** Cutoff frequency (Hz) for the derivative estimate. Default 1.0 */
  dCutoff?: number;
}

/** Gesture thresholds, expressed in hand units (wrist to middle-finger MCP). */
export interface ThresholdOptions {
  /** thumb/index distance to grab when not pointing. Default 0.204 */
  grabEnter?: number;
  /** …and to release. Default 0.287 */
  grabExit?: number;
  /**
   * How much wider the neighbouring finger gaps must be than the index/middle
   * pair, to engage the pointer. Default 0.180
   */
  aimEnter?: number;
  /** …and the value it may fall back to before releasing. Default 0.058 */
  aimExit?: number;
  /** thumb/index distance to click while pointing. Default 0.303 */
  selectEnter?: number;
  /** …and to release. Default 0.384 */
  selectExit?: number;
  /** Cap on the index/middle tip separation while aiming, in hand units — a V sign is not a pointer. Default 0.238 */
  aimSeparationEnter?: number;
  /** …and the separation at which an active pointer is dropped. Default 0.388 */
  aimSeparationExit?: number;
  /** mean finger extension below which a hand counts as a fist. Default 1.033 */
  fistEnter?: number;
  /** …and above which it opens again. Default 1.216 */
  fistExit?: number;
  /** How long a pose must hold before it is reported, in ms. Default 60 */
  holdMs?: number;
  /**
   * How long the click pose must hold, in ms. Longer than the rest on purpose:
   * a click is the one gesture that is not free to get wrong. Default 140
   */
  selectHoldMs?: number;
  /**
   * Window of the running median applied to each measurement before it is
   * thresholded, which is what stops one mistracked frame firing a gesture.
   * Default 3; 1 disables it.
   */
  medianWindow?: number;
}

export interface ScrollOptions {
  /** Page pixels travelled per hand pixel. Default 2.2 */
  gain?: number;
  /** Seconds; how tightly the page tracks the hand. Default 0.055 */
  followTau?: number;
  /** Seconds; inertia decay time constant after release. Default 0.35 */
  frictionTau?: number;
  /** px/s below which releasing does not fling. Default 40 */
  minFlingSpeed?: number;
  /** px/s cap on the fling. Default 4200 */
  maxFlingSpeed?: number;
  /** Also drag on the x axis. Default true */
  horizontal?: boolean;
}

export interface PointerOptions {
  pointerType?: 'mouse' | 'pen' | 'touch';
  /** Max gap between the two clicks of a double click, in ms. Default 400 */
  doubleClickMs?: number;
  /** Max distance between them, in px. Default 16 */
  doubleClickSlop?: number;
  /** Toggle the `aircursor-hover` class on the hovered element. Default true */
  hoverClass?: boolean;
}

export interface HandsOptions {
  maxNumHands?: number;
  modelComplexity?: 0 | 1;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
}

export interface CameraOptions {
  width?: number;
  height?: number;
}

export interface HandState {
  grabbing: boolean;
  aiming: boolean;
  selecting: boolean;
  fist: boolean;
  metrics: {
    thumbIndex: number;
    indexMiddle: number;
    /** Neighbour-gap score: what the pointer gesture is decided on. */
    gapScore: number;
    extension: number;
  };
}

/** A rectangle in viewport pixels. */
export interface Region {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export type RegionPhase = 'framing' | 'pending' | 'cooldown';

/** Why a selection was thrown away instead of being reported. */
export type RegionRejection = 'tooSmall' | 'timeout';

export interface RegionState {
  /**
   * 'framing' while both hands hold it, 'pending' once frozen, 'cooldown' once
   * it has resolved and the hands have yet to open. Clicking and scrolling stay
   * suppressed for all three.
   */
  phase: RegionPhase;
  /** True once both hands have opened and a confirming tap will count. */
  awaitingConfirm: boolean;
  /** True once one hand has tapped and the other is still expected. */
  halfConfirmed: boolean;
  /**
   * Set for a single frame when a selection is thrown away, naming why. Worth
   * showing: a rectangle that just disappears looks the same as a gesture that
   * was never recognised.
   */
  rejected: RegionRejection | null;
  rect: Region | null;
}

/** Emitted once per animation frame. `null` while no hand is tracked. */
export interface AirCursorState {
  x: number;
  y: number;
  mode: CursorMode;
  modifier: boolean;
  hand: HandState;
  /** Non-null only while a two-hand selection is being made. */
  region: RegionState | null;
}

export interface Labels {
  start: string;
  dialogTitle: string;
  grab: string;
  aim: string;
  click: string;
  rightClick: string;
  confirm: string;
  showPreview: string;
  previewPosition: string;
  positions: Record<PreviewPosition, string>;
  begin: string;
  close: string;
  stop: string;
  cameraError: string;
}

export const enLabels: Labels;
export const jaLabels: Labels;

export interface AirCursorProps {
  /** @deprecated pass `labels={{ start: '...' }}` instead */
  buttonText?: string;
  /** Partial override of the built-in English strings. */
  labels?: Partial<Labels>;
  /** Which hand drives the pointer. The other one acts as the modifier. Default 'right' */
  dominantHand?: HandSide;
  /** Off-hand fist turns the next click into a right click. Default true */
  modifierEnabled?: boolean;
  /**
   * Both hands pinch to frame a rectangle, open to freeze it, then tap once
   * with each hand to confirm. Clicking and scrolling are suppressed while one
   * is in progress.
   * Default true
   */
  regionSelectEnabled?: boolean;
  region?: RegionOptions;
  showPreview?: boolean;
  previewPosition?: PreviewPosition;
  /** Skip the instructions dialog and start on the first click. Default false */
  skipConsent?: boolean;
  /** Start tracking as soon as the component mounts. Requires prior camera permission. Default false */
  autoStart?: boolean;
  /** Resume tracking after a reload within the same tab session. Default true */
  rememberSession?: boolean;
  /** Where MediaPipe fetches its wasm and model assets from. Point this at a self-hosted copy for offline or kiosk use. */
  mediapipeBasePath?: string;
  /**
   * The sub-rectangle of the camera frame that maps to the whole viewport, so
   * the screen edges can be reached with the hand still fully in frame.
   * `null` restores the plain full-frame mapping. Default DEFAULT_ACTIVE_REGION
   */
  activeRegion?: Partial<ActiveRegion> | null;
  /**
   * Upper bound on inference rate. Inference runs on the main thread, so this
   * is what decides how much of each frame is left for everything else; the
   * pointer is interpolated between inferences, so raising it buys little.
   * 0 removes the cap. Default 30
   */
  inferenceFps?: number;
  filter?: FilterOptions;
  scroll?: ScrollOptions;
  thresholds?: ThresholdOptions;
  hands?: HandsOptions;
  camera?: CameraOptions;
  onStart?: () => void;
  onStop?: () => void;
  onState?: (state: AirCursorState | null) => void;
  /**
   * A two-hand selection was confirmed. Also dispatched on `document` as the
   * `aircursor:regionselect` CustomEvent, with the same rectangle as `detail`.
   */
  onRegionSelect?: (region: Region) => void;
  onError?: (error: Error) => void;
}

declare const AirCursor: ComponentType<AirCursorProps>;
export default AirCursor;
export { AirCursor };

// ---------------------------------------------------------------- core layer

export interface EngineConfig extends Omit<AirCursorProps, 'buttonText' | 'labels' | 'showPreview' | 'previewPosition' | 'skipConsent' | 'autoStart' | 'rememberSession' | 'onStart' | 'onStop'> {
  video: HTMLVideoElement;
  previewCanvas?: HTMLCanvasElement | null;
  cursorElement?: HTMLElement | null;
}

/** Framework-agnostic orchestrator. Usable without React. */
export class AirCursorEngine {
  /**
   * Inferences completed since construction. Sample it once a second next to
   * your own frame counter: the two share a thread, so seeing them apart is
   * what says whether a stutter is the tracker's or the page's.
   */
  readonly inferenceCount: number;
  constructor(config: EngineConfig);
  readonly pointer: VirtualPointer;
  readonly scroller: GrabScroller;
  readonly region: RegionSelector;
  start(): Promise<void>;
  stop(): void;
}

export const DEFAULT_OPTIONS: Record<string, unknown>;

/**
 * Synthesizes a full pointer event stream (hover, move, down/up, click,
 * dblclick, contextmenu, drag) at viewport coordinates.
 *
 * Platform limits: synthetic events carry `isTrusted: false` and do not grant
 * transient user activation, CSS `:hover` does not respond to them (use the
 * `aircursor-hover` class), and native HTML5 drag-and-drop does not start.
 */
export class VirtualPointer {
  constructor(options?: PointerOptions);
  readonly currentTarget: Element | null;
  readonly pressed: boolean;
  move(x: number, y: number): void;
  press(button?: number): void;
  release(): void;
  contextMenu(): void;
  cancel(): void;
  clear(): void;
}

/** Topmost element at a viewport point, descending into open shadow roots. */
export function hitTest(x: number, y: number): Element | null;

/** Class name applied to the element under the cursor. */
export const HOVER_CLASS: string;

/** Position-based grab scrolling with a release fling. Advance it from rAF. */
export interface RegionOptions {
  /** Thumb/index distance to close the pinch, in hand units. Default 0.204 */
  pinchEnter?: number;
  /** …and to open it. Default 0.287 */
  pinchExit?: number;
  /** How long both pinches must hold before framing starts. Default 100 */
  holdMs?: number;
  /** Corner-to-corner distance, in frame widths, below which a rectangle is discarded. Default 0.12 */
  minDiagonal?: number;
  /** How far apart the two confirming taps may begin and still count as one gesture. Default 700 */
  tapWindowMs?: number;
  /** How long a frozen rectangle waits to be confirmed. Extended while a tap is under way. Default 6000 */
  confirmMs?: number;
  medianWindow?: number;
  /** How many frames behind the hands the rectangle sits, so that opening a pinch does not drag a corner. Default 3 */
  settleFrames?: number;
}

/**
 * Two-hand region selection, in normalized landmark space. Both hands pinch to
 * frame, open to freeze, then tap once with each hand to confirm. The two taps
 * are matched on when they begin rather than on both hands reading pinched at
 * once, which two hands almost never do.
 */
export class RegionSelector {
  constructor(options?: RegionOptions);
  update(
    handA: Landmark[] | null,
    handB: Landmark[] | null,
    nowMs: number
  ): {
    phase: 'idle' | RegionPhase;
    rect: { left: number; top: number; width: number; height: number } | null;
    awaitingConfirm: boolean;
    halfConfirmed: boolean;
    committed: { left: number; top: number; width: number; height: number } | null;
    rejected: RegionRejection | null;
  };
  reset(): void;
}

export const DEFAULT_REGION_OPTIONS: Required<RegionOptions>;

export class GrabScroller {
  constructor(options?: ScrollOptions);
  readonly idle: boolean;
  begin(hand: Point2D, elementUnderCursor?: Element | null): void;
  update(hand: Point2D): void;
  end(): void;
  cancel(): void;
  tick(dt: number): void;
}

export function findScrollable(element: Element | null, axis?: 'x' | 'y'): Element | null;

/** Boolean with separate enter/exit thresholds plus a hold time. */
export class SchmittTrigger {
  constructor(options: { enter: number; exit: number; invert?: boolean; holdMs?: number });
  readonly state: boolean;
  /** True while the raw condition is held but the hold window is not yet served. */
  readonly settling: boolean;
  update(value: number, nowMs: number): boolean;
  reset(): void;
}

export class HandGestureRecognizer {
  constructor(thresholds?: ThresholdOptions);
  update(landmarks: Landmark[], nowMs: number): HandState;
  reset(): void;
}

export class TwoHandRecognizer {
  constructor(options?: { dominantHand?: HandSide; thresholds?: ThresholdOptions });
  update(
    multiHandLandmarks: Landmark[][] | undefined,
    multiHandedness: Array<{ label: string }> | undefined,
    nowMs: number
  ): {
    dominant: HandState | null;
    dominantLandmarks: Landmark[] | null;
    off: HandState | null;
    offLandmarks: Landmark[] | null;
    modifier: boolean;
  };
  reset(): void;
}

export const DEFAULT_THRESHOLDS: Required<ThresholdOptions>;

export class OneEuroFilter {
  constructor(options?: FilterOptions);
  filter(value: number, timestampSec: number): number;
  reset(): void;
}

/** A running median, used to drop single mistracked frames. */
export class MedianFilter {
  constructor(size?: number);
  filter(value: number): number;
  reset(): void;
}

export class OneEuroPoint {
  constructor(options?: FilterOptions);
  filter(point: Point2D, timestampSec: number): Point2D;
  reset(): void;
}

// -------------------------------------------------------------- landmark API

export const LM: {
  WRIST: 0; THUMB_CMC: 1; THUMB_MCP: 2; THUMB_IP: 3; THUMB_TIP: 4;
  INDEX_MCP: 5; INDEX_PIP: 6; INDEX_DIP: 7; INDEX_TIP: 8;
  MIDDLE_MCP: 9; MIDDLE_PIP: 10; MIDDLE_DIP: 11; MIDDLE_TIP: 12;
  RING_MCP: 13; RING_PIP: 14; RING_DIP: 15; RING_TIP: 16;
  PINKY_MCP: 17; PINKY_PIP: 18; PINKY_DIP: 19; PINKY_TIP: 20;
};

export function distance2D(a: Point2D, b: Point2D): number;
export function midpoint(a: Point2D, b: Point2D): Point2D;
export function centroid(...points: Point2D[]): Point2D;
export function handScale(landmarks: Landmark[]): number;
export function normDistance(landmarks: Landmark[], a: number, b: number): number;
export function fingerExtension(landmarks: Landmark[], tipIndex: number): number;
export function meanFingerExtension(landmarks: Landmark[]): number;
/** How much wider the neighbouring finger gaps are than the index/middle pair. */
export function neighbourGap(landmarks: Landmark[]): number;
export function userHandFrom(handedness?: { label?: string }): HandSide | 'unknown';
/**
 * Crop a reported region out of the page with html2canvas, which is passed in
 * rather than imported so the library takes no dependency on it.
 *
 * Carries two corrections that are easy to get wrong: viewport-to-document
 * coordinates with `scrollX`/`scrollY` pinned to zero (they otherwise cancel
 * the offset, so the crop is only right at the top of the page), and rewriting
 * modern CSS colour functions on the clone (html2canvas 1.x throws on one
 * rather than skipping it, aborting the whole capture).
 */
export function cropRegion(
  html2canvas: (element: HTMLElement, options?: object) => Promise<HTMLCanvasElement>,
  rect: { left: number; top: number; width: number; height: number },
  options?: {
    element?: HTMLElement;
    ignoreElements?: (el: Element) => boolean;
    scale?: number;
    backgroundColor?: string | null;
    html2canvasOptions?: object;
  }
): Promise<HTMLCanvasElement>;

/** Rewrite unreadable CSS colour functions as rgba(). Pass as html2canvas `onclone`. */
export function inlineModernColors(root: HTMLElement): void;

/** Resolve any CSS colour the browser understands to `rgba(r, g, b, a)`. */
export function resolveColor(value: string): string;

/** True for AirCursor's own cursor, preview and overlay root — excluded from crops by default. */
export function isAirCursorFurniture(el: Element): boolean;

/** What a crop cannot capture. `fixedElementsMisplaced` is the cost of the coordinate fix. */
export const CAPTURE_LIMITATIONS: Readonly<Record<string, boolean>>;

export function landmarkToViewport(
  landmark: Landmark,
  viewportWidth: number,
  viewportHeight: number,
  /** Maps this part of the frame to the whole viewport, clamping past its edges. */
  activeRegion?: ActiveRegion | null
): Point2D;
