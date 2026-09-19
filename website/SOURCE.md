# AirCursor Website — 全実装コード

実際のファイルをファイル別に収録しています。設計・起動方法は [README.md](./README.md) を参照してください。`package-lock.json` はリポジトリに別途同梱。Next.js が生成する `next-env.d.ts` とビルド出力は収録対象外です。

## .gitignore

```text
node_modules/
.next/
out/
test-results/
playwright-report/
*.tsbuildinfo
next-env.d.ts
*.log
```

## package.json

```json
{
  "name": "aircursor-website",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev --webpack",
    "build": "next build --webpack",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "test": "tsx --test tests/gravity.test.ts tests/particle-field.test.ts",
    "test:browser": "playwright test",
    "docs:source": "node scripts/export-source.mjs"
  },
  "dependencies": {
    "air-cursor": "file:..",
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.55.0",
    "@tailwindcss/postcss": "^4.0.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "tsx": "^4.20.0",
    "typescript": "^5.9.0"
  }
}
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts", ".next/dev/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

## next.config.ts

```typescript
import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  transpilePackages: ["air-cursor"],
  devIndicators: false,
  outputFileTracingRoot: path.resolve(process.cwd(), ".."),
  webpack(config) {
    config.module.rules.push({
      test: /@mediapipe[\\/](hands|camera_utils|drawing_utils)[\\/].*\.js$/,
      type: "javascript/auto",
      use: [{ loader: path.resolve(process.cwd(), "loaders/mediapipe.cjs") }],
    });
    return config;
  },
};

export default config;
```

## postcss.config.mjs

```javascript
export default { plugins: { "@tailwindcss/postcss": {} } };
```

## loaders/mediapipe.cjs

```javascript
/**
 * Legacy MediaPipe packages expose their API through the IIFE's `this`.
 * Webpack otherwise sees no exports. Preserve the vendor source and give its
 * export scope an explicit CommonJS boundary. WASM assets still load on demand.
 */
module.exports = function mediapipeLoader(source) {
  return "var mediapipeExports = {};\n" +
    source.replace(/\.call\(this\);?\s*$/, ".call(mediapipeExports);") +
    "\nmodule.exports = mediapipeExports;\n";
};
```

## src/app/layout.tsx

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AirCursor — Move your hand. Move the Web.",
  description: "A touchless interaction library for the web. Explore a living gravity field with your hand, then bring AirCursor to your own interface.",
  openGraph: { title: "AirCursor — Move your hand. Move the Web.", description: "Touch nothing. Create a new dimension of interaction.", type: "website" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a>{children}</body></html>;
}
```

## src/app/page.tsx

```tsx
import { AirCursorProvider } from "@/components/air-cursor-provider";
import { HandTrackingHero } from "@/components/hand-tracking-hero";
import { SiteHeader } from "@/components/site-header";
import { InteractionLab } from "@/components/interaction-lab";
import { InstallSection } from "@/components/install-section";
import { Brand, Icon } from "@/components/icons";

function CapabilityArt({ type }: { type: "gesture" | "events" | "private" }) {
  return <div className={`capability-art art-${type}`} aria-hidden="true">{type === "gesture" ? <><div className="gesture-path" /><div className="gesture-point"><Icon name="cursor" width="23" height="23" /></div><span className="art-label">a natural extension of you</span></> : type === "events" ? <><span className="event-tag">your gesture</span><div className="event-connector"><i /><i /><i /></div><span className="event-tag event-code">onPointerDown</span></> : <><div className="privacy-orbit"><Icon name="shield" width="32" height="32" /></div><span className="art-label">your camera → your browser</span></>}</div>;
}

export default function Home() {
  return <AirCursorProvider><SiteHeader /><main id="main">
    <HandTrackingHero />
    <div className="principles-strip"><span>BUILT FOR A MORE HUMAN WEB</span><span><i /> Browser-native</span><span><i /> No extra hardware</span><span><i /> Private by design</span><span className="strip-open">Open source, always. <Icon name="github" width="15" height="15" /></span></div>
    <section className="section about-section" id="about" aria-labelledby="about-title"><div className="eyebrow">01 / BEYOND THE SCREEN</div><div className="about-content"><h2 id="about-title">The most natural interface<br />was always <span>in your hands.</span></h2><div className="about-bottom"><p>AirCursor turns your webcam into a new way to interact. Move, click, drag, and scroll with simple hand gestures—on the web you already build.</p><p>A small npm library.<br />An entirely new connection.</p></div></div></section>
    <section className="section capabilities-section" id="capabilities" aria-labelledby="capabilities-title"><div className="section-heading"><div><div className="eyebrow">02 / HUMAN INPUT. WEB OUTPUT.</div><h2 id="capabilities-title">Simple gestures.<br />Extraordinary possibilities.</h2></div><a className="text-link" href="https://github.com/ritsuki-i/AirCursor#gestures">Explore the gestures <Icon /></a></div><div className="capability-grid">{[
      { type: "gesture" as const, n: "01", title: "Intuition, built in.", text: "Point to move. Bring your thumb in to click. Hold to drag. Familiar intentions, without a surface." },
      { type: "events" as const, n: "02", title: "Your UI. Already compatible.", text: "Real pointer event sequences connect gestures to the buttons, menus, and interactions you already use." },
      { type: "private" as const, n: "03", title: "A little camera. A lot of trust.", text: "Hand tracking runs in your browser. Your video stays on your device. All you need is a webcam." },
    ].map(item => <article className="capability-card" key={item.n}><CapabilityArt type={item.type} /><div className="capability-card-copy"><span>{item.n} /</span><h3>{item.title}</h3><p>{item.text}</p></div></article>)}</div></section>
    <InteractionLab /><InstallSection />
    <section className="closing-section" aria-labelledby="closing-title"><div className="closing-orbit" aria-hidden="true" /><div className="eyebrow">THE NEXT INTERACTION IS YOURS.</div><h2 id="closing-title">Make room for<br /><span>a little wonder.</span></h2><a className="button button-primary" href="#install">Start building with AirCursor <Icon /></a><a className="closing-github" href="https://github.com/ritsuki-i/AirCursor"><Icon name="github" width="16" height="16" /> Open source. Open possibilities.</a></section>
  </main><footer className="site-footer"><a href="#" aria-label="Back to top"><Brand /></a><span>A little movement changes everything.</span><div><a href="https://github.com/ritsuki-i/AirCursor">GitHub ↗</a><a href="https://github.com/ritsuki-i/AirCursor#readme">Docs ↗</a><a href="https://github.com/ritsuki-i/AirCursor/blob/main/LICENSE">MIT License ↗</a></div><small>© {new Date().getFullYear()} AirCursor</small></footer></AirCursorProvider>;
}
```

## src/app/globals.css

```css
@import "tailwindcss";
@import "./hero.css";

@theme inline {
  --color-background: #020610;
  --color-foreground: #edf0ee;
  --color-accent: #d7e6ff;
  --font-sans: "Helvetica Neue", Arial, sans-serif;
  --font-mono: "SFMono-Regular", Consolas, monospace;
}

:root { color-scheme: dark; --bg: #020610; --fg: #edf0ee; --muted: #94a0ae; --line: #ffffff13; --mint: #d7e6ff; }
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 28px; }
body { margin: 0; background: var(--bg); color: var(--fg); font-family: var(--font-sans); font-weight: 400; -webkit-font-smoothing: antialiased; }
a { color: inherit; text-decoration: none; }
button { font: inherit; cursor: pointer; }
button, a { -webkit-tap-highlight-color: transparent; }
button:disabled { opacity: .45; cursor: default; }
button, input { color: inherit; }
button { background: none; border: 0; }
::selection { background: #c7eee0; color: #07131b; }
:focus-visible { outline: 2px solid var(--mint); outline-offset: 6px; }
.skip-link { position: fixed; top: -100px; left: 20px; z-index: 100; padding: 16px 24px; background: var(--mint); color: var(--bg); }
.skip-link:focus { top: 12px; }
.site-footer a, .text-link { transition: color .2s; }
.site-footer a:hover, .text-link:hover { color: var(--mint); }
.live-dot { display: inline-block; flex-shrink: 0; width: 5px; height: 5px; background: #b7dfcf; border-radius: 50%; box-shadow: 0 0 9px #b7dfcf44; }
.eyebrow { font: 9px var(--font-mono); font-weight: 400; letter-spacing: 1.7px; color: #a5b5c1; line-height: 1.6; }
.tiny-line { width: 23px; height: 1px; background: #adcac4; }
.button { display: inline-flex; justify-content: center; align-items: center; gap: 12px; border-radius: 5px; font-size: 12px; font-weight: 550; padding: 16px 19px; transition: background .25s, box-shadow .25s, transform .25s; }
.button-primary { background: var(--mint); color: #152721; box-shadow: 0 0 35px #b2e4cd0a; }
.button-primary > svg:last-child { margin-left: 9px; width: 17px; height: 17px; }
.button-primary:hover, .button-primary.aircursor-hover { background: #e8fff3; box-shadow: 0 0 34px #b2e4cd22; transform: translateY(-2px); }
.text-button { display: flex; align-items: center; gap: 9px; font-size: 11px; padding: 8px 0; color: #c3ccd6; }
.text-button:hover { color: #fff; }
.principles-strip { border-block: 1px solid var(--line); min-height: 76px; padding: 20px 5%; display: flex; align-items: center; justify-content: space-between; gap: 24px; color: #afbac4; font-size: 11px; }
.principles-strip > span { display: flex; align-items: center; gap: 9px; }
.principles-strip > span:first-child { font: 8px var(--font-mono); color: #758491; letter-spacing: 1px; }
.principles-strip i { width: 3px; height: 3px; background: #a5babc; border-radius: 50%; }
.strip-open { color: #cee7dc; }
.section { max-width: 1440px; margin: 0 auto; padding: 110px 7.1%; }
h2 { font-family: Georgia, "Times New Roman", serif; font-weight: 400; font-size: clamp(34px,3.5vw,54px); line-height: 1.12; letter-spacing: -.05em; margin: 23px 0 0; }
h2 span { color: #889aa9; }
.about-section { display: grid; grid-template-columns: 1fr 2.1fr; gap: 30px; padding-block: 122px 116px; border-bottom: 1px solid var(--line); }
.about-section > .eyebrow { padding-top: 10px; }
.about-content h2 { margin-top: 0; font-size: clamp(32px,3.3vw,49px); }
.about-bottom { display: flex; justify-content: space-between; gap: 42px; margin-top: 35px; }
.about-bottom p { color: #9ba8b4; line-height: 1.9; font-size: 12px; max-width: 365px; margin: 0; }
.about-bottom p:last-child { font-size: 11px; color: #c2cbc9; min-width: 168px; }
.section-heading { display: flex; justify-content: space-between; align-items: flex-end; gap: 30px; margin-bottom: 48px; }
.section-heading > p { color: #9ba8b4; line-height: 1.9; font-size: 12px; max-width: 300px; margin-bottom: 4px; }
.text-link { display: inline-flex; align-items: center; gap: 20px; padding-bottom: 6px; font-size: 11px; border-bottom: 1px solid #adcbbd55; color: #d4e8df; }
.text-link svg { width: 16px; height: 16px; }
.capability-grid { display: grid; grid-template-columns: repeat(3,1fr); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.capability-card + .capability-card { border-left: 1px solid var(--line); }
.capability-card { background: linear-gradient(150deg,#111b2420,transparent); }
.capability-art { height: 200px; display: flex; justify-content: center; align-items: center; position: relative; overflow: hidden; mask-image: linear-gradient(black 85%,transparent); }
.capability-art::before { content: ""; position: absolute; inset: 20px; background-image: radial-gradient(#a5bfd21f .7px,transparent .7px); background-size: 18px 18px; mask-image: radial-gradient(ellipse,black,transparent 70%); }
.gesture-path { width: 154px; height: 60px; border-top: 1px solid #8daebc; border-radius: 50%; transform: rotate(-27deg); position: relative; }
.gesture-path::after { content: ""; position: absolute; top: -4px; left: 70px; width: 7px; height: 7px; border-radius: 50%; background: #dbf5f0; box-shadow: 0 0 22px #94bfcf; }
.gesture-point { transform: translate(-29px,-14px) rotate(-10deg); color: #dbf5f0; }
.art-label { position: absolute; bottom: 30px; font: 8px var(--font-mono); letter-spacing: .8px; color: #778b99; }
.event-tag { font: 9px var(--font-mono); padding: 9px 10px; border: 1px solid #a9c6d629; border-radius: 3px; color: #b8cbd6; background: #0c141d; position: relative; }
.event-code { color: #cce8d9; }
.event-connector { display: flex; gap: 7px; padding: 0 12px; }
.event-connector i { width: 2px; height: 2px; border-radius: 50%; background: #a9c6d6; }
.privacy-orbit { width: 80px; height: 80px; border: 1px solid #b7d5cf33; border-radius: 50%; display: grid; place-items: center; color: #c0dfd2; position: relative; }
.privacy-orbit::after { content: ""; position: absolute; inset: -14px; border: 1px dashed #b7d5cf1c; border-radius: 50%; }
.capability-card-copy { padding: 10px 28px 33px; }
.capability-card-copy > span { font: 9px var(--font-mono); color: #7c939e; }
.capability-card h3 { font-size: 17px; font-weight: 400; letter-spacing: -.4px; margin: 18px 0 12px; }
.capability-card p { font-size: 12px; line-height: 1.9; color: #98a4b1; margin: 0; }
.lab-section { padding-top: 15px; }
.lab-layout { display: grid; grid-template-columns: 1.35fr 1fr; gap: 65px; align-items: center; }
.demo-browser { border: 1px solid #c7dceb22; border-radius: 6px; overflow: hidden; background: #0b141b; }
.browser-chrome { display: flex; align-items: center; justify-content: space-between; height: 34px; padding: 0 14px; border-bottom: 1px solid var(--line); color: #69808e; font: 8px var(--font-mono); }
.browser-chrome > div { display: flex; gap: 4px; }
.browser-chrome i { width: 4px; height: 4px; border-radius: 50%; background: #45555f; }
.demo-content { height: 330px; position: relative; overflow: hidden; padding: 22px 25px; background: radial-gradient(ellipse at 58% 50%,#1d3e47, #0b171e 70%); }
.demo-wordmark { font-family: Georgia,serif; font-style: italic; font-size: 23px; position: relative; z-index: 1; }
.demo-edition { float: right; color: #a6bec2; font: 6px var(--font-mono); letter-spacing: 1px; margin-top: 8px; }
.demo-art { position: absolute; width: 220px; height: 220px; top: 60px; left: calc(50% - 110px); display: grid; place-items: center; transition: transform 1.2s cubic-bezier(.2,.8,.2,1); }
.demo-art i { position: absolute; width: 85%; height: 85%; border: 1px solid #bbdfd79c; border-radius: 48% 52% 70% 30%; transform: rotate(35deg); box-shadow: inset 0 0 25px #88bfb522,0 0 20px #88bfb511; }
.demo-art i:nth-child(2) { transform: rotate(75deg); width: 75%; height: 75%; opacity: .6; }
.demo-art i:nth-child(3) { transform: rotate(115deg); width: 65%; height: 65%; opacity: .5; }
.demo-art > span { font: italic 90px Georgia,serif; color: #c5dfd8; opacity: .8; }
.forma .demo-content { background: radial-gradient(ellipse at 58% 50%,#383349,#11101d 70%); }
.forma .demo-art i { border-radius: 3px; border-color: #d2cae6; }
.orbit .demo-content { background: radial-gradient(ellipse at 58% 50%,#203c57,#0b131e 70%); }
.orbit .demo-art i { border-radius: 50%; transform: rotateX(50deg) rotate(-35deg); width: 120%; }
.is-expanded .demo-art { transform: rotate(150deg) scale(1.6); }
.demo-caption { position: absolute; bottom: 25px; left: 25px; right: 25px; display: flex; justify-content: space-between; align-items: flex-end; }
.demo-caption span { font: 6px var(--font-mono); color: #9fbcb8; letter-spacing: 1px; }
.demo-caption h3 { font: 27px Georgia,serif; margin: 9px 0 0; letter-spacing: -.8px; }
.demo-caption button { width: 37px; height: 37px; border: 1px solid #cce6df66; border-radius: 50%; display: grid; place-items: center; transition: background .2s; }
.demo-caption button:hover, .demo-caption button.aircursor-hover { background: #cce6df22; }
.demo-footer { height: 36px; display: flex; align-items: center; padding: 0 14px; gap: 7px; font: 6px var(--font-mono); color: #8ea6b0; letter-spacing: .5px; }
.demo-footer > span:last-child { margin-left: auto; font-size: 5px; }
.demo-footer .live-dot { width: 3px; height: 3px; }
.scene-option { width: 100%; text-align: left; display: flex; gap: 18px; align-items: flex-start; padding: 25px 0; border-bottom: 1px solid var(--line); opacity: .58; transition: opacity .25s; }
.scene-option:first-child { padding-top: 0; }
.scene-option.is-selected, .scene-option:hover, .scene-option.aircursor-hover { opacity: 1; }
.scene-number { font: 9px var(--font-mono); color: #92b5a7; margin-top: 4px; }
.scene-option strong { display: block; font-size: 17px; font-weight: 400; letter-spacing: -.4px; }
.scene-option > span > span { display: block; font-size: 11px; line-height: 1.8; color: #a5b4bc; margin-top: 10px; max-width: 250px; }
.scene-option svg { width: 15px; height: 15px; margin-left: auto; margin-top: 3px; color: #b9dacc; }
.lab-note { display: flex; align-items: center; gap: 9px; color: #778e9b; font-size: 9px; margin-top: 24px; line-height: 1.6; }
.lab-note svg { flex-shrink: 0; }
.install-section { display: grid; grid-template-columns: 1fr 1.15fr; gap: 70px; border-block: 1px solid var(--line); }
.install-copy p { color: #9ba8b4; font-size: 12px; line-height: 1.9; margin: 27px 0; }
.install-tags { display: flex; gap: 12px; margin-top: 36px; font: 8px var(--font-mono); color: #8e9ba7; }
.install-tags > span + span { border-left: 1px solid #ffffff20; padding-left: 12px; }
.code-panel { background: #0c121b; border: 1px solid #a1b8d123; border-radius: 6px; overflow: hidden; position: relative; }
.code-tabs { padding: 0 21px; display: flex; align-items: center; gap: 23px; border-bottom: 1px solid var(--line); height: 46px; }
.code-tabs button { font: 10px var(--font-mono); color: #7e8d9c; height: 100%; border-bottom: 1px solid transparent; }
.code-tabs button[aria-pressed=true] { color: #d4e7de; border-color: #d4e7de; }
.code-tabs > span { font: 7px var(--font-mono); margin-left: auto; color: #677a8d; letter-spacing: .8px; }
.install-command { display: flex; gap: 14px; align-items: center; padding: 26px 22px; font-size: 12px; }
.install-command > span { color: #586e80; }
.install-command code { color: #cce5d9; user-select: all; }
.install-command button { margin-left: auto; color: #7d8e9d; }
.copy-message { position: absolute; top: 106px; right: 20px; font-size: 9px; color: #cce5d9; }
.code-file { display: flex; justify-content: space-between; align-items: center; padding: 14px 22px; border-block: 1px solid var(--line); font: 9px var(--font-mono); color: #94a2ae; }
.code-file > span:first-child { display: flex; align-items: center; gap: 8px; }
.code-file > span:last-child { font-size: 7px; color: #677a8d; letter-spacing: .8px; }
.code-file i { height: 7px; width: 7px; background: #739db4; border-radius: 1px; }
pre { padding: 23px 22px 26px; margin: 0; overflow-x: auto; font: 11px/1.9 var(--font-mono); color: #cbd6e1; }
.syntax-muted { color: #7e90a4; }
.syntax-blue { color: #97b9dc; }
.syntax-mint { color: #c2dbbc; }
.code-footnote { border-top: 1px solid var(--line); padding: 15px 20px; display: flex; align-items: center; gap: 8px; font-size: 8px; line-height: 1.7; color: #9cadb9; }
.code-footnote .live-dot { width: 4px; height: 4px; }
.closing-section { position: relative; overflow: hidden; padding: 120px 20px 110px; text-align: center; isolation: isolate; }
.closing-section h2 { font-size: clamp(45px,5.5vw,78px); margin: 23px 0 35px; }
.closing-section h2 span { color: #b5c6d4; }
.closing-section .eyebrow { font-size: 8px; }
.closing-github { display: flex; align-items: center; justify-content: center; gap: 7px; margin-top: 20px; font-size: 10px; color: #98a7b4; }
.closing-orbit { position: absolute; top: 140px; left: -20%; width: 140%; height: 480px; border: 1px solid #7491b415; border-radius: 50%; transform: rotate(-15deg); z-index: -1; box-shadow: 0 -25px 90px #4a76af08; }
.closing-orbit::after { content: ""; position: absolute; inset: -20px; border: 1px solid #7491b40a; border-radius: 50%; }
.site-footer { display: flex; align-items: center; gap: 30px; border-top: 1px solid var(--line); margin: 0 5%; padding: 34px 0; color: #8593a1; font-size: 9px; }
.site-footer .brand { color: #c9d1d7; font-size: 18px; }
.site-footer .brand svg { width: 24px; height: 24px; }
.site-footer > div { display: flex; margin-left: auto; gap: 22px; }
.site-footer small { font-size: 8px; color: #6d7d8b; }
.tracking-video { position: fixed; width: 1px; height: 1px; opacity: 0; pointer-events: none; bottom: 0; left: 0; }
.air-hand-cursor { position: fixed; left: 0; top: 0; width: 20px; height: 20px; border: 1px solid #dbfff3; box-shadow: 0 0 20px #b7e2d244; border-radius: 50%; pointer-events: none; opacity: 0; z-index: 99; }
.air-hand-cursor[data-mode=press] { background: #d0ffe7aa; transform-origin: center; }

@media (min-width: 1700px) { }
@media (max-width: 1100px) {
  .lab-layout { gap: 35px; }
  .capability-card-copy { padding-inline: 22px; }
  .capability-card h3 { font-size: 15px; }
  .event-tag { font-size: 7px; padding: 8px; }
  .event-connector { padding: 0 8px; gap: 4px; }
  .install-section { gap: 40px; }
  .site-footer { gap: 20px; }
}
@media (max-width: 800px) {
  .github-link { display: none; }
  .principles-strip { gap: 18px; font-size: 9px; }
  .principles-strip > span:first-child { display: none; }
  .section { padding: 80px 6%; }
  .about-section { grid-template-columns: 1fr; gap: 28px; }
  .about-bottom p { max-width: 340px; }
  .capability-grid { grid-template-columns: 1fr; }
  .capability-card { display: grid; grid-template-columns: .8fr 1fr; align-items: center; }
  .capability-card + .capability-card { border-left: 0; border-top: 1px solid var(--line); }
  .capability-card-copy { padding: 28px; }
  .capability-card h3 { font-size: 18px; }
  .lab-section { padding-top: 0; }
  .lab-layout { grid-template-columns: 1fr; gap: 35px; }
  .scene-options { display: grid; grid-template-columns: repeat(3,1fr); gap: 18px; }
  .scene-option { padding: 0 0 20px; flex-wrap: wrap; gap: 12px; align-content: start; }
  .scene-option strong { font-size: 15px; }
  .scene-option > span > span { font-size: 10px; }
  .scene-option > svg { display: none; }
  .lab-note { grid-column: 1/-1; margin-top: 0; }
  .install-section { grid-template-columns: 1fr; gap: 40px; }
  .install-tags { margin-top: 26px; }
  .site-footer { flex-wrap: wrap; }
  .site-footer > span { display: none; }
  .site-footer small { width: 100%; text-align: center; }
}
@media (max-width: 600px) {
  .principles-strip { min-height: 65px; padding: 17px 6%; flex-wrap: wrap; gap: 16px 20px; justify-content: center; font-size: 9px; }
  .principles-strip .strip-open { display: none; }
  .section { padding: 72px 7%; }
  .eyebrow { font-size: 8px; letter-spacing: 1.3px; }
  h2 { font-size: 34px; }
  .about-content h2 { font-size: 30px; }
  .about-bottom { flex-direction: column; gap: 20px; margin-top: 25px; }
  .about-bottom p { font-size: 11px; }
  .about-bottom p:last-child { font-size: 10px; }
  .section-heading { align-items: flex-start; flex-direction: column; gap: 25px; margin-bottom: 32px; }
  .section-heading > p { font-size: 11px; }
  .capability-card { grid-template-columns: 1fr; }
  .capability-art { height: 155px; }
  .capability-card-copy { padding: 5px 25px 30px; }
  .capability-card h3 { font-size: 18px; }
  .capability-card p { font-size: 11px; }
  .lab-section { padding-top: 0; }
  .demo-content { height: 295px; padding: 18px; }
  .demo-art { top: 40px; }
  .demo-caption { left: 18px; right: 18px; bottom: 20px; }
  .demo-caption h3 { font-size: 24px; }
  .demo-edition { font-size: 5px; }
  .demo-footer { font-size: 5px; padding-inline: 10px; }
  .demo-footer > span:last-child { display: none; }
  .scene-options { grid-template-columns: 1fr; gap: 0; }
  .scene-option { flex-wrap: nowrap; padding: 20px 0; }
  .scene-option:first-child { padding-top: 0; }
  .scene-option > svg { display: block; }
  .scene-option > span > span { max-width: none; margin-top: 7px; }
  .lab-note { margin-top: 22px; font-size: 8px; }
  .install-section { gap: 35px; }
  .install-tags { font-size: 7px; gap: 10px; }
  .install-tags > span + span { padding-left: 10px; }
  .code-tabs { gap: 20px; padding-inline: 15px; }
  .code-tabs > span { font-size: 6px; }
  .install-command { padding-inline: 15px; font-size: 11px; gap: 10px; }
  .code-file { padding-inline: 15px; font-size: 8px; }
  pre { padding: 22px 15px; font-size: 10px; }
  .code-footnote { padding-inline: 15px; font-size: 7px; }
  .closing-section { padding: 85px 20px; }
  .closing-section h2 { font-size: 49px; }
  .site-footer { gap: 25px; padding-block: 28px; }
  .site-footer > div { gap: 16px; font-size: 8px; }
  .site-footer .brand { font-size: 17px; }
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

## src/app/hero.css

```css
/* Light is composed of independent bodies, histories, and translucent gas packets. */
.site-header { position: absolute; z-index: 10; inset: 0 0 auto; height: 112px; padding: 0 5%; display: flex; align-items: center; justify-content: space-between; }
.brand { display: inline-flex; align-items: center; gap: 12px; font: 23px Georgia, "Times New Roman", serif; letter-spacing: .1px; color: #edf3ff; }
.brand-orb { width: 19px; height: 19px; display: inline-block; flex-shrink: 0; border: 2px solid #e0f0ff; border-radius: 50%; box-shadow: 0 0 4px #fff,0 0 9px #4987ff,0 0 19px #3473ff,inset 0 0 7px #5a9cff; }
.navigation { display: flex; align-items: center; gap: 38px; margin-left: 40px; font-size: 12px; color: #e3eafa; }
.navigation a { transition: color .2s,text-shadow .2s; }
.navigation a:hover, .navigation .aircursor-hover { color: white; text-shadow: 0 0 14px #9fbfff; }
.header-actions { display: flex; align-items: center; gap: 20px; }
.header-cta { display: inline-flex; align-items: center; gap: 21px; font-size: 12px; border: 1px solid #c9d7ed99; border-radius: 999px; padding: 12px 22px; background: #04091624; backdrop-filter: blur(8px); transition: background .2s; }
.header-cta:hover, .header-cta.aircursor-hover { background: #92b5f01a; }
.menu-toggle { display: none; }

.hero { position: relative; min-height: 800px; height: 100svh; max-height: 1300px; isolation: isolate; overflow: hidden; background: #020610; }
.gravity-field { position: absolute; inset: 0; z-index: -2; }
.gravity-field canvas { display: block; width: 100%; height: 100%; position: absolute; inset: 0; }
.gravity-field .fallback-canvas { display: none; }
.gravity-field.is-fallback .webgl-canvas { display: none; }
.gravity-field.is-fallback .fallback-canvas { display: block; }
.hero-copy { position: absolute; left: 5%; top: 35%; width: min(680px,59%); pointer-events: none; transition: opacity .5s; }
.hero h1 { font-family: "Times New Roman",Georgia,serif; font-size: clamp(58px,5.75vw,91px); line-height: 1.07; letter-spacing: -.035em; font-weight: 400; margin: 0 0 29px; color: #f0f3ff; text-shadow: 0 2px 30px #020610b3; }
.hero h1 em { font-weight: 400; }
.hero-copy > p { color: #d4dff4; font-size: 15px; line-height: 1.9; letter-spacing: .12em; margin: 0; text-shadow: 0 1px 14px #020610; }
.hero-product-note { display: block; color: #9daeca; font-size: 10px; letter-spacing: .035em; margin-top: 22px; }
.hero[data-phase="compression"] .hero-copy { opacity: .15; }
.hero[data-phase="silence"] .hero-copy, .hero[data-phase="rupture"] .hero-copy { opacity: 0; }
.hero-controls { position: absolute; right: 5%; bottom: 96px; max-width: 325px; z-index: 2; }
.hero-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 13px; }
.hero-actions .button { border: 1px solid #cddcff88; background: #060c1e70; backdrop-filter: blur(10px); color: #eef4ff; border-radius: 99px; font-size: 11px; font-weight: 400; padding: 14px 19px; gap: 10px; }
.hero-actions .button > svg { width: 16px; height: 16px; }
.hero-actions .button > svg:last-child { width: 14px; height: 14px; margin-left: 10px; }
.hero-actions .button:hover, .hero-actions .button.aircursor-hover { background: #182946aa; box-shadow: 0 0 30px #82b2ff1c; transform: none; }
.hero-actions .text-button { font-size: 10px; color: #c6d6f1; display: flex; align-items: center; gap: 9px; padding: 4px 3px; }
.hero-actions .text-button:hover { color: white; }
.privacy-note { display: flex; justify-content: flex-end; align-items: center; gap: 6px; margin-top: 14px; color: #8299b8; font-size: 8px; }
.camera-error { color: #f5d9c2; font-size: 11px; line-height: 1.7; margin-top: 15px; padding: 12px 14px; background: #040918d9; border: 1px solid #d5b29140; border-radius: 6px; }
.camera-guidance { display: flex; align-items: baseline; gap: 8px; font-size: 11px; line-height: 1.7; color: #c4d9ff; margin-top: 15px; padding: 10px 12px; background: #030a18aa; border-radius: 6px; }
.hero-bottom { position: absolute; left: 5%; right: 5%; bottom: 40px; display: flex; align-items: flex-end; }
.scroll-cue { display: grid; grid-template-columns: 12px 1fr; grid-template-rows: 46px 30px; gap: 14px 12px; align-items: center; font: 8px/1.9 var(--font-mono); letter-spacing: 2px; color: #acbad2; }
.scroll-line { width: 1px; height: 46px; justify-self: center; background: linear-gradient(transparent,#b0c8ee); }
.scroll-orb { width: 27px; height: 27px; border: 1px solid #c9d9faad; border-radius: 50%; grid-column: 1/-1; display: grid; place-items: center; }
.scroll-orb::after { content: ""; width: 4px; height: 4px; border-radius: 50%; background: #e8f5ff; box-shadow: 0 0 8px 2px #5b99ff; }
.field-status { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 21px; font: 8px var(--font-mono); letter-spacing: 2.9px; color: #c1d2ee; text-align: center; white-space: nowrap; }
.phase-track { display: flex; width: 64px; gap: 3px; }
.phase-track i { display: block; height: 1px; flex: 1; background: #90a9d347; transition: background .25s,box-shadow .25s; }
.phase-track i.is-lit { background: #d0e5ff; box-shadow: 0 0 7px #7fa6ff; }
.pause-button { width: 30px; height: 30px; margin-left: auto; border: 1px solid #aec5ea63; border-radius: 50%; display: grid; place-items: center; color: #c3d1e9; }
.pause-button:hover { background: #bccdf11a; }
.interaction-hint { position: absolute; bottom: 16px; left: 20%; right: 20%; text-align: center; font: 7px var(--font-mono); letter-spacing: 1.45px; color: #7187a9; }

@media (min-width: 1700px) {
  .hero h1 { font-size: 100px; }
}
@media (max-width: 1000px) {
  .site-header { height: 100px; }
  .navigation { gap: 28px; margin-left: 0; }
  .hero-copy { width: 68%; }
  .hero h1 { font-size: clamp(55px,6.6vw,75px); }
}
@media (max-width: 600px) {
  .site-header { height: 88px; padding-inline: 5%; }
  .brand { font-size: 17px; gap: 9px; }
  .brand-orb { width: 14px; height: 14px; border-width: 1.5px; }
  .header-actions { gap: 12px; }
  .header-cta { padding: 9px 14px; font-size: 9px; gap: 12px; }
  .header-cta svg { width: 12px; height: 12px; }
  .menu-toggle { display: block; font-size: 9px; color: #c1d0e9; }
  .navigation { display: none; position: absolute; top: 77px; left: 4%; right: 4%; padding: 24px; border: 1px solid #aec8ff24; border-radius: 12px; background: #040b1bf0; backdrop-filter: blur(20px); }
  .navigation.is-open { display: flex; justify-content: space-between; gap: 20px; font-size: 11px; }
  .hero { height: 100svh; min-height: 740px; max-height: 1100px; }
  .hero-copy { left: 5%; top: 31%; width: 90%; }
  .hero h1 { font-size: clamp(39px,9.7vw,57px); letter-spacing: -.045em; line-height: 1.08; margin-bottom: 23px; }
  .hero-copy > p { font-size: 12px; line-height: 1.85; letter-spacing: .07em; }
  .hero-product-note { font-size: 8px; margin-top: 17px; max-width: 180px; line-height: 1.7; color: #8f9eb9; }
  .hero-controls { right: 5%; bottom: 128px; max-width: 255px; }
  .hero-actions { gap: 10px; }
  .hero-actions .button { font-size: 10px; padding: 12px 15px; }
  .hero-actions .text-button { font-size: 9px; }
  .privacy-note { font-size: 7px; margin-top: 10px; }
  .camera-error, .camera-guidance { font-size: 9px; max-width: 245px; }
  .hero-bottom { bottom: 36px; }
  .scroll-cue { font-size: 6px; letter-spacing: 1.5px; grid-template-rows: 38px 25px; gap: 10px; }
  .scroll-line { height: 38px; }
  .scroll-orb { height: 24px; width: 24px; }
  .field-status { font-size: 6px; letter-spacing: 1.45px; bottom: 8px; gap: 17px; }
  .phase-track { width: 49px; }
  .pause-button { height: 26px; width: 26px; }
  .interaction-hint { left: 10%; right: 10%; font-size: 5px; letter-spacing: 1.1px; bottom: 13px; }
}
@media (prefers-reduced-motion: reduce) {
  .hero[data-phase] .hero-copy { opacity: 1; }
}
```

## src/app/icon.svg

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#070d16"/><g fill="none" stroke="#d5f5e8" stroke-width="3"><path d="m14 47 18-33 18 33M21 37h22"/><path d="M8 37c12 14 38 9 48-7" stroke-width="2"/></g></svg>
```

## src/components/icons.tsx

```tsx
import type { SVGProps } from "react";
type Props = SVGProps<SVGSVGElement> & { name?: "arrow" | "github" | "hand" | "copy" | "check" | "play" | "pause" | "close" | "cursor" | "code" | "shield" };
export function Icon({ name = "arrow", ...props }: Props) {
  const paths: Record<NonNullable<Props["name"]>, React.ReactNode> = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    github: <><path d="M9 19c-4.5 1.5-4.5-2.5-6-3m12 6v-3.9c0-1 .1-1.4-.5-2 3.3-.4 6.7-1.6 6.7-7.3A5.7 5.7 0 0 0 19.7 5a5.3 5.3 0 0 0-.1-3.7S18.3.9 15.7 2.7a13.5 13.5 0 0 0-7 0C6.1.9 4.8 1.3 4.8 1.3A5.3 5.3 0 0 0 4.7 5a5.7 5.7 0 0 0-1.5 3.8c0 5.7 3.4 6.9 6.7 7.3-.5.5-.6 1.1-.5 2V22" /></>,
    hand: <path d="M8 12V5a1.5 1.5 0 0 1 3 0v6-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v7-3a1.5 1.5 0 0 1 3 0v6a7 7 0 0 1-13 3l-4-6a1.6 1.6 0 0 1 2.5-2z" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M15 8V3H3v13h5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    play: <path d="m8 5 11 7-11 7z" />,
    pause: <path d="M8 5v14M16 5v14" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    cursor: <path d="m5 3 15 10-7 1-3 7z" />,
    code: <path d="m7 7-5 5 5 5m10-10 5 5-5 5m-4-14-2 18" />,
    shield: <><path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6z" /><path d="m8 12 3 3 5-6" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
export function Brand() {
  return <span className="brand"><span className="brand-orb" aria-hidden="true" />AirCursor</span>;
}
```

## src/components/site-header.tsx

```tsx
"use client";

import { useState } from "react";
import { Brand, Icon } from "./icons";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return <header className="site-header">
    <a href="#" aria-label="AirCursor home"><Brand /></a>
    <nav className={open ? "navigation is-open" : "navigation"} aria-label="Main navigation">
      <a href="#capabilities" onClick={() => setOpen(false)}>Features</a>
      <a href="https://github.com/ritsuki-i/AirCursor#readme">Docs</a>
      <a href="#possibilities" onClick={() => setOpen(false)}>Showcase</a>
    </nav>
    <div className="header-actions"><a className="header-cta" href="#install">Get Started <Icon width="15" height="15" /></a><button className="menu-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Close" : "Menu"}</button></div>
  </header>;
}
```

## src/components/air-cursor-provider.tsx

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { AirCursorEngine, AirCursorState } from "air-cursor";
import { initialInput, type FieldInput } from "@/lib/gravity";

type CameraStatus = "off" | "loading" | "ready" | "tracking" | "error";
interface AirContext {
  input: RefObject<FieldInput>;
  surface: RefObject<HTMLElement | null>;
  status: CameraStatus;
  error: string;
  start: () => Promise<void>;
  stop: () => void;
}
const Context = createContext<AirContext | null>(null);

export function AirCursorProvider({ children }: { children: ReactNode }) {
  const input = useRef(initialInput());
  const surface = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const engine = useRef<AirCursorEngine | null>(null);
  const generation = useRef(0);
  const starting = useRef(false);
  const [status, setStatus] = useState<CameraStatus>("off");
  const [error, setError] = useState("");

  const release = useCallback(() => {
    generation.current += 1;
    starting.current = false;
    engine.current?.stop(); engine.current = null;
    const stream = video.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop());
    if (video.current) { video.current.srcObject = null; video.current.remove(); video.current = null; }
    input.current.detected = false; input.current.pressed = false; input.current.launch = false;
  }, []);
  const stop = useCallback(() => { release(); setStatus("off"); }, [release]);

  const start = useCallback(async () => {
    if (starting.current || engine.current) return;
    setError("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Camera access needs HTTPS or localhost. You can still explore with your mouse, touch, or keyboard.");
      setStatus("error"); return;
    }
    starting.current = true; setStatus("loading");
    const token = ++generation.current;
    // Each attempt owns its video, so a late permission response cannot take
    // over a newer session or leave the canceled session's camera running.
    const sessionVideo = document.createElement("video");
    sessionVideo.muted = true; sessionVideo.playsInline = true;
    sessionVideo.className = "tracking-video"; sessionVideo.setAttribute("aria-hidden", "true");
    document.body.appendChild(sessionVideo); video.current = sessionVideo;
    const disposeVideo = () => {
      const stream = sessionVideo.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop());
      sessionVideo.srcObject = null; sessionVideo.remove();
    };
    let instance: AirCursorEngine | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const fail = (cause: unknown) => {
      if (token !== generation.current) return;
      console.warn("AirCursor could not start:", cause);
      release();
      const name = cause instanceof Error ? cause.name : "";
      setError(name === "NotAllowedError"
        ? "Camera permission was declined. Allow it in your browser to try again, or keep exploring with your mouse."
        : name === "NotFoundError"
          ? "No camera was found. The full field experience is available with your mouse, touch, or keyboard."
          : "The camera or hand model could not start. Check your camera and connection, then retry. Mouse mode is ready.");
      setStatus("error");
    };
    try {
      const { AirCursorEngine: Engine } = await import("air-cursor");
      if (token !== generation.current) { disposeVideo(); return; }
      let previousMode = "idle";
      instance = new Engine({
        video: sessionVideo,
        cursorElement: cursor.current,
        inferenceFps: 24,
        hands: { maxNumHands: 1, modelComplexity: 0 },
        regionSelectEnabled: false,
        modifierEnabled: false,
        onState: (hand: AirCursorState | null) => {
          if (token !== generation.current) return;
          setStatus(hand ? "tracking" : "ready");
          const rect = surface.current?.getBoundingClientRect();
          if (!hand || !rect) { input.current.detected = false; input.current.pressed = false; previousMode = "idle"; return; }
          const within = hand.x >= rect.left && hand.x <= rect.right && hand.y >= rect.top && hand.y <= rect.bottom;
          input.current.detected = within;
          if (within) {
            input.current.x = (hand.x-rect.left)/rect.width;
            input.current.y = (hand.y-rect.top)/rect.height;
          }
          input.current.pressed = within && hand.mode === "aim";
          if (within && hand.mode === "press" && previousMode === "aim") input.current.launch = true;
          previousMode = hand.mode;
        },
        onError: fail,
      });
      engine.current = instance;
      // Covers stalled permission/model loading; a late start is stopped below.
      timeout = setTimeout(() => fail(new Error("Camera start timed out")), 25_000);
      await instance.start();
      if (token !== generation.current) { instance.stop(); disposeVideo(); return; }
      setStatus("ready");
      const stream = sessionVideo.srcObject;
      if (stream instanceof MediaStream) stream.getVideoTracks().forEach(track => track.addEventListener("ended", stop, { once: true }));
    } catch (cause) { instance?.stop(); disposeVideo(); fail(cause); }
    finally { clearTimeout(timeout); if (token === generation.current) starting.current = false; }
  }, [release, stop]);

  useEffect(() => {
    const onHidden = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", stop);
    return () => { release(); document.removeEventListener("visibilitychange", onHidden); window.removeEventListener("pagehide", stop); };
  }, [release, stop]);

  return <Context.Provider value={{ input, surface, status, error, start, stop }}>
    {children}
    <div ref={cursor} className="air-hand-cursor" aria-hidden="true" />
  </Context.Provider>;
}

export function useAirCursor() {
  const context = useContext(Context);
  if (!context) throw new Error("useAirCursor requires AirCursorProvider");
  return context;
}
```

## src/components/hand-tracking-hero.tsx

```tsx
"use client";

import { useCallback, useEffect, useState, type PointerEvent } from "react";
import { useAirCursor } from "./air-cursor-provider";
import { GravityField } from "./gravity-field";
import { Icon } from "./icons";
import { PHASES, type Phase } from "@/lib/gravity";

const labels: Record<Phase, string> = {
  ambient: "A SPACE WAITING FOR YOU", detection: "HAND DETECTED", attraction: "DRAWING THE UNIVERSE CLOSER",
  compression: "ENERGY IN YOUR HANDS", silence: "LIGHT READY · CLICK TO RELEASE", rupture: "LET IT GO", afterglow: "BACK TO THE QUIET",
};

export function HandTrackingHero() {
  const { input, surface, status, error, start, stop } = useAirCursor();
  const [phase, setPhase] = useState<Phase>("ambient");
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const onPhase = useCallback((next: Phase) => setPhase(next), []);
  const cameraOn = ["loading", "ready", "tracking"].includes(status);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync(); media.addEventListener("change", sync);
    const release = () => { if (!cameraOn) input.current.pressed = false; };
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => { media.removeEventListener("change", sync); window.removeEventListener("pointercancel", release); window.removeEventListener("blur", release); };
  }, [input, cameraOn]);

  function move(event: PointerEvent<HTMLElement>) {
    if (cameraOn || input.current.demo || !event.isTrusted) return;
    if ((event.target as Element).closest("a, button")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    input.current.x = (event.clientX-rect.left)/rect.width;
    input.current.y = (event.clientY-rect.top)/rect.height;
    input.current.detected = true;
    input.current.pressed = true;
  }
  function preview() {
    setPaused(false);
    if (["attraction", "compression", "silence"].includes(phase)) { input.current.launch = true; return; }
    input.current.x = .67;
    input.current.y = .54;
    input.current.demo = true;
  }

  return <section ref={surface} id="experience" className="hero" data-phase={phase} aria-labelledby="hero-title"
    onPointerMove={move}
    onPointerDown={event => {
      if (cameraOn || !event.isTrusted || event.button !== 0 || (event.target as Element).closest("a, button")) return;
      move(event); input.current.launch = true; setPaused(false);
    }}
    onPointerLeave={() => { if (!cameraOn) { input.current.detected = false; input.current.pressed = false; } }}>
    <GravityField input={input} paused={paused} reduced={reduced} onPhase={onPhase} />
    <div className="hero-copy">
      <h1 id="hero-title">Move <em>your hand.</em><br />Move the Web.</h1>
      <p lang="ja">手を動かすだけで、<br />Web はもっと自由になる。</p>
      <span className="hero-product-note">A touchless interaction library for the web.</span>
    </div>
    <div className="hero-controls">
      <div className="hero-actions">
        <button className="button button-primary" onClick={cameraOn ? stop : start}>
          <Icon name={cameraOn ? "close" : "hand"} />{status === "loading" ? "Cancel camera" : cameraOn ? "Stop camera" : "Enable hand tracking"}<Icon />
        </button>
        <button className="text-button" onClick={preview} disabled={["rupture", "afterglow"].includes(phase)}><Icon name="play" width="15" height="15" />{["attraction", "compression", "silence"].includes(phase) ? "Release the light" : "Play the experience"}</button>
      </div>
      <div className="privacy-note"><Icon name="shield" width="12" height="12" /> Your camera. Your device. Your space.</div>
      {error && <p className="camera-error" role="alert">{error}</p>}
      {cameraOn && <div className="camera-guidance" role="status"><i className="live-dot" />{status === "loading" ? "Allow camera access. Loading hand tracking…" : status === "ready" ? "Show your right hand. Bring index and middle fingertips together." : "Point to gather and compress. Add your thumb to release the light."}</div>}
    </div>

    <div className="hero-bottom">
      <a href="#about" className="scroll-cue"><span className="scroll-line" /><span>SCROLL<br />TO EXPLORE</span><span className="scroll-orb" /></a>
      <div className="field-status" role="status" aria-live="polite"><span>{paused ? "THE FIELD IS PAUSED" : labels[phase]}</span><div className="phase-track" aria-hidden="true">{PHASES.map((step, index) => <i key={step} className={index <= PHASES.indexOf(phase) ? "is-lit" : ""} />)}</div></div>
      <button className="pause-button" aria-label={paused ? "Resume animation" : "Pause animation"} aria-pressed={paused} onClick={() => setPaused(value => !value)}><Icon name={paused ? "play" : "pause"} width="15" height="15" /></button>
    </div>
    <div className="interaction-hint"><span>{cameraOn ? "POINT TO GATHER · CLICK TO RELEASE" : "MOVE TO GATHER · CLICK TO RELEASE"}</span></div>
  </section>;
}
```

## src/components/gravity-field.tsx

```tsx
"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { advanceField, initialField, type FieldInput, type Phase } from "@/lib/gravity";
import { DESKTOP_BUDGET, FALLBACK_BUDGET, FIXED_STEP, MOBILE_BUDGET, ParticleField } from "@/lib/particle-field";
import { WebGLFieldRenderer, type FieldRenderer } from "@/lib/field-renderer";
import { CanvasFieldRenderer } from "@/lib/canvas-field-renderer";

interface Props { input: RefObject<FieldInput>; paused: boolean; reduced: boolean; onPhase: (phase: Phase) => void }

export function GravityField({ input, paused, reduced, onPhase }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLCanvasElement>(null);
  const controls = useRef({ paused, reduced, onPhase });
  const [fallback, setFallback] = useState(false);
  useEffect(() => { controls.current = { paused, reduced, onPhase }; }, [paused, reduced, onPhase]);

  useEffect(() => {
    const container = containerRef.current, canvas = canvasRef.current, alternate = fallbackRef.current;
    if (!container || !canvas || !alternate) return;
    const state = initialField();
    let renderer: FieldRenderer;
    let isFallback = false;
    try { renderer = new WebGLFieldRenderer(canvas); }
    catch (error) { console.warn("Gravity field: using the Canvas renderer.", error); renderer = new CanvasFieldRenderer(alternate); isFallback = true; }
    setFallback(isFallback);
    const rect = container.getBoundingClientRect();
    const budget = isFallback ? FALLBACK_BUDGET : rect.width < 650 ? MOBILE_BUDGET : DESKTOP_BUDGET;
    // Created once. IDs, positions, velocities and histories survive every phase.
    const field = new ParticleField(budget, rect.width / Math.max(1, rect.height));
    let raf = 0, last = 0, accumulator = 0, visible = true, dirty = true;
    let lastPhase: Phase = "ambient", lastReduced = controls.current.reduced;
    let quality = 1, slowFrames = 0;
    const resize = () => {
      const box = container.getBoundingClientRect();
      field.aspect = box.width / Math.max(1, box.height);
      const dpr = quality * Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1_600_000 / Math.max(1, box.width * box.height)));
      renderer.resize(box.width, box.height, dpr);
      dirty = true;
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(container);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; last = 0; accumulator = 0; });
    intersection.observe(container);
    const contextLost = (event: Event) => {
      event.preventDefault();
      renderer.dispose(); renderer = new CanvasFieldRenderer(alternate);
      isFallback = true; setFallback(true); resize();
    };
    canvas.addEventListener("webglcontextlost", contextLost);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) { last = 0; accumulator = 0; return; }
      const delta = last ? Math.min((now - last) / 1000, .05) : 1 / 60;
      last = now;
      const current = controls.current;
      if (lastReduced !== current.reduced) { lastReduced = current.reduced; dirty = true; }
      if (current.paused && !dirty) return;
      if (!current.paused) {
        accumulator += delta;
        while (accumulator >= FIXED_STEP) {
          advanceField(state, input.current, FIXED_STEP, current.reduced ? undefined : field);
          if (!current.reduced) field.step(state, FIXED_STEP);
          accumulator -= FIXED_STEP;
        }
      }
      if (state.phase !== lastPhase) { lastPhase = state.phase; current.onPhase(state.phase); dirty = true; }
      container.dataset.phase = state.phase;
      container.dataset.elapsed = state.elapsed.toFixed(3);
      container.dataset.particles = String(field.lights.length);
      container.dataset.streams = String(field.streams.length);
      container.dataset.captured = field.captureFraction.toFixed(3);
      container.dataset.renderer = isFallback ? "canvas-2d" : "webgl-particles";
      // Reduced motion freezes the bodies; state changes remain accessible.
      if (current.reduced && !dirty && (state.phase === "ambient" || state.phase === "detection")) return;
      slowFrames = delta > .043 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames > 45 && quality > .7) { quality *= .85; resize(); slowFrames = 0; }
      renderer.draw(field, state, current.reduced);
      dirty = false;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); observer.disconnect(); intersection.disconnect();
      canvas.removeEventListener("webglcontextlost", contextLost); renderer.dispose();
    };
  }, [input]);

  return <div ref={containerRef} className={`gravity-field ${fallback ? "is-fallback" : ""}`} aria-hidden="true">
    <canvas ref={canvasRef} className="webgl-canvas" />
    <canvas ref={fallbackRef} className="fallback-canvas" />
  </div>;
}
```

## src/lib/gravity.ts

```typescript
/** One deterministic timeline shared by every input and renderer. Seconds throughout. */
export const PHASES = ["ambient", "detection", "attraction", "compression", "silence", "rupture", "afterglow"] as const;
export type Phase = (typeof PHASES)[number];
export interface FieldInput {
  x: number;
  y: number;
  detected: boolean;
  pressed: boolean;
  /** One-shot pointer-to-click transition; consumed by the simulation. */
  launch: boolean;
  demo: boolean;
}
export interface FieldState {
  phase: Phase;
  elapsed: number;
  time: number;
  x: number;
  y: number;
  influence: number;
  compression: number;
  release: number;
  glow: number;
  armed: boolean;
}
export const initialInput = (): FieldInput => ({ x: .69, y: .51, detected: false, pressed: false, launch: false, demo: false });
export const initialField = (): FieldState => ({ phase: "ambient", elapsed: 0, time: 0, x: .69, y: .51, influence: 0, compression: 0, release: 0, glow: 0, armed: true });
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
function enter(s: FieldState, phase: Phase) { s.phase = phase; s.elapsed = 0; }

/** Mutates a ref-owned frame, never React state. A release is required before rearming. */
export function advanceField(s: FieldState, input: FieldInput, delta: number, feedback?: { captureFraction: number }): FieldState {
  const dt = Math.min(Math.max(delta, 0), .05);
  s.elapsed += dt;
  const launch = input.launch;
  input.launch = false;
  if (launch && ["attraction", "compression", "silence"].includes(s.phase)) {
    s.glow = 1; s.release = 0; enter(s, "rupture");
  }
  // The compressed core stays alive and follows the pointer while it waits for
  // a click. Only the release itself locks the launch origin.
  s.time += dt * (s.phase === "silence" ? .18 : 1 + s.compression * 1.2);
  const locked = ["rupture", "afterglow"].includes(s.phase);
  if (!locked) {
    const follow = 1 - Math.exp(-dt * 5);
    s.x += (input.x - s.x) * follow;
    s.y += (input.y - s.y) * follow;
  }
  if (!input.pressed && !input.demo) s.armed = true;
  if (s.phase === "ambient" || s.phase === "detection") {
    s.compression = 0; s.release = 0; s.glow = 0;
    if ((input.pressed || input.demo) && s.armed) { s.armed = false; enter(s, "attraction"); }
    else if (input.detected && s.phase === "ambient") enter(s, "detection");
    else if (!input.detected && s.phase === "detection") enter(s, "ambient");
  } else if (s.phase === "attraction") {
    s.compression = .18 * ease(s.elapsed / .75);
    if (!input.pressed && !input.demo) { enter(s, "afterglow"); }
    else if (s.elapsed >= .75) enter(s, "compression");
  } else if (s.phase === "compression") {
    s.compression = .18 + .82 * ease(s.elapsed / 1.25);
    if (!input.pressed && !input.demo) enter(s, "afterglow");
    else if (s.elapsed >= 1.25 && (!feedback || feedback.captureFraction >= .94 || s.elapsed >= 2.6)) { s.compression = 1; enter(s, "silence"); }
  } else if (s.phase === "silence") {
    // Keep the compressed light indefinitely. Time only completes gathering;
    // a pointer-to-click transition above is the sole launch trigger.
    if (!input.pressed && !input.demo) enter(s, "afterglow");
  } else if (s.phase === "rupture") {
    s.release = clamp(s.elapsed / .85);
    s.compression = 1 - ease(s.release);
    s.glow = Math.exp(-s.elapsed * 5);
    if (s.elapsed >= .85) enter(s, "afterglow");
  } else if (s.phase === "afterglow") {
    s.compression *= Math.exp(-dt * 4);
    s.glow *= Math.exp(-dt * 2);
    s.release = Math.min(2, s.release + dt * .4);
    if (s.elapsed >= 3.2) { input.demo = false; enter(s, "ambient"); }
  }
  const target = s.phase === "ambient" ? 0 : s.phase === "detection" ? .3 : s.phase === "afterglow" ? 0 : 1;
  if (s.phase !== "silence") s.influence += (target - s.influence) * (1 - Math.exp(-dt * 3));
  return s;
}
```

## src/lib/particle-field.ts

```typescript
import type { FieldState, Phase } from "./gravity";

export type LightKind = "star" | "dust" | "glint" | "fragment" | "gas" | "stream";
export interface Light {
  readonly id: number;
  readonly kind: LightKind;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  readonly hx: number; readonly hy: number; readonly hz: number;
  readonly response: number; readonly drag: number; readonly swirl: number;
  readonly size: number; readonly brightness: number; readonly hue: number;
  readonly phase: number; readonly pulseRate: number;
  readonly launchSpeed: number; readonly launchDelay: number; readonly lifetime: number;
  readonly launchX: number; readonly launchY: number; readonly launchZ: number;
  captured: boolean;
  releaseAge: number;
  released: boolean;
  alpha: number;
}
export interface Streamline {
  readonly light: Light;
  readonly history: Float32Array;
  readonly length: number;
  head: number;
}
export interface FieldBudget { stars: number; dust: number; glints: number; fragments: number; streams: number; gas: number }
export const DESKTOP_BUDGET: FieldBudget = { stars: 1800, dust: 10400, glints: 1300, fragments: 180, streams: 300, gas: 56 };
export const MOBILE_BUDGET: FieldBudget = { stars: 900, dust: 4600, glints: 680, fragments: 90, streams: 160, gas: 36 };
export const FALLBACK_BUDGET: FieldBudget = { stars: 440, dust: 1700, glints: 360, fragments: 60, streams: 90, gas: 24 };
export const FIXED_STEP = 1 / 120;
const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
function randomGenerator(seed: number) {
  return () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
}

/**
 * Persistent, individually integrated light bodies. Rendering never changes
 * their coordinates. The hand changes acceleration, not an image transform.
 * All units are fractions of viewport height; z has fixed-camera perspective.
 */
export class ParticleField {
  readonly lights: Light[] = [];
  readonly streams: Streamline[] = [];
  readonly pointData: Float32Array;
  readonly trailData: Float32Array;
  readonly reactiveCount: number;
  readonly gasCount: number;
  time = 0;
  capturedCount = 0;
  previousPhase: Phase = "ambient";
  aspect: number;
  centerX = 0;
  centerY = 0;
  private historyTime = 0;
  private flow = new Float64Array(3);
  private captureAtRelease = 0;

  constructor(budget: FieldBudget = DESKTOP_BUDGET, aspect = 1.44, seed = 1701) {
    this.aspect = aspect;
    const random = randomGenerator(seed);
    const add = (kind: LightKind, count: number) => {
      for (let n = 0; n < count; n++) {
        const id = this.lights.length;
        const angle = random() * TAU;
        const lane = Math.floor(random() * 3);
        const thickness = (random() + random() + random() - 1.5);
        const radius = .39 + lane * .21 + thickness * .15;
        // Three sparse, intersecting ribbons form a composition, not a bitmap.
        const x = .21 * aspect + Math.cos(angle) * radius + .07 * Math.sin(angle * 2 + lane);
        const y = -.015 + Math.sin(angle) * radius * .62 + .14 * Math.sin(angle * 2 + lane * .5);
        const z = (random() - .5) * .65 + Math.cos(angle + lane) * .12;
        const phase = random() * TAU;
        const direction = random() * TAU;
        const depth = (random() - .5) * 1.2;
        const light: Light = {
          id, kind,
          x: kind === "star" ? (random() - .5) * aspect * 1.35 : x,
          y: kind === "star" ? (random() - .5) * 1.35 : y,
          z: kind === "star" ? .4 + random() * 1.2 : z,
          vx: 0, vy: 0, vz: 0, hx: x, hy: y, hz: z,
          response: .72 + random() * .95,
          drag: .7 + random() * 1.9,
          swirl: random() < .22 ? .03 : .25 + random() * .95,
          size: kind === "gas" ? 240 + random() * 280 : kind === "fragment" ? 4 + random() * 5 : kind === "glint" ? 4 + random() * 6 : 1.2 + random() * 2.5,
          brightness: kind === "gas" ? .24 + random() * .20 : kind === "dust" ? .42 + random() * .75 : .65 + random() * .9,
          hue: random(), phase, pulseRate: .30 + random() * 1.1,
          launchSpeed: .22 + Math.pow(random(), 1.2) * 1.7,
          launchDelay: random() * .12,
          lifetime: .75 + random() * 3.5,
          launchX: Math.cos(direction), launchY: Math.sin(direction), launchZ: depth,
          captured: false, releaseAge: -1, released: false, alpha: 1,
        };
        this.ambientVelocity(light.x, light.y, light.z, phase, this.flow);
        light.vx = this.flow[0] * light.response;
        light.vy = this.flow[1] * light.response;
        light.vz = this.flow[2];
        this.lights.push(light);
        if (kind === "stream") {
          const length = 54 + Math.floor(random() * 35);
          const history = new Float32Array(length * 3);
          let px = light.x, py = light.y, pz = light.z;
          // Seed each history by independently integrating its flow backwards.
          for (let j = 0; j < length; j++) {
            const index = (length - 1 - j) * 3;
            history[index] = px; history[index + 1] = py; history[index + 2] = pz;
            this.ambientVelocity(px, py, pz, phase, this.flow);
            px -= this.flow[0] * .075 * light.response;
            py -= this.flow[1] * .075 * light.response;
            pz -= this.flow[2] * .075;
          }
          this.streams.push({ light, history, length, head: length - 1 });
        }
      }
    };
    // Gas is drawn first; additive points and trajectory histories sit above it.
    add("gas", budget.gas); add("star", budget.stars); add("dust", budget.dust);
    add("glint", budget.glints); add("fragment", budget.fragments); add("stream", budget.streams);
    this.gasCount = budget.gas;
    this.reactiveCount = this.lights.filter(p => p.kind !== "star" && p.kind !== "gas").length;
    this.pointData = new Float32Array(this.lights.length * 9);
    this.trailData = new Float32Array(this.streams.reduce((sum, trail) => sum + (trail.length - 1) * 6 * 6, 0));
  }

  get captureFraction() { return this.capturedCount / Math.max(1, this.reactiveCount); }

  private ambientVelocity(x: number, y: number, z: number, seed: number, out: Float64Array) {
    const dx = x - this.aspect * .21, dy = y + .015;
    const r = Math.sqrt(dx * dx + dy * dy * 2.5 + .018);
    // Differential orbital flow plus a smooth divergence-free perturbation.
    // Frequencies depend on position and each body's response, not a group angle.
    const a = x * 3.1 + z * 1.7 + this.time * .045;
    const b = y * 4.3 - z * .9 - this.time * .038;
    out[0] = -dy * .072 / (r + .20) + Math.sin(a) * Math.sin(b) * .013;
    out[1] = dx * .032 / (r + .20) + Math.cos(a) * Math.cos(b) * .009;
    out[2] = Math.sin(x * 2.4 + y * 3.1 + seed + this.time * .13) * .007;
  }

  step(state: FieldState, delta: number) {
    const dt = Math.min(delta, 1 / 30);
    this.centerX = (state.x - .5) * this.aspect;
    this.centerY = .5 - state.y;
    if (state.phase === "silence") {
      // Hold the gathered bodies as a compact core, but keep that core attached
      // to the moving pointer. A hard return here used to make a fully charged
      // field look frozen as soon as the hand moved again.
      this.time += dt * .18;
      let captured = 0;
      for (const p of this.lights) {
        if (p.kind === "star") {
          p.x += Math.sin(p.phase + this.time * .09) * .00008 * dt;
          p.y += Math.cos(p.phase + this.time * .07) * .00006 * dt;
        } else if (p.captured) {
          p.x = this.centerX + p.launchX * .002;
          p.y = this.centerY + p.launchY * .002;
          p.z = p.launchZ * .002;
          p.alpha = p.kind === "gas" ? .02 : .15;
          if (p.kind !== "gas") captured++;
        }
      }
      this.capturedCount = captured;
      this.previousPhase = state.phase;
      return;
    }
    this.time += dt;
    if (state.phase === "rupture" && this.previousPhase !== "rupture") {
      this.captureAtRelease = this.captureFraction;
      for (const p of this.lights) {
        if (p.kind === "star") continue;
        p.releaseAge = -p.launchDelay;
        p.released = false;
      }
    }
    const attracting = state.phase === "attraction" || state.phase === "compression";
    const releasing = state.phase === "rupture" || state.phase === "afterglow";
    let captured = 0;
    for (const p of this.lights) {
      if (p.kind === "star") {
        p.x += Math.sin(p.phase + this.time * .09) * .00025 * dt;
        p.y += Math.cos(p.phase + this.time * .07) * .00018 * dt;
        continue;
      }
      let dx = this.centerX - p.x, dy = this.centerY - p.y, dz = -p.z;
      const r2 = dx * dx + dy * dy + dz * dz * .4;
      const r = Math.sqrt(r2 + .000001);
      if (p.captured && attracting) {
        // Already absorbed bodies remain distinct at their own tiny core offsets.
        p.x = this.centerX + p.launchX * .002;
        p.y = this.centerY + p.launchY * .002;
        p.z = p.launchZ * .002;
        p.alpha = p.kind === "gas" ? .02 : .15;
        if (p.kind !== "gas") captured++;
        continue;
      }
      if (releasing && p.releaseAge > -1) {
        p.releaseAge += dt;
        if (p.releaseAge >= 0 && !p.released) {
          const attenuation = p.captured ? 1 : 1 / (1 + r * 3);
          // A one-time individual impulse. Position is never reset to an emitter.
          p.vx = p.launchX * p.launchSpeed * attenuation + p.vx * .12;
          p.vy = p.launchY * p.launchSpeed * attenuation + p.vy * .12;
          p.vz = p.launchZ * p.launchSpeed * attenuation;
          p.captured = false; p.released = true;
        }
        if (p.captured) { if (p.kind !== "gas") captured++; continue; }
      } else if (!attracting) p.captured = false;

      this.ambientVelocity(p.x, p.y, p.z, p.phase, this.flow);
      let ax = (this.flow[0] * p.response - p.vx) * .7;
      let ay = (this.flow[1] * p.response - p.vy) * .7;
      let az = (this.flow[2] - p.vz) * .7;
      if (attracting) {
        const strength = (.30 + state.compression * state.compression * 4.5) * p.response;
        const k = strength / (.085 + r2);
        const viscosity = Math.sqrt(k) * (1.35 + p.drag * .13);
        const angular = p.swirl * (1 - state.compression * .85) * k * .30;
        ax = dx * k - dy * angular - p.vx * viscosity;
        ay = dy * k + dx * angular - p.vy * viscosity;
        az = dz * k - p.vz * viscosity;
        if (r < .012 + state.compression * .01 && state.compression > .2) {
          p.captured = true; p.alpha = .15;
          if (p.kind !== "gas") captured++;
          continue;
        }
      } else if (state.phase === "detection") {
        // Local response: distant lights barely change; near ones curve first.
        const proximity = Math.exp(-r2 / .065) * .26 * p.response;
        ax += dx * proximity - dy * proximity * p.swirl;
        ay += dy * proximity + dx * proximity * p.swirl;
        az += dz * proximity;
      }
      if (releasing && p.released) {
        const returning = state.phase === "afterglow" ? clamp((state.elapsed - .2) / 2.0, 0, 1) : 0;
        const damping = p.drag * .55 + returning * 2.0;
        ax = -p.vx * damping + (p.hx - p.x) * returning * (1.5 + p.response);
        ay = -p.vy * damping + (p.hy - p.y) * returning * (1.5 + p.response);
        az = -p.vz * damping + (p.hz - p.z) * returning * 2;
        ax -= p.vy * p.swirl * .65;
        ay += p.vx * p.swirl * .65;
        const tail = Math.exp(-Math.max(0, p.releaseAge) / p.lifetime);
        p.alpha = tail * (p.kind === "fragment" ? 1.8 : 1.25) + returning * .7;
      } else {
        // Gentle confinement and independent drift prevent a single rigid orbit.
        if (!attracting) {
          ax += (p.hx + Math.sin(this.time * .07 + p.phase) * .10 - p.x) * .018;
          ay += (p.hy + Math.cos(this.time * .09 + p.phase) * .055 - p.y) * .018;
          az += (p.hz - p.z) * .05;
        }
        p.alpha += (1 - p.alpha) * Math.min(1, dt * 3);
        if (p.releaseAge >= 0) { p.releaseAge = -1; p.released = false; }
      }
      p.vx += ax * dt; p.vy += ay * dt; p.vz += az * dt;
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
      if (speed > 4.5) { const limit = 4.5 / speed; p.vx *= limit; p.vy *= limit; p.vz *= limit; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    this.capturedCount = captured;
    this.historyTime += dt;
    if (this.historyTime >= .045) {
      this.historyTime %= .045;
      for (const trail of this.streams) {
        if (trail.light.captured) {
          for (let j = 0; j < trail.length; j++) {
            trail.history[j * 3] = trail.light.x;
            trail.history[j * 3 + 1] = trail.light.y;
            trail.history[j * 3 + 2] = trail.light.z;
          }
        }
        trail.head = (trail.head + 1) % trail.length;
        const offset = trail.head * 3;
        trail.history[offset] = trail.light.x;
        trail.history[offset + 1] = trail.light.y;
        trail.history[offset + 2] = trail.light.z;
      }
    }
    this.previousPhase = state.phase;
  }

  /** Pack independently simulated bodies; neither renderer applies a group transform. */
  pack(state: FieldState, reduced: boolean) {
    let pointOffset = 0;
    const quiet = state.phase === "silence";
    for (const p of this.lights) {
      const kind = p.kind === "gas" ? 3 : p.kind === "fragment" ? 2 : p.kind === "glint" ? 1 : 0;
      const alpha = p.alpha * p.brightness * (quiet && p.kind === "star" ? .08 : 1);
      const data = this.pointData;
      data[pointOffset++] = p.x; data[pointOffset++] = p.y; data[pointOffset++] = p.z;
      data[pointOffset++] = p.size; data[pointOffset++] = alpha;
      data[pointOffset++] = p.hue; data[pointOffset++] = kind;
      data[pointOffset++] = p.phase; data[pointOffset++] = p.pulseRate;
    }
    let lineOffset = 0;
    for (const trail of this.streams) {
      const p = trail.light;
      const alpha = p.brightness * p.alpha * (p.captured ? .006 : 1) * (quiet ? .02 : 1) * (reduced ? .5 : 1);
      const samples = p.released ? Math.min(trail.length,4+Math.floor(p.lifetime*3)) : trail.length;
      // Retain every recorded position for physics, but connect every third
      // sample for rendering. At this scale adjacent samples are subpixel.
      const stride = p.released ? 1 : 3;
      for (let j = 0; j < samples - 1; j += stride) {
        const next = Math.min(j + stride, samples - 1);
        const a = ((trail.head-j+trail.length)%trail.length)*3;
        const b = ((trail.head-next+trail.length)%trail.length)*3;
        const az = Math.max(.55,1+trail.history[a+2]*.32), bz = Math.max(.55,1+trail.history[b+2]*.32);
        const dx = trail.history[b]/bz-trail.history[a]/az;
        const dy = trail.history[b+1]/bz-trail.history[a+1]/az;
        const length = Math.hypot(dx,dy)+.000001;
        const halfWidth = .00065 + p.hue*.00055;
        const nx = -dy/length*halfWidth, ny = dx/length*halfWidth;
        // A feathered ribbon follows this body's history; it has no shared path.
        for (let vertex = 0; vertex < 6; vertex++) {
          const endpoint = vertex===2 || vertex===4 || vertex===5 ? 1 : 0;
          const side = vertex===0 || vertex===3 || vertex===5 ? -1 : 1;
          const index = endpoint ? b : a, depth = endpoint ? bz : az;
          const fade = Math.pow(1-(endpoint ? next : j)/(samples-1),1.6);
          this.trailData[lineOffset++] = trail.history[index]+nx*side*depth;
          this.trailData[lineOffset++] = trail.history[index+1]+ny*side*depth;
          this.trailData[lineOffset++] = trail.history[index+2];
          this.trailData[lineOffset++] = alpha*fade*.78;
          this.trailData[lineOffset++] = p.hue;
          this.trailData[lineOffset++] = side;
        }
      }
    }
    return { points: this.lights.length, vertices: lineOffset / 6 };
  }

  get releasedEnergy() { return this.captureAtRelease; }
}
```

## src/lib/field-renderer.ts

```typescript
import type { FieldState } from "./gravity";
import type { ParticleField } from "./particle-field";
import { coreFragment, coreVertex, pointFragment, pointVertex, trailFragment, trailVertex } from "./light-shaders";

export interface FieldRenderer {
  resize(width: number, height: number, dpr: number): void;
  draw(field: ParticleField, state: FieldState, reduced: boolean): void;
  dispose(): void;
}
type Program = { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null>; attributes: Record<string, number> };

export class WebGLFieldRenderer implements FieldRenderer {
  private gl: WebGLRenderingContext;
  private points: Program;
  private trails: Program;
  private core: Program;
  private buffers: WebGLBuffer[] = [];
  private shaders: WebGLShader[] = [];
  private dpr = 1;
  private height = 1000;
  private pointCapacity = 0;
  private trailCapacity = 0;
  private cloud: WebGLTexture;

  constructor(private canvas: HTMLCanvasElement | OffscreenCanvas) {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, powerPreference: "low-power" }) as WebGLRenderingContext | null;
    if (!gl) throw new Error("WebGL unavailable");
    this.gl = gl;
    this.points = this.createProgram(pointVertex, pointFragment, ["aspect", "dpr", "height", "time", "reduced", "cloud"], ["position", "style", "pulse"]);
    // Bake the soft cloud once, instead of evaluating procedural noise for
    // millions of gas-fragment pixels on every frame (and every light).
    const cloud = gl.createTexture();
    if (!cloud) throw new Error('Texture unavailable');
    this.cloud = cloud;
    const pixels = new Uint8Array(64 * 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const px = x / 63 - .5, py = y / 63 - .5, r = Math.hypot(px, py);
      const edge = Math.max(0, Math.min(1, (.5 - r) / .23));
      const noise = .6 + .15 * Math.sin(px * 25 + Math.sin(py * 19)) + .12 * Math.cos(py * 37 + px * 16);
      pixels[y * 64 + x] = Math.round(255 * Math.exp(-r * r * 14) * edge * edge * (3 - 2 * edge) * noise);
    }
    gl.bindTexture(gl.TEXTURE_2D, cloud);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 64, 64, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, pixels);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.trails = this.createProgram(trailVertex, trailFragment, ["aspect"], ["position", "light"]);
    this.core = this.createProgram(coreVertex, coreFragment, ["resolution", "center", "energy", "release", "flash", "reduced"], ["position"]);
    for (let i = 0; i < 3; i++) { const buffer = gl.createBuffer(); if (!buffer) throw new Error("Buffer unavailable"); this.buffers.push(buffer); }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[2]);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
  }

  private createProgram(vertex: string, fragment: string, uniforms: string[], attributes: string[]): Program {
    const gl = this.gl, program = gl.createProgram();
    if (!program) throw new Error("Program unavailable");
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]] as const) {
      const shader = gl.createShader(type); if (!shader) throw new Error("Shader unavailable");
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed");
      this.shaders.push(shader); gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Program linking failed");
    return { program,
      uniforms: Object.fromEntries(uniforms.map(name => [name, gl.getUniformLocation(program, `u_${name}`)])),
      attributes: Object.fromEntries(attributes.map(name => [name, gl.getAttribLocation(program, `a_${name}`)])),
    };
  }
  resize(width: number, height: number, dpr: number) {
    this.dpr = dpr; this.height = height;
    this.canvas.width = Math.max(1, Math.round(width * dpr));
    this.canvas.height = Math.max(1, Math.round(height * dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }
  private attribute(location: number, size: number, stride: number, offset: number) {
    if (location < 0) return;
    this.gl.enableVertexAttribArray(location);
    this.gl.vertexAttribPointer(location, size, this.gl.FLOAT, false, stride * 4, offset * 4);
  }
  private disableAttributes() {
    for (let i = 0; i < 3; i++) this.gl.disableVertexAttribArray(i);
  }
  draw(field: ParticleField, state: FieldState, reduced: boolean) {
    const gl = this.gl, { points, vertices } = field.pack(state, reduced);
    gl.clearColor(.004,.009,.024,1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(this.points.program);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.cloud);
    gl.uniform1i(this.points.uniforms.cloud, 0);
    gl.uniform1f(this.points.uniforms.aspect, field.aspect);
    gl.uniform1f(this.points.uniforms.dpr, this.dpr);
    gl.uniform1f(this.points.uniforms.height, this.height);
    gl.uniform1f(this.points.uniforms.time, reduced ? 0 : field.time);
    gl.uniform1f(this.points.uniforms.reduced, reduced ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[0]);
    if (this.pointCapacity !== field.pointData.byteLength) {
      this.pointCapacity = field.pointData.byteLength;
      gl.bufferData(gl.ARRAY_BUFFER, this.pointCapacity, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, field.pointData);
    this.attribute(this.points.attributes.position, 3, 9, 0);
    this.attribute(this.points.attributes.style, 4, 9, 3);
    this.attribute(this.points.attributes.pulse, 2, 9, 7);
    gl.drawArrays(gl.POINTS, 0, points);
    this.disableAttributes();

    gl.useProgram(this.trails.program);
    gl.uniform1f(this.trails.uniforms.aspect, field.aspect);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[1]);
    if (this.trailCapacity !== field.trailData.byteLength) {
      this.trailCapacity = field.trailData.byteLength;
      gl.bufferData(gl.ARRAY_BUFFER, this.trailCapacity, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, field.trailData.subarray(0, vertices * 6));
    this.attribute(this.trails.attributes.position, 3, 6, 0);
    this.attribute(this.trails.attributes.light, 3, 6, 3);
    gl.drawArrays(gl.TRIANGLES, 0, vertices);
    this.disableAttributes();

    gl.useProgram(this.core.program);
    gl.blendFunc(gl.ONE, gl.ONE);
    const energy = reduced ? state.compression * .15 : state.phase === "rupture" || state.phase === "afterglow" ? field.releasedEnergy * state.glow : field.captureFraction;
    gl.uniform2f(this.core.uniforms.resolution, this.canvas.width, this.canvas.height);
    gl.uniform2f(this.core.uniforms.center, field.centerX, field.centerY);
    gl.uniform1f(this.core.uniforms.energy, energy);
    gl.uniform1f(this.core.uniforms.release, state.release);
    gl.uniform1f(this.core.uniforms.flash, reduced ? 0 : state.glow);
    gl.uniform1f(this.core.uniforms.reduced, reduced ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffers[2]);
    this.attribute(this.core.attributes.position, 2, 2, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    this.disableAttributes();
  }
  dispose() {
    const gl = this.gl;
    this.shaders.forEach(shader => gl.deleteShader(shader));
    this.buffers.forEach(buffer => gl.deleteBuffer(buffer));
    gl.deleteTexture(this.cloud);
    [this.points, this.trails, this.core].forEach(item => gl.deleteProgram(item.program));
  }
}
```

## src/lib/light-shaders.ts

```typescript
// These shaders draw individual bodies and their recorded paths. They never
// generate a galaxy, rotate a field texture, or remap the scene around the hand.
const palette = `
vec3 lightColor(float hue) {
  if (hue < .28) return mix(vec3(.16,.32,1.0),vec3(.20,.86,1.0),hue/.28);
  if (hue < .60) return mix(vec3(.38,.19,1.0),vec3(.92,.36,.78),(hue-.28)/.32);
  if (hue < .82) return mix(vec3(1.0,.66,.36),vec3(1.0,.87,.68),(hue-.60)/.22);
  return vec3(.82,.94,1.0);
}
`;
const projection = `
vec2 project(vec3 p) {
  float perspective = 1.0/max(.55,1.0+p.z*.32);
  return vec2(p.x/u_aspect,p.y)*2.0*perspective;
}
${palette}
`;

export const pointVertex = `
precision highp float;
attribute vec3 a_position;
attribute vec4 a_style;
attribute vec2 a_pulse;
uniform float u_aspect;
uniform float u_dpr;
uniform float u_height;
uniform float u_time;
uniform float u_reduced;
varying vec4 v_style;
varying float v_phase;
${projection}
void main() {
  vec2 projected = project(a_position);
  gl_Position = vec4(projected,0.0,1.0);
  float depth = 1.0/max(.55,1.0+a_position.z*.32);
  float isGas = step(2.5,a_style.w);
  gl_PointSize = max(1.0,a_style.x*u_dpr*depth*mix(1.0,u_height/1000.0,isGas));
  float pulse = mix(.66+.34*sin(u_time*a_pulse.y+a_pulse.x),1.0,u_reduced);
  float veil = mix(.40,1.0,smoothstep(-.92,.10,projected.x));
  v_style = vec4(a_style.x,a_style.y*pulse*veil,a_style.z,a_style.w);
  v_phase = a_pulse.x;
}
`;

export const pointFragment = `
precision highp float;
varying vec4 v_style;
varying float v_phase;
uniform float u_time;
${palette}
uniform sampler2D u_cloud;
void main() {
  vec2 p=gl_PointCoord-.5;
  float radius=length(p);
  if(radius>.5) discard;
  float alpha=0.0;
  vec3 color=lightColor(v_style.z);
  if(v_style.w>2.5) {
    alpha=texture2D(u_cloud,gl_PointCoord).r;
    color=lightColor(v_style.z)*.85;
  } else if(v_style.w>1.5) {
    float angle=v_phase+u_time*(.12+v_style.z*.2);
    p=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p;
    float diamond=abs(p.x)*2.8+abs(p.y)*1.5;
    alpha=(1.0-smoothstep(.15,.6,diamond))*.9+exp(-radius*radius*24.0)*.25;
  } else {
    alpha=exp(-radius*radius*34.0)+exp(-radius*radius*8.0)*.20;
    if(v_style.w>.5) {
      alpha+=exp(-abs(p.x)*65.0-abs(p.y)*10.0)*.23;
      alpha+=exp(-abs(p.y)*65.0-abs(p.x)*10.0)*.23;
    }
    alpha*=1.0-smoothstep(.32,.50,radius);
  }
  gl_FragColor=vec4(color,alpha*v_style.y);
}
`;

export const trailVertex = `
precision highp float;
attribute vec3 a_position;
attribute vec3 a_light;
uniform float u_aspect;
varying vec4 v_color;
varying float v_edge;
${projection}
void main() {
  vec2 p=project(a_position);
  gl_Position=vec4(p,0.0,1.0);
  float veil=mix(.30,1.0,smoothstep(-.9,.1,p.x));
  v_color=vec4(lightColor(a_light.y),a_light.x*veil);
  v_edge=a_light.z;
}
`;
export const trailFragment = `
precision highp float;
varying vec4 v_color;
varying float v_edge;
void main() { gl_FragColor=vec4(v_color.rgb,v_color.a*exp(-v_edge*v_edge*4.0)); }
`;

export const coreVertex = `
attribute vec2 a_position;
void main(){gl_Position=vec4(a_position,0.0,1.0);}
`;
export const coreFragment = `
precision mediump float;
uniform vec2 u_resolution;
uniform vec2 u_center;
uniform float u_energy;
uniform float u_release;
uniform float u_flash;
uniform float u_reduced;
void main(){
  vec2 uv=gl_FragCoord.xy/u_resolution;
  vec2 p=(uv-.5)*vec2(u_resolution.x/u_resolution.y,1.0)-u_center;
  float r=length(p);
  float core=exp(-r*r/.000015)*u_energy;
  float halo=exp(-r*r/.0018)*u_energy*.075;
  float cross=(exp(-abs(p.x)*13.0-abs(p.y)*1800.0)+exp(-abs(p.y)*25.0-abs(p.x)*1800.0))*u_energy*.11;
  float ring=exp(-abs(r-.040)*950.0)*u_energy*.065;
  float shock=exp(-pow((r-u_release*1.7)/.016,2.0))*u_flash*.13*(1.0-u_reduced);
  float flash=exp(-r*6.0)*u_flash*.24*(1.0-u_reduced);
  vec3 color=vec3(.83,.93,1.0)*core+vec3(.18,.41,1.0)*(halo+cross+ring+shock)+vec3(.7,.85,1.0)*flash;
  gl_FragColor=vec4(color,1.0);
}
`;
```

## src/lib/canvas-field-renderer.ts

```typescript
import type { FieldState } from "./gravity";
import type { FieldRenderer } from "./field-renderer";
import type { ParticleField } from "./particle-field";

/** The fallback draws the same individual bodies and histories with Canvas 2D. */
export class CanvasFieldRenderer implements FieldRenderer {
  private ctx: CanvasRenderingContext2D;
  private width = 1;
  private height = 1;
  private dpr = 1;
  private glow: HTMLCanvasElement;
  private clouds: HTMLCanvasElement[] = [];
  private colors = ['#5282ff', '#51dbed', '#a271ff', '#e47bbc', '#ffd4a1'];
  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D unavailable");
    this.ctx = ctx;
    this.glow = document.createElement("canvas"); this.glow.width = this.glow.height = 64;
    const sprite = this.glow.getContext("2d")!;
    const gradient = sprite.createRadialGradient(32,32,0,32,32,32);
    gradient.addColorStop(0,"#dceaff"); gradient.addColorStop(.12,"#88b7ff"); gradient.addColorStop(.4,"#315dda60"); gradient.addColorStop(1,"#11285000");
    sprite.fillStyle = gradient; sprite.fillRect(0,0,64,64);
    this.clouds = this.colors.map(color => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      const cloud = ctx.createRadialGradient(32,32,0,32,32,32);
      cloud.addColorStop(0, color); cloud.addColorStop(.25, color + '80'); cloud.addColorStop(1, color + '00');
      ctx.fillStyle = cloud; ctx.fillRect(0,0,64,64);
      return canvas;
    });
  }
  resize(width: number, height: number, dpr: number) {
    this.width = width; this.height = height; this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(width * dpr)); this.canvas.height = Math.max(1, Math.round(height * dpr));
  }
  draw(field: ParticleField, state: FieldState, reduced: boolean) {
    const ctx = this.ctx, h = this.height, w = this.width;
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1; ctx.fillStyle = "#010306"; ctx.fillRect(0,0,w,h);
    ctx.globalCompositeOperation = "lighter";
    for (const p of field.lights) {
      const depth = 1 / Math.max(.55, 1 + p.z * .32);
      const x = w * .5 + p.x * depth * h, y = h * .5 - p.y * depth * h;
      if (x < -300 || x > w + 300 || y < -300 || y > h + 300) continue;
      const pulse = reduced ? 1 : .66 + .34 * Math.sin(field.time * p.pulseRate + p.phase);
      const veil = Math.max(.3, Math.min(1, x / w * 1.8));
      ctx.globalAlpha = Math.min(1,p.brightness * p.alpha * pulse * veil * (state.phase === "silence" && p.kind === "star" ? .08 : 1));
      if (p.kind === "gas" || p.kind === "glint" || p.kind === "fragment") {
        const size = p.size * (p.kind === "gas" ? h / 1000 : 2) * depth;
        ctx.drawImage(this.clouds[Math.min(4, Math.floor(p.hue * 5))],x-size/2,y-size/2,size,size);
      } else {
        ctx.fillStyle = p.hue > .82 ? "#dceaff" : this.colors[Math.min(4, Math.floor(p.hue * 5))];
        ctx.fillRect(x,y,Math.max(.6,p.size*.55*depth),Math.max(.6,p.size*.55*depth));
      }
    }
    ctx.lineWidth = .65; ctx.strokeStyle = "#9ebdff";
    for (const trail of field.streams) {
      if (trail.light.captured || state.phase === "silence") continue;
      ctx.globalAlpha = trail.light.brightness * trail.light.alpha * .23;
      ctx.strokeStyle = this.colors[Math.min(4, Math.floor(trail.light.hue * 5))];
      ctx.beginPath();
      for (let j = 0; j < trail.length; j++) {
        const index = ((trail.head-j+trail.length)%trail.length)*3;
        const depth = 1/Math.max(.55,1+trail.history[index+2]*.32);
        const x = w*.5+trail.history[index]*depth*h, y = h*.5-trail.history[index+1]*depth*h;
        if (j===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    const energy = reduced ? state.compression*.15 : Math.max(field.captureFraction,state.glow*.6);
    if (energy > .01) {
      const x=w*.5+field.centerX*h,y=h*.5-field.centerY*h,size=85;
      ctx.globalAlpha=Math.min(1,energy); ctx.drawImage(this.glow,x-size/2,y-size/2,size,size);
    }
    ctx.globalAlpha = 1;
  }
  dispose() { this.glow.width = this.glow.height = 1; this.clouds.forEach(canvas => { canvas.width = canvas.height = 1; }); }
}
```

## src/components/interaction-lab.tsx

```tsx
"use client";

import { useState } from "react";
import { Icon } from "./icons";

const scenes = [
  { title: "Creative websites", name: "Aether", description: "Let visitors become part of the composition.", label: "01 / CREATIVE CANVAS", glyph: "A", className: "aether" },
  { title: "Interactive installations", name: "Forma", description: "Turn a screen into a space people can play with.", label: "02 / SPATIAL EXPERIENCE", glyph: "F", className: "forma" },
  { title: "Touchless interfaces", name: "Orbit", description: "Give everyday interfaces a new way to respond.", label: "03 / EVERYDAY INTERACTION", glyph: "O", className: "orbit" },
];

export function InteractionLab() {
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const scene = scenes[selected];
  return <section className="section lab-section" id="possibilities" aria-labelledby="lab-title">
    <div className="section-heading"><div><div className="eyebrow">03 / POSSIBILITIES</div><h2 id="lab-title">A gesture is just<br />the beginning.</h2></div><p>Same web. A different kind of connection.<br />Imagine what you could put within reach.</p></div>
    <div className="lab-layout">
      <div className={`demo-browser ${scene.className} ${expanded ? "is-expanded" : ""}`}>
        <div className="browser-chrome"><div><i /><i /><i /></div><span>an idea, brought to life</span><Icon name="code" width="14" height="14" /></div>
        <div className="demo-content"><span className="demo-wordmark">{scene.name.toLowerCase()}®</span><span className="demo-edition">EXPLORATIONS — VOL. 01</span><div className="demo-art" aria-hidden="true"><i /><i /><i /><span>{scene.glyph}</span></div><div className="demo-caption"><div><span>{scene.label}</span><h3>{expanded ? "You’re part of it." : "Made to be felt."}</h3></div><button aria-label={expanded ? "Reset composition" : "Transform composition"} aria-pressed={expanded} onClick={() => setExpanded(!expanded)}><Icon name={expanded ? "close" : "arrow"} /></button></div></div>
        <div className="demo-footer"><i className="live-dot" /><span>A REAL INTERFACE. TRY THE ARROW.</span><span>POWERED BY AIRCURSOR</span></div>
      </div>
      <div className="scene-options" aria-label="Example scenes">{scenes.map((item, index) => <button key={item.name} className={selected === index ? "scene-option is-selected" : "scene-option"} onClick={() => { setSelected(index); setExpanded(false); }} aria-pressed={selected === index}><span className="scene-number">0{index+1}</span><span><strong>{item.title}</strong><span>{item.description}</span></span><Icon /></button>)}<p className="lab-note"><Icon name="hand" width="18" height="18" />Camera enabled? These buttons respond to your hand, too.</p></div>
    </div>
  </section>;
}
```

## src/components/install-section.tsx

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
const commands = { npm: "npm install air-cursor", pnpm: "pnpm add air-cursor", yarn: "yarn add air-cursor" };

export function InstallSection() {
  const [manager, setManager] = useState<keyof typeof commands>("npm");
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try { await navigator.clipboard.writeText(commands[manager]); setCopied(true); setMessage("Command copied"); clearTimeout(timer.current); timer.current = setTimeout(() => { setCopied(false); setMessage(""); }, 2200); }
    catch { setMessage("Select the command to copy it manually."); }
  }
  return <section className="section install-section" id="install" aria-labelledby="install-title">
    <div className="install-copy"><div className="eyebrow">04 / MAKE IT YOURS</div><h2 id="install-title">Less setup.<br /><span>More possibility.</span></h2><p>Your UI already knows how to respond.<br />AirCursor gives it a new way to listen.</p><a className="text-link" href="https://github.com/ritsuki-i/AirCursor#readme">Read the documentation <Icon /></a><div className="install-tags"><span>React component</span><span>TypeScript ready</span><span>MIT license</span></div></div>
    <div className="code-panel"><div className="code-tabs" aria-label="Package manager">{(Object.keys(commands) as Array<keyof typeof commands>).map(name => <button key={name} aria-pressed={manager === name} onClick={() => { setManager(name); setCopied(false); setMessage(""); }}>{name}</button>)}<span>01 / INSTALL</span></div><div className="install-command"><span>$</span><code>{commands[manager]}</code><button onClick={copy} aria-label="Copy install command"><Icon name={copied ? "check" : "copy"} width="17" height="17" /></button></div><span className="copy-message" role="status">{message}</span><div className="code-file"><span><i /> app/air-control.tsx</span><span>02 / CONNECT</span></div><pre><code><span className="syntax-muted">{"'use client';"}</span>{"\n\n"}<span className="syntax-blue">import</span>{" AirCursor "}<span className="syntax-blue">from</span>{" "}<span className="syntax-mint">{'\'air-cursor\';'}</span>{"\n\n"}<span className="syntax-blue">export default function</span>{" AirControl() {\n  "}<span className="syntax-blue">return</span>{" <"}<span className="syntax-mint">AirCursor</span>{" />;\n}"}</code></pre><div className="code-footnote"><i className="live-dot" /> Add this component to your page. Let your hands take it from there.</div></div>
  </section>;
}
```

## tests/gravity.test.ts

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceField, initialField, initialInput } from "../src/lib/gravity";

test("compressed light waits indefinitely for an explicit click in hand and preview modes", () => {
  for (const demo of [false, true]) {
    const s = initialField(), input = initialInput();
    input.demo = demo; input.pressed = !demo; input.detected = true;
    for (let i = 0; i < 1500; i++) {
      advanceField(s, input, .02);
      assert.notEqual(s.phase, "rupture");
    }
    assert.equal(s.phase, "silence");
    assert.equal(s.compression, 1);
    const waitingTime = s.time, waitingX = s.x;
    input.x = .2; input.y = .3;
    advanceField(s, input, .05);
    assert.ok(s.time > waitingTime && s.time < waitingTime + .02, "the held core keeps a subtle visual clock");
    assert.ok(s.x < waitingX, "the held core must continue following the pointer");
    assert.equal(s.phase, "silence");
    input.pressed = false; input.launch = true;
    advanceField(s, input, .02);
    assert.equal(s.phase, "rupture");
    assert.equal(s.elapsed, 0, "launch must not wait for a timer");
    assert.equal(s.glow, 1);
    assert.equal(input.launch, false);
    let launches = 1;
    for (let i = 0; i < 500; i++) {
      const previous = s.phase;
      advanceField(s, input, .02);
      if (previous !== "rupture" && s.phase === "rupture") launches++;
    }
    assert.equal(launches, 1);
    assert.equal(input.demo, false);
    input.pressed = true;
    advanceField(s, input, .02);
    assert.equal(s.phase, "attraction");
  }
});

test("clicks during gathering launch immediately without a capture threshold", () => {
  for (const frames of [10, 50]) {
    const s = initialField(), input = initialInput();
    input.pressed = true;
    for (let i = 0; i < frames; i++) advanceField(s, input, .02, { captureFraction: .1 });
    input.pressed = false; input.launch = true;
    advanceField(s, input, .02, { captureFraction: .1 });
    assert.equal(s.phase, "rupture");
  }
});

test("a click without gathered light is consumed and cannot launch a later cycle", () => {
  const s = initialField(), input = initialInput();
  input.launch = true;
  advanceField(s, input, .02);
  assert.equal(s.phase, "ambient");
  input.pressed = true;
  for (let i = 0; i < 500; i++) advanceField(s, input, .02);
  assert.equal(s.phase, "silence");
});

test("losing the pointer after compression cancels without a launch", () => {
  const s = initialField(), input = initialInput();
  input.pressed = true;
  for (let i = 0; i < 200; i++) advanceField(s, input, .02);
  input.pressed = false;
  advanceField(s, input, .02);
  assert.equal(s.phase, "afterglow");
  for (let i = 0; i < 300; i++) {
    advanceField(s, input, .02);
    assert.notEqual(s.phase, "rupture");
  }
});

test("losing input during attraction settles without an accidental rupture", () => {
  const s = initialField(), input = initialInput();
  input.pressed = true;
  advanceField(s, input, .02);
  input.pressed = false;
  advanceField(s, input, .02);
  assert.equal(s.phase, "afterglow");
  for (let i = 0; i < 180; i++) advanceField(s, input, .02);
  assert.equal(s.phase, "ambient");
  assert.equal(s.compression, 0);
});

test("background time jumps cannot skip the silence or rupture", () => {
  const s = initialField(), input = initialInput(); input.demo = true;
  advanceField(s, input, 600);
  assert.equal(s.phase, "attraction");
  assert.ok(s.time <= .05);
  assert.ok(Number.isFinite(s.x));
});

test("releasing early cancels even while the pointer remains over the field", () => {
  const s = initialField(), input = initialInput();
  input.detected = true; input.pressed = true;
  advanceField(s, input, .02);
  input.pressed = false;
  advanceField(s, input, .02);
  assert.equal(s.phase, "afterglow");
});
```

## tests/particle-field.test.ts

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { advanceField, initialField, initialInput } from "../src/lib/gravity";
import { FIXED_STEP, ParticleField, type FieldBudget } from "../src/lib/particle-field";

const budget: FieldBudget = { stars: 12, dust: 160, glints: 25, fragments: 12, streams: 12, gas: 4 };
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x-b.x,a.y-b.y);

test("ambient bodies preserve identity and move relative to one another", () => {
  const field = new ParticleField(budget), state = initialField();
  const a = field.lights[30], b = field.lights[70];
  const ids = field.lights.map(p => p.id);
  const original = distance(a,b);
  for (let i=0;i<240;i++) field.step(state,FIXED_STEP);
  assert.deepEqual(field.lights.map(p => p.id),ids);
  assert.ok(Math.abs(distance(a,b)-original) > .001, "motion must not be a rigid transform");
  assert.notEqual(a.vx,b.vx);
  assert.notEqual(a.pulseRate,b.pulseRate);
});

test("hand detection bends nearby bodies much more than distant ones", () => {
  const active = new ParticleField(budget), control = new ParticleField(budget);
  const state = initialField(); state.phase = "detection";
  state.x = .5; state.y = .5;
  for (const field of [active,control]) {
    Object.assign(field.lights[25],{ x:.05,y:.03,z:0,vx:0,vy:0,vz:0 });
    Object.assign(field.lights[26],{ x:.9,y:.3,z:0,vx:0,vy:0,vz:0 });
  }
  for (let i=0;i<60;i++) { active.step(state,FIXED_STEP); control.step(initialField(),FIXED_STEP); }
  const near = distance(active.lights[25],control.lights[25]);
  const far = distance(active.lights[26],control.lights[26]);
  assert.ok(near > far*20);
});

test("individual trajectories converge, follow as a compressed core, then receive varied one-time impulses", () => {
  const field = new ParticleField(budget), state = initialField(), input = initialInput();
  const originalIds = field.lights.map(p=>p.id);
  input.demo = true;
  for (let i=0;i<1000 && state.phase!=="silence";i++) {
    advanceField(state,input,FIXED_STEP,field); field.step(state,FIXED_STEP);
  }
  assert.equal(state.phase,"silence");
  assert.ok(field.captureFraction>.93,`capture fraction ${field.captureFraction}`);
  const trackedCore = field.lights.find(p=>p.captured && p.kind!=="gas")!;
  const coreBefore = [trackedCore.x,trackedCore.y];
  input.x=.25; input.y=.3;
  for(let i=0;i<20;i++) { advanceField(state,input,FIXED_STEP,field); field.step(state,FIXED_STEP); }
  assert.equal(state.phase,"silence");
  assert.notDeepEqual([trackedCore.x,trackedCore.y],coreBefore);
  assert.ok(Math.abs(trackedCore.x-field.centerX)<.01 && Math.abs(trackedCore.y-field.centerY)<.01,"the compressed core must stay attached to the pointer");
  input.launch=true;
  advanceField(state,input,FIXED_STEP,field);
  assert.equal(state.phase,"rupture");
  for(let i=0;i<35;i++) field.step(state,FIXED_STEP);
  const released=field.lights.filter(p=>p.released && p.kind!=="gas");
  assert.ok(released.length>100);
  const speeds=new Set(released.map(p=>Math.hypot(p.vx,p.vy,p.vz).toFixed(2)));
  assert.ok(speeds.size>30);
  assert.ok(new Set(released.map(p=>p.lifetime.toFixed(1))).size>15);
  assert.deepEqual(field.lights.map(p=>p.id),originalIds);
  const tracked=released[0], before=Math.hypot(tracked.vx,tracked.vy,tracked.vz);
  field.step(state,FIXED_STEP);
  assert.ok(Math.hypot(tracked.vx,tracked.vy,tracked.vz)<before,"the launch impulse must not repeat each frame");
});

test("streamlines contain each body's actual sampled path", () => {
  const field=new ParticleField(budget), state=initialField(), trail=field.streams[0];
  const old=trail.history.slice();
  for(let i=0;i<60;i++) field.step(state,FIXED_STEP);
  assert.notDeepEqual(trail.history,old);
  const newest=trail.head*3;
  assert.ok(Math.abs(trail.history[newest]-trail.light.x)<.003);
  assert.ok(Math.abs(trail.history[newest+1]-trail.light.y)<.003);
});

test("multiple full cycles remain finite and reuse their particle population", () => {
  const field=new ParticleField(budget), state=initialField(), input=initialInput();
  const total=field.lights.length;
  for(let cycle=0;cycle<3;cycle++) {
    input.demo=true;
    for(let i=0;i<1200;i++) {
      if(i===600) input.launch=true;
      advanceField(state,input,FIXED_STEP,field); field.step(state,FIXED_STEP);
    }
    for(const p of field.lights) assert.ok([p.x,p.y,p.z,p.vx,p.vy,p.vz,p.alpha].every(Number.isFinite));
    assert.equal(field.lights.length,total);
    assert.equal(input.demo,false);
  }
});
```

## playwright.config.ts

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45_000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: { args: ["--enable-webgl", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  webServer: { command: "npm run dev -- --hostname 127.0.0.1 --port 3100", url: "http://127.0.0.1:3100", reuseExistingServer: true, timeout: 120_000 },
});
```

## tests/browser/site.spec.ts

```typescript
import { test, expect } from "@playwright/test";

test("desktop field, all seven phases, pause, install, and real demo controls", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", msg => { if (msg.type() === "warning" && msg.text().includes("Gravity field")) errors.push(msg.text()); });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Move your hand.Move the Web.");
  await page.waitForTimeout(1500);
  await expect(page.locator(".gravity-field")).not.toHaveClass(/is-fallback/);
  await page.screenshot({ path: "test-results/desktop-ambient.png", fullPage: true });
  await page.locator(".hero").screenshot({ path: "test-results/hero-ambient.png" });
  await page.evaluate(() => {
    const phases: string[] = [];
    (window as unknown as { observedPhases: string[] }).observedPhases = phases;
    const canvas = document.querySelector<HTMLElement>(".gravity-field")!;
    new MutationObserver(() => { const phase = canvas.dataset.phase!; if (phases.at(-1) !== phase) phases.push(phase); }).observe(canvas, { attributes: true, attributeFilter: ["data-phase"] });
  });
  await page.getByRole("button", { name: "Play the experience" }).click();
  await expect(page.locator(".gravity-field")).toHaveAttribute("data-phase", "attraction");
  await expect(page.locator(".gravity-field")).toHaveAttribute("data-phase", "compression");
  await page.waitForTimeout(650);
  await page.locator(".hero").screenshot({ path: "test-results/hero-compression.png" });
  await expect(page.locator(".gravity-field")).toHaveAttribute("data-phase", "silence");
  await page.waitForTimeout(1200);
  await expect(page.locator(".gravity-field")).toHaveAttribute("data-phase", "silence");
  await page.getByRole("button", { name: "Release the light" }).click();
  await expect(page.locator(".gravity-field")).toHaveAttribute("data-phase", "rupture");
  await page.locator(".hero").screenshot({ path: "test-results/hero-rupture.png" });
  await expect(page.locator(".gravity-field")).toHaveAttribute("data-phase", "afterglow");
  await expect(page.getByRole("button", { name: "Play the experience" })).toBeEnabled({ timeout: 10000 });
  expect(await page.evaluate(() => (window as unknown as { observedPhases: string[] }).observedPhases)).toEqual(expect.arrayContaining(["attraction", "compression", "silence", "rupture", "afterglow"]));
  await page.getByRole("button", { name: "Pause animation" }).click();
  await expect(page.getByRole("button", { name: "Resume animation" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Resume animation" }).click();
  await page.getByRole("button", { name: "Transform composition" }).click();
  await expect(page.getByRole("heading", { name: "You’re part of it." })).toBeVisible();
  await page.getByRole("button", { name: /Interactive installations/ }).click();
  await expect(page.locator(".demo-wordmark")).toHaveText("forma®");
  await page.getByRole("button", { name: "pnpm", exact: true }).click();
  await expect(page.locator(".install-command code")).toHaveText("pnpm add air-cursor");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy install command" }).click();
  await expect(page.getByText("Command copied", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("pnpm add air-cursor");
  expect(errors).toEqual([]);
});

test("mobile, keyboard preview, navigation, and reduced motion", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("navigation").getByRole("link", { name: "Features" }).click();
  await expect(page.getByRole("button", { name: "Open navigation" })).toHaveAttribute("aria-expanded", "false");
  await page.locator("#experience").scrollIntoViewIfNeeded();
  const preview = page.getByRole("button", { name: "Play the experience" });
  await preview.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".gravity-field")).toHaveAttribute("data-phase", "attraction");
  await expect(preview).toBeEnabled({ timeout: 10000 });
});

test("camera denied preserves the complete mouse fallback", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: () => Promise.reject(new DOMException("Denied for test", "NotAllowedError")) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Enable hand tracking" }).click();
  await expect(page.locator(".camera-error")).toContainText("permission was declined", { timeout: 20000 });
  await expect(page.getByRole("button", { name: "Enable hand tracking" })).toBeEnabled();
  await page.mouse.move(1000, 450); await page.mouse.down();
  await expect(page.locator(".gravity-field")).toHaveAttribute("data-phase", "attraction");
  await page.mouse.up();
  expect(errors).toEqual([]);
});

test("unavailable WebGL still has a usable field and timeline", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      if (kind === "webgl") return null;
      return original.apply(this, [kind, ...args] as Parameters<typeof original>);
    } as typeof original;
  });
  await page.goto("/");
  await expect(page.locator(".gravity-field")).toHaveClass(/is-fallback/);
  await page.getByRole("button", { name: "Play the experience" }).click();
  await expect(page.locator(".gravity-field")).toHaveAttribute("data-phase", "attraction");
  await page.screenshot({ path: "test-results/fallback.png" });
  await expect(page.getByRole("button", { name: "Play the experience" })).toBeEnabled({ timeout: 10000 });
});

test("a camera permission response arriving after cancellation stops its tracks", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: () => new Promise(resolve => {
      (window as unknown as { resolveCamera: (stream: MediaStream) => void }).resolveCamera = resolve;
    }) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Enable hand tracking" }).click();
  await page.waitForFunction(() => "resolveCamera" in window);
  await page.getByRole("button", { name: "Cancel camera" }).click();
  await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 32; canvas.height = 32;
    const stream = canvas.captureStream(1);
    const scope = window as unknown as { resolveCamera: (stream: MediaStream) => void; lateTrack: MediaStreamTrack };
    scope.lateTrack = stream.getVideoTracks()[0]; scope.resolveCamera(stream);
  });
  await page.waitForFunction(() => (window as unknown as { lateTrack: MediaStreamTrack }).lateTrack.readyState === "ended");
  await expect(page.locator(".tracking-video")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enable hand tracking" })).toBeVisible();
});
```

## scripts/export-source.mjs

```javascript
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const files = [
  ".gitignore", "package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs",
  "loaders/mediapipe.cjs", "src/app/layout.tsx", "src/app/page.tsx", "src/app/globals.css", "src/app/hero.css", "src/app/icon.svg",
  "src/components/icons.tsx", "src/components/site-header.tsx", "src/components/air-cursor-provider.tsx",
  "src/components/hand-tracking-hero.tsx", "src/components/gravity-field.tsx", "src/lib/gravity.ts",
  "src/lib/particle-field.ts", "src/lib/field-renderer.ts", "src/lib/light-shaders.ts", "src/lib/canvas-field-renderer.ts",
  "src/components/interaction-lab.tsx", "src/components/install-section.tsx",
  "tests/gravity.test.ts", "tests/particle-field.test.ts", "playwright.config.ts", "tests/browser/site.spec.ts",
  "scripts/export-source.mjs", "scripts/capture-reference.mjs",
];
const languages = { ".json": "json", ".ts": "typescript", ".tsx": "tsx", ".mjs": "javascript", ".cjs": "javascript", ".css": "css", ".svg": "xml" };
const sections = await Promise.all(files.map(async file => {
  const source = await readFile(path.join(root, file), "utf8");
  return `## ${file}\n\n\`\`\`${languages[path.extname(file)] || "text"}\n${source.trimEnd()}\n\`\`\`\n`;
}));
await writeFile(path.join(root, "SOURCE.md"), "# AirCursor Website — 全実装コード\n\n実際のファイルをファイル別に収録しています。設計・起動方法は [README.md](./README.md) を参照してください。`package-lock.json` はリポジトリに別途同梱。Next.js が生成する `next-env.d.ts` とビルド出力は収録対象外です。\n\n" + sections.join("\n"), "utf8");
console.log(`SOURCE.md: ${files.length} complete source files exported.`);
```

## scripts/capture-reference.mjs

```javascript
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const output = "test-results/reference";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => console.error(error));
  await page.goto("http://127.0.0.1:3100/", { waitUntil: "networkidle" });
  const pause = () => page.evaluate(() => document.querySelector('[aria-label="Pause animation"]').click());
  const resume = () => page.evaluate(() => document.querySelector('[aria-label="Resume animation"]').click());
  const shot = name => page.locator(".hero").screenshot({ path: `${output}/${name}.png` });
  await page.waitForTimeout(700);
  await pause(); await shot("01-ambient");
  await resume(); await page.mouse.move(1010, 535); await page.waitForTimeout(500);
  await pause(); await shot("02-detection");
  await page.getByRole("button", { name: "Play the experience" }).click();
  await page.waitForFunction(() => document.querySelector(".gravity-field").dataset.phase === "attraction" && Number(document.querySelector(".gravity-field").dataset.elapsed) > .45);
  await pause(); await shot("03-attraction");
  await resume();
  await page.waitForFunction(() => document.querySelector(".gravity-field")?.dataset.phase === "compression");
  await page.waitForFunction(() => Number(document.querySelector(".gravity-field").dataset.elapsed) > .98);
  await pause(); await shot("04-compression");
  // Freeze the fully compressed core before explicitly releasing it.
  await page.evaluate(() => {
    const canvas = document.querySelector(".gravity-field");
    const observer = new MutationObserver(() => {
      if (canvas.dataset.phase === "silence") {
        document.querySelector('[aria-label="Pause animation"]').click();
        observer.disconnect();
      }
    });
    observer.observe(canvas, { attributes: true, attributeFilter: ["data-phase"] });
  });
  await resume();
  await page.waitForFunction(() => document.querySelector(".gravity-field")?.dataset.phase === "silence");
  await shot("05-silence");
  await page.getByRole("button", { name: "Release the light" }).click();
  await resume();
  await page.waitForFunction(() => document.querySelector(".gravity-field")?.dataset.phase === "rupture");
  await page.waitForFunction(() => Number(document.querySelector(".gravity-field").dataset.elapsed) > .10);
  await pause(); await shot("06-rupture");
  await resume();
  await page.waitForFunction(() => document.querySelector(".gravity-field")?.dataset.phase === "afterglow");
  await page.waitForTimeout(700); await pause(); await shot("07-afterglow");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:3100/", { waitUntil: "networkidle" });
  await pause(); await shot("08-mobile");
  console.log(`Saved the seven visual states and mobile composition to ${output}.`);
} finally { await browser.close(); }
```
