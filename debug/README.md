# debug — a harness for the published package

This app exists to answer one question the repo's own tests cannot: **does the
thing people install actually work?**

It imports `air-cursor` from `node_modules`, installed from the tarball
`npm pack` produces. That is deliberate, and it is the whole point:

- a path dependency (`"air-cursor": "file:.."`) symlinks the working tree, which
  bypasses the `files` allowlist, the `exports` map and the compiled `dist/`
  entirely. A package can pass every test in its own repo and still fail to
  import once published, and a path dependency will not catch it.
- the tarball is byte-for-byte what `npm publish` uploads.

It previously imported a 26 kB copy of `AirCursor.jsx` kept inside `src/`, so it
tested nothing but that copy. The copy is gone.

## Running it

Whenever the library changes:

```bash
cd debug
npm run use-local      # builds, packs and installs the tarball in one step
npm start
```

`use-local` has to be repeated after every library change: npm caches the
tarball by path, so reinstalling is what copies the new one in.

It is also the step a **fresh clone** needs before `npm install` will work here
at all. The dependency points at `../air-cursor-<version>.tgz`, and that tarball
is gitignored — a build artefact, not source — so it does not exist until
something packs it.

## What each panel checks

| Panel | Checks |
| --- | --- |
| Plain div | a click reaches an `onClick` on something that is not a button or a link |
| Hover | `pointerenter` / `pointerleave`, which tooltips and menus rely on |
| Right click | off-hand fist turns the next click into `contextmenu` |
| Drag | `pointerdown` → `pointermove` → `pointerup`, captured to the press target |
| Nested scroll | grabbing inside a scrollable panel scrolls the panel, not the page |
| Region capture | a two-hand selection is reported and cropped by the package's own `cropRegion` |

The HUD shows **render** and **infer** rates separately. They share the main
thread and trade against each other, so a high infer figure next to a low render
one is the whole story of a stuttering page — averaged into one number, that is
exactly what disappears.

## Capture without a camera

The **Capture without a camera** button runs the capture path with a rectangle
taken from the viewport, so the crop can be checked without granting camera
access or making the gesture.

**Scroll down before pressing it.** The coordinate bug it exists to catch — the
crop coming from the top of the document rather than from the viewport — is
invisible at the top of the page, which is the one place it happens to be
correct.

## The page is deliberately taller than the viewport

Same reason. A harness that fits on one screen cannot catch anything to do with
scroll offsets.
