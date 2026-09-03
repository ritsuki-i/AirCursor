# AirCursor

**Touchless pointer for the web.** Control any page with your hand through a webcam — hover, click, right click, drag and scroll, delivered as real pointer events that ordinary web UI already understands.

Built on MediaPipe Hands. No hardware beyond a webcam. Runs entirely in the browser; no video ever leaves the device.

[日本語版 README](./README.ja.md)

```bash
npm install air-cursor
```

```jsx
import AirCursor from 'air-cursor';

export default function App() {
  return <AirCursor />;
}
```

That is the whole integration. The component renders a start button; once the user grants camera access, the rest of your page becomes operable by hand.

---

## Why this instead of a click dispatcher

Most webcam gesture libraries find an element with `elementFromPoint` and fire a single `click` on it. That covers buttons and links and nothing else.

AirCursor synthesizes the event stream a real pointing device produces, so behaviour that depends on the *sequence* works:

| Interaction | Events emitted |
| --- | --- |
| Hover | `pointerout` / `pointerleave` → `pointerover` / `pointerenter` (+ `mouse*`) |
| Move | `pointermove`, `mousemove` |
| Click | `pointerdown` → `mousedown` → `pointerup` → `mouseup` → `click` |
| Right click | `pointerdown{button:2}` → `pointerup` → `contextmenu` |
| Drag | `pointerdown` → `pointermove`… → `pointerup`, captured to the press target |

In practice that means a `<div onClick>` responds, Radix and MUI menus open (they listen on `pointerdown`, not `click`), tooltips appear on hover, pointer-based drag libraries work, and handlers that read `event.clientX` receive real coordinates.

## Gestures

| Gesture | Action |
| --- | --- |
| Index + middle fingertips together | Pointer follows your hand |
| …then bring the thumb in | Click. Keep holding to drag |
| Thumb + index pinch, other fingers apart | Grab the page and drag it to scroll |
| Off hand closed into a fist | Modifier: the next click becomes a right click |
| Both hands pinch at once | Frame a rectangle between the two pinch points |
| …open both, then tap once with each | Confirm the rectangle |

All thresholds are measured in **hand units** — the wrist to middle-finger-knuckle distance — so a gesture reads the same whether you are close to the camera or across the room, and regardless of window size.

The pointer asks for two things, not one: that the index and middle are held
together *relative to the other fingers*, and that they are held together at
all. The first alone accepts a V sign — it compares the index/middle gap against
the neighbouring ones, so curling the ring and pinky raises the score however far
the two pointing fingers are spread, and a V sign curls exactly those two.
Measured on 46 recorded V signs: with only the first test, **87% of them engage
the pointer**. With both, none do, and every frame of the clean pointer
recording still engages it.

### Reaching the edges of the screen

Tracking needs the whole hand in frame, but the pointer rides a fingertip. Map
the full camera frame to the full viewport and the edges of the screen become
unreachable: the fingertip only arrives there once the wrist has left the frame,
at which point the hand stops being tracked altogether. It reads as the tracker
failing rather than as running out of room.

So a sub-rectangle of the frame is mapped to the whole viewport instead, and
pushing past it holds the pointer against the edge of the screen the way running
a finger off a trackpad does. The insets are asymmetric because a hand is —
fingers point up and the wrist trails below, so the margin below the pointer has
to hold a whole hand while the one above it does not:

```js
{ left: 0.14, right: 0.14, top: 0.06, bottom: 0.24 }   // fractions of the frame
```

The camera preview outlines the region in red and dims what is outside it, so
the mapping is visible rather than something to deduce. `activeRegion={null}`
restores the plain full-frame mapping.

### Sharing the main thread

MediaPipe's inference runs on the main thread and is not cheap — it is most of a
60Hz frame on its own. The Camera helper offers it a frame on every animation
frame, so left alone the tracker takes every millisecond available and whatever
else the page is drawing gets the remainder. Two defaults follow from that:

| | | |
| --- | --- | --- |
| `inferenceFps` | 30 | Caps the tracking rate. The pointer is filtered and interpolated between inferences, so tracking faster is not visible — but the frames it skips are the only ones the page has to render in. 30 is also the rate the thresholds were fitted at. |
| `camera` | 640×480 | The landmark model works from a crop resampled to a couple of hundred pixels, so 720p cost most of the frame budget for nothing. |

The engine is handed to `onStart`, and `engine.inferenceCount` counts completed
inferences. Sample it once a second beside your own frame counter: the two share a thread and trade against each
other, so seeing them apart is what says which of the two a stutter belongs to.
Averaging them into one number hides exactly that.

### Selecting a region with both hands

Pinch with **both** hands to frame a rectangle between the two pinch points, open
your hands to freeze it, then **tap once with each hand** to confirm. Waiting it
out instead abandons it. Clicking and scrolling are suppressed for as long as a
selection is in progress, because a one-hand pinch is itself the scroll gesture —
and they stay suppressed until both hands open again, so the tap that confirmed a
selection cannot go on to scroll the page.

The two confirming taps are matched on **when each one begins**, inside a 700ms
window, rather than on both hands reading pinched on the same frame. Two hands
asked to tap together land about a fifth of a second apart, and each pinch is
believed only after its own median filter and hold window — so the two believed
pinches routinely never overlap at all, and asking for one frame where they do
drops most honest confirming taps.

```jsx
<AirCursor onRegionSelect={({ left, top, width, height }) => capture(...)} />
```

```js
document.addEventListener('aircursor:regionselect', (e) => {
  const { left, top, width, height } = e.detail;   // viewport pixels
});
```

While a selection is being made, `onState` carries a `region` field so you can
draw the rectangle and say what it is waiting for:

```js
{
  phase: 'framing' | 'pending' | 'cooldown',
  awaitingConfirm: boolean,   // both hands open: a tap will now count
  halfConfirmed: boolean,     // one hand has tapped, the other is expected
  rejected: 'tooSmall' | 'timeout' | null,   // set for one frame
  rect,
}
```

`rejected` is worth surfacing. A rectangle that simply vanishes looks exactly
like a gesture that was never recognised, which leaves the user repeating a
gesture that was in fact seen and thrown away.

The library reports the rectangle and stops there — what a region is *for*
differs per application. It does ship the two corrections that turning one into
an image needs, as `cropRegion`, because both of them fail *after* the gesture
has worked and so get blamed on the gesture:

```jsx
import AirCursor, { cropRegion } from 'air-cursor';
import html2canvas from 'html2canvas';   // your dependency, not the library's

<AirCursor onRegionSelect={async (rect) => {
  const canvas = await cropRegion(html2canvas, rect);
  document.querySelector('#shot').src = canvas.toDataURL('image/png');
}} />
```

html2canvas is passed in rather than imported, so the library takes no
dependency on it. AirCursor's own cursor and camera preview are left out of the
crop already; pass `ignoreElements` to leave out more. Worth knowing before you reach for a screenshot: the
capture APIs are gated behind a real user gesture that a synthetic pointer cannot
supply. `getDisplayMedia()` needs one only to *start*, so grant it once from a
real click and read frames from the live stream afterwards; `html2canvas` needs
no permission but misses cross-origin iframes, `<video>` and WebGL canvases
without `preserveDrawingBuffer`; a browser extension's `chrome.tabs.captureVisibleTab()`
has neither problem.

Two html2canvas traps cost real debugging time here, both of which fail *after*
the gesture has worked, so they look like a broken gesture:

```js
html2canvas(document.body, {
  // The rectangle arrives in viewport pixels and html2canvas wants document
  // pixels, so add the scroll offset — then pin scrollX/scrollY to zero.
  // They default to the current window scroll and are applied on top of x/y,
  // which cancels the offset you just added: the crop comes out the same
  // distance down from the *document* top instead of from the viewport, so it
  // is only correct while the page happens to be scrolled to the top.
  x: rect.left + window.scrollX,
  y: rect.top + window.scrollY,
  scrollX: 0,
  scrollY: 0,
  width: rect.width,
  height: rect.height,
});
```

The cost of pinning them is that `position: fixed` elements are drawn at their
viewport offset from the document top, so a fixed overlay lands in a crop taken
near the top of the page rather than the one that was framed.

The second trap is colour: html2canvas 1.4.1 predates the modern CSS colour
functions and *throws* rather than skipping one, aborting the whole capture with
`Attempting to parse an unsupported color function`. One `color-mix()` anywhere
in the page — Chrome serializes it as `color(srgb …)` — is enough to make every
crop fail. The demo normalises the clone in `onclone` by resolving any such
colour through a 1×1 canvas; see `docs/assets/demo.js`.

Turn the gesture off with `regionSelectEnabled={false}`.

## Options

```jsx
<AirCursor
  labels={jaLabels}              // or any partial override of the English strings
  dominantHand="right"           // the other hand becomes the modifier
  modifierEnabled={true}
  regionSelectEnabled={true}    // both hands pinch to frame a region
  showPreview={true}
  previewPosition="bottom-right"
  skipConsent={false}            // true if you show your own instructions
  autoStart={false}              // requires camera permission to already be granted
  mediapipeBasePath="/mediapipe" // self-host the model for offline or kiosk use
  inferenceFps={30}              // cap on tracking rate; it shares your main thread
  camera={{ width: 640, height: 480 }}
  activeRegion={{ bottom: 0.24 }} // which part of the frame reaches the screen edges
  filter={{ minCutoff: 1.2, beta: 0.012 }}
  scroll={{ gain: 2.2, horizontal: true }}
  thresholds={{ selectEnter: 0.38 }}
  onState={(s) => console.log(s?.mode)}
  onRegionSelect={(r) => console.log(r)}
  onError={(e) => console.error(e)}
/>
```

Every prop is optional. See [`src/index.d.ts`](./src/index.d.ts) for the full typed surface.

### Localisation

English is the default. Japanese strings ship in the package:

```jsx
import AirCursor, { jaLabels } from 'air-cursor';

<AirCursor labels={jaLabels} />
```

Pass a partial object to override individual strings.

## Using it without React

The engine has no React dependency:

```js
import { AirCursorEngine } from 'air-cursor';

const engine = new AirCursorEngine({
  video: document.querySelector('video'),
  cursorElement: document.querySelector('#cursor'),
  onState: (state) => {
    // { x, y, mode: 'idle' | 'aim' | 'press' | 'grab', modifier } — or null
  },
});

await engine.start();
// engine.stop() releases the camera
```

The individual pieces are exported too, if you want to build your own mapping: `VirtualPointer`, `GrabScroller`, `TwoHandRecognizer`, `OneEuroFilter`, and the landmark helpers.

## Known limits

These are properties of the browser platform rather than bugs to be fixed here.

- **No user activation.** Synthetic events carry `isTrusted: false`, so anything gated behind a real user gesture cannot be triggered: clipboard reads, `requestFullscreen()`, `window.open()`. Clipboard *writes* generally succeed in Chrome, where `clipboard-write` is granted to the focused tab, but not in Firefox or Safari.
- **CSS `:hover` does not respond.** Hover styling is driven by the browser's own hit testing. JavaScript hover handlers fire correctly; `:hover` rules do not. AirCursor adds the class `aircursor-hover` to the element under the cursor, so style that alongside it:
  ```css
  .card:hover,
  .card.aircursor-hover { background: #eef; }
  ```
- **Native HTML5 drag-and-drop does not start.** `draggable="true"` only responds to trusted input. Pointer-event based drag libraries (dnd-kit, Radix, most sortables) work normally.
- **Double click is out of reach by hand.** A click only registers once the pose has been held long enough not to be a thumb passing through on its way somewhere else, and two of those cannot fit inside the window a browser counts as a double click. `VirtualPointer` still emits `dblclick` when two clicks do land close enough together — a mouse driving the same page gets one — but a hand will not produce it. Bind anything that would need one to a single click.
- **The model is fetched from a CDN by default.** Point `mediapipeBasePath` at a self-hosted copy of `@mediapipe/hands` for offline installations.

## Requirements

- A browser with `getUserMedia` and WebAssembly: Chrome, Edge, Firefox, Safari 16+
- A secure context (`https://` or `localhost`) — cameras are unavailable otherwise
- React 17, 18 or 19 for the component; none for the engine

## How it stays steady

Inference and actuation are deliberately separated. MediaPipe runs at whatever rate the CPU allows and that rate fluctuates; scrolling, cursor movement and physics run on `requestAnimationFrame` instead, so motion stays smooth when tracking stutters.

Pointer position passes through a [One Euro filter](https://gery.casiez.net/1euro/), which smooths hard when the hand is still and barely at all when it moves fast — the trade-off a fixed low-pass filter cannot make. Gesture booleans use separate enter and exit thresholds plus a short hold window, so a hand resting near a threshold cannot chatter, and poses passing through on the way to another pose do not fire.

## Development

```bash
npm install
npm run build   # dual CJS + ESM build into dist/
npm test        # builds, then runs the suite against dist/
npm run label   # serves the gesture labeler at /tools/labeler.html
```

### Calibrating the gesture thresholds

The thresholds in `DEFAULT_THRESHOLDS` are not guesses to be nudged: they are
fitted from labelled poses. Run `npm run label`, hold each pose while holding
its number key, then press Analyse. It reports, per decision, where the enter and
exit lines belong and whether the two poses separate at all — a decision marked
`inseparable` needs a different measurement, not a different number.

Recordings export as JSON and keep the raw landmarks, so a set collected once can
be re-fitted later, or used to train a classifier, without collecting it again.

## Citing AirCursor

If you use AirCursor in a product, a paper, or any other work, a citation is
appreciated.

```bibtex
@software{ishikawa2026aircursor,
  author  = {Ishikawa, Ritsuki},
  title   = {{AirCursor}: A Touchless Pointer for the Web},
  year    = {2026},
  version = {2.0.0},
  url     = {https://github.com/ritsuki-i/AirCursor}
}
```

## Licence

MIT (c) Ritsuki Ishikawa
