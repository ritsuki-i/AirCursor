# Production website

GitHub Pages serves `docs/`. The English HTML, Japanese language switch,
illustrated guide, working demos, installation links and BibTeX citation live
in `docs/index.html` and `docs/assets/demo.js`.

The demo imports the public API of **air-cursor@2.0.0 from the npm registry**,
pinned by tarball URL and integrity in `site/package-lock.json`. It does not
import the repository's unpublished `src/`. `scripts/build-site.mjs` checks the
resolved bundle inputs and writes `docs/assets/demo-package.json` as provenance.
Recognition, pointer dispatch and scrolling belong to that npm engine. There is
no page-specific gesture recognizer or synthetic click dispatcher.

The galaxy shares the simulation and renderers in `website/src/lib/`. On
supported browsers `galaxy-worker.ts` owns the OffscreenCanvas and simulation.
The main thread only sends input/configuration changes. The scene caps physics
catch-up at two 60 Hz steps, reuses GPU buffers, bakes the gas texture once, and
reduces trail geometry. Desktop lights are 14,036 (previously 7,018); mobile and
fallback budgets also double. Camera tracking lowers the render pixel budget
and frame-rate cap. Slow input frames lower those budgets further, retaining
the light count. Hidden/offscreen scenes and paused motion stop rendering.
Worker failure falls back to main-thread WebGL, then Canvas 2D.

Pointing gathers and compresses the field, including while the AirCursor is over
an interactive control. A completed core remains compressed and follows the
pointer for as long as the pointing gesture is held; elapsed time never launches
it. AirCursor continues to own DOM hit testing and pointer/click dispatch. Only
the npm engine's transition from `aim` to `press` releases the light. The on-page
preview exposes the same two steps as “Gather” and “Release”.

From the repository root:

```sh
npm ci --prefix site
npm run build:site
node scripts/serve-site.mjs
```

Preview: http://127.0.0.1:8777. `npm run build:site` rebuilds both the AirCursor
engine bundle and the galaxy. Commit the generated `docs/assets/galaxy.js` with
renderer changes, together with `galaxy-worker.js`, so GitHub Pages does not
need a separate build step. Galaxy-only changes can use `npm run build:galaxy`.

Validation (from `website/`):

```sh
npm test
npm run typecheck
npx playwright test --config playwright.production.config.ts
npm run build
```

The production browser checks cover English defaults, persisted and
storage-disabled language switching, canonical metadata, clipboard actions,
live demo controls, galaxy playback, mobile layout, reduced motion, and Canvas
fallback. The gesture tests replace only camera/model acquisition and replay
landmarks through the published recognizer and engine. They verify language,
copy, galaxy, demo, npm-link and Stop controls without dispatching test clicks
for those actions. Frame-gap measurements cover the main thread on the test
machine; they are not real-camera or device-independent FPS guarantees. Actual
camera recognition still needs a physical-device check.

`src/core/` also contains release-ready library fixes for captured drag release,
disabled controls and stopping from an event handler. These are covered by the
root tests but are **not** substituted into the published-package demo. Publish
the next npm version before updating the demo's pinned release. None of these
commands publishes a package or deploys the site.

The conversion path is demo → npm/install command, with optional BibTeX citation.
Existing Google Analytics receives `demo_started`, `demo_first_click`,
`npm_visit`, `install_copy`, and `citation_copy`. Events contain placement and
package version, never camera data. These are intent signals, not confirmed npm
downloads or proof of download growth.

SEO keeps the default content in English HTML, with descriptive JavaScript/React
titles, crawlable npm links, installation examples, FAQ, canonical metadata,
software structured data, robots and sitemap. This follows [Google Search
Essentials](https://developers.google.com/search/docs/essentials); ranking and
download uplift require post-publication measurement.
