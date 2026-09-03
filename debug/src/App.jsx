// debug/src/App.jsx
//
// A harness for the *published* package, not for the source tree.
//
// `air-cursor` is installed here from `npm pack`'s tarball rather than as a
// path dependency, so this exercises what a consumer actually receives: the
// `files` allowlist, the `exports` map, and the compiled CJS that a bundler
// resolves. A path dependency symlinks the working tree and quietly bypasses
// all three, which is how a package can pass every test in its own repo and
// still fail to import once published.
//
// What it checks, in the order the panels appear:
//
//   1. the component mounts, asks for consent and starts the camera
//   2. pointer events reach ordinary DOM — click, hover, right click, drag,
//      and a nested scroll container
//   3. the active region is applied and drawn on the preview
//   4. render and inference rates are visible separately
//   5. a two-hand region selection is reported and cropped through the
//      package's own `cropRegion`

import React, { useCallback, useRef, useState } from 'react';
import AirCursor, { cropRegion, DEFAULT_ACTIVE_REGION } from 'air-cursor';
import html2canvas from 'html2canvas';

const styles = {
  page: {
    minHeight: '160vh',
    background: '#0d0a10',
    color: '#f2ecef',
    fontFamily: 'system-ui, sans-serif',
    padding: '24px',
    boxSizing: 'border-box',
  },
  bar: { display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' },
  hud: {
    display: 'flex', gap: 18, padding: '8px 14px', borderRadius: 8,
    background: '#1b141f', border: '1px solid #3a2a42',
    fontFamily: 'ui-monospace, monospace', fontSize: 13,
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 16, marginTop: 24,
  },
  pad: {
    background: '#171020', border: '1px solid #33253c', borderRadius: 12,
    padding: 18, minHeight: 190,
  },
  h3: { margin: '0 0 6px', fontSize: 16 },
  note: { margin: '0 0 14px', fontSize: 13, color: '#a798b0' },
  button: {
    padding: '12px 20px', fontSize: 15, borderRadius: 8, cursor: 'pointer',
    border: '1px solid #6a4d7a', background: '#2a1c33', color: '#f2ecef',
  },
  count: { marginTop: 10, fontFamily: 'ui-monospace, monospace', color: '#e08aa8' },
  scroller: {
    height: 120, overflowY: 'auto', border: '1px solid #33253c',
    borderRadius: 8, padding: 8, margin: 0, listStyle: 'none',
  },
  shot: {
    width: '100%', minHeight: 110, border: '1px dashed #4a3555', borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#7d6d87', fontSize: 13, overflow: 'hidden',
  },
};

export default function App() {
  const [counts, setCounts] = useState({ click: 0, hover: 0, ctx: 0, region: 0 });
  const [mode, setMode] = useState('—');
  const [hands, setHands] = useState(0);
  const [renderFps, setRenderFps] = useState(0);
  const [inferFps, setInferFps] = useState(0);
  const [regionPhase, setRegionPhase] = useState(null);
  const [crop, setCrop] = useState(null);
  const [log, setLog] = useState([]);

  const engineRef = useRef(null);
  const dragRef = useRef(null);
  const [dragPct, setDragPct] = useState(0);

  const say = useCallback((line) => {
    setLog((prev) => [`${new Date().toLocaleTimeString()}  ${line}`, ...prev].slice(0, 8));
  }, []);

  const bump = (key) => setCounts((c) => ({ ...c, [key]: c[key] + 1 }));

  // The engine arrives here, which is the only way to read `inferenceCount`.
  // Render and inference rates are counted separately on purpose: they share a
  // thread and trade against each other, so one averaged number would hide the
  // thing worth seeing.
  const onStart = useCallback((engine) => {
    engineRef.current = engine;
    // Reachable from the console. This is a debugging harness; being able to
    // poke the engine by hand is the point of it.
    window.__engine = engine;
    say('camera started — engine received from onStart');
    let frames = 0;
    let lastInfer = engine.inferenceCount;
    let clock = performance.now();
    const tick = (now) => {
      if (engineRef.current !== engine) return;
      frames += 1;
      if (now - clock >= 1000) {
        setRenderFps(frames);
        setInferFps(engine.inferenceCount - lastInfer);
        lastInfer = engine.inferenceCount;
        frames = 0;
        clock = now;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [say]);

  const onStop = useCallback(() => {
    engineRef.current = null;
    setRenderFps(0);
    setInferFps(0);
    setMode('—');
    say('camera stopped');
  }, [say]);

  const onState = useCallback((state) => {
    if (!state) { setMode('no hand'); setHands(0); setRegionPhase(null); return; }
    setMode(state.modifier ? `${state.mode} + modifier` : state.mode);
    setHands(state.hands || 1);
    setRegionPhase(state.region ? state.region.phase : null);
    if (state.region && state.region.rejected) say(`region discarded: ${state.region.rejected}`);
  }, [say]);

  // The whole point of the harness: the crop goes through the package's own
  // helper, so the coordinate and colour corrections are the shipped ones
  // rather than a copy that happens to live in the demo page.
  const onRegionSelect = useCallback(async (rect) => {
    bump('region');
    say(`region ${Math.round(rect.width)}x${Math.round(rect.height)} at ${Math.round(rect.left)},${Math.round(rect.top)}`);
    try {
      // No ignoreElements needed: cropRegion already leaves AirCursor's own
      // cursor and preview out. That default exists because writing this line
      // the obvious way — matching on el.id — silently kept them in.
      const canvas = await cropRegion(html2canvas, rect);
      setCrop(canvas.toDataURL('image/png'));
      say('crop rendered');
    } catch (error) {
      say(`crop failed: ${error.message}`);
      // eslint-disable-next-line no-console
      console.error('[debug] crop failed', error);
    }
  }, [say]);

  // Fire the capture path with a rectangle taken from the viewport, so the
  // crop can be checked without a camera and without making the gesture. The
  // coordinate bug this exists to catch only appears away from the top of the
  // page, so scroll down before pressing it.
  const captureViewportSample = useCallback(() => {
    const rect = {
      left: Math.round(window.innerWidth * 0.15),
      top: Math.round(window.innerHeight * 0.25),
      width: Math.round(window.innerWidth * 0.5),
      height: Math.round(window.innerHeight * 0.35),
    };
    say(`manual capture at scrollY ${Math.round(window.scrollY)}`);
    onRegionSelect(rect);
  }, [onRegionSelect, say]);

  const startDrag = (e) => {
    const track = dragRef.current;
    if (!track) return;
    track.setPointerCapture(e.pointerId);
    const move = (ev) => {
      const box = track.getBoundingClientRect();
      setDragPct(Math.round(Math.max(0, Math.min(1, (ev.clientX - box.left) / box.width)) * 100));
    };
    const up = () => {
      track.removeEventListener('pointermove', move);
      track.removeEventListener('pointerup', up);
    };
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', up);
    move(e);
  };

  return (
    <div style={styles.page}>
      <h1 style={{ margin: '0 0 6px', fontSize: 22 }}>air-cursor — installed package harness</h1>
      <p style={{ ...styles.note, marginBottom: 18 }}>
        Imported from <code>air-cursor</code> in node_modules, installed from a packed
        tarball. Nothing here reaches into the source tree.
      </p>

      <div style={styles.bar}>
        <AirCursor
          showPreview
          previewPosition="bottom-right"
          regionSelectEnabled
          activeRegion={DEFAULT_ACTIVE_REGION}
          inferenceFps={30}
          onStart={onStart}
          onStop={onStop}
          onState={onState}
          onRegionSelect={onRegionSelect}
          onError={(e) => say(`error: ${e.message}`)}
        />
        <div style={styles.hud}>
          <span>mode <b>{mode}</b></span>
          <span>render <b>{renderFps}</b></span>
          <span>infer <b>{inferFps}</b></span>
          <span>hands <b>{hands}</b></span>
          <span>region <b>{regionPhase || '—'}</b></span>
        </div>
      </div>

      <div style={styles.grid}>
        <div style={styles.pad}>
          <h3 style={styles.h3}>Plain div</h3>
          <p style={styles.note}>Not a button or a link — just an onClick handler.</p>
          <div
            style={{ ...styles.button, display: 'inline-block' }}
            onClick={() => bump('click')}
          >
            Click me
          </div>
          <div style={styles.count}>{counts.click}</div>
        </div>

        <div style={styles.pad}>
          <h3 style={styles.h3}>Hover</h3>
          <p style={styles.note}>pointerenter / pointerleave, as menus rely on.</p>
          <div style={styles.button} onPointerEnter={() => bump('hover')}>Point at me</div>
          <div style={styles.count}>{counts.hover}</div>
        </div>

        <div style={styles.pad}>
          <h3 style={styles.h3}>Right click</h3>
          <p style={styles.note}>Off-hand fist, then click, sends contextmenu.</p>
          <div
            style={styles.button}
            onContextMenu={(e) => { e.preventDefault(); bump('ctx'); }}
          >
            Right click me
          </div>
          <div style={styles.count}>{counts.ctx}</div>
        </div>

        <div style={styles.pad}>
          <h3 style={styles.h3}>Drag</h3>
          <p style={styles.note}>pointerdown → pointermove → pointerup, captured.</p>
          <div
            ref={dragRef}
            onPointerDown={startDrag}
            style={{ height: 40, borderRadius: 8, background: '#241a2c', border: '1px solid #3f2d4b', position: 'relative', touchAction: 'none' }}
          >
            <div style={{ position: 'absolute', inset: '4px auto 4px 4px', width: 34, borderRadius: 6, background: '#e0648c', transform: `translateX(${dragPct * 2}px)` }} />
          </div>
          <div style={styles.count}>{dragPct}%</div>
        </div>

        <div style={styles.pad}>
          <h3 style={styles.h3}>Nested scroll</h3>
          <p style={styles.note}>Grab inside and this panel scrolls, not the page.</p>
          <ul style={styles.scroller}>
            {Array.from({ length: 14 }, (_, i) => (
              <li key={i} style={{ padding: '6px 4px', borderBottom: '1px solid #241a2c' }}>row {i + 1}</li>
            ))}
          </ul>
        </div>

        <div style={styles.pad}>
          <h3 style={styles.h3}>Region capture</h3>
          <p style={styles.note}>
            Pinch with both hands to frame, open them, then tap once with each.
            Cropped by the package&apos;s <code>cropRegion</code>.
          </p>
          <div style={styles.shot}>
            {crop
              ? <img src={crop} alt="last captured region" style={{ maxWidth: '100%', display: 'block' }} />
              : 'nothing captured yet'}
          </div>
          <button
            type="button"
            style={{ ...styles.button, marginTop: 10, fontSize: 13, padding: '8px 14px' }}
            onClick={captureViewportSample}
          >
            Capture without a camera
          </button>
          <div style={styles.count}>{counts.region}</div>
        </div>
      </div>

      <div style={{ ...styles.pad, marginTop: 24 }}>
        <h3 style={styles.h3}>Log</h3>
        <pre style={{ margin: 0, fontSize: 12, color: '#a798b0', whiteSpace: 'pre-wrap' }}>
          {log.length ? log.join('\n') : 'nothing yet'}
        </pre>
      </div>

      <p style={{ ...styles.note, marginTop: 32 }}>
        The page is deliberately taller than the viewport: scroll down before framing a
        region, so the crop is checked somewhere other than the top of the document.
      </p>
    </div>
  );
}
