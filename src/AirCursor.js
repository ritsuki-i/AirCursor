// src/AirCursor.jsx
//
// React wrapper. All behaviour lives in ./core; this file owns the DOM, the
// consent step, and the camera preview.
//
// Note there is no UI-framework dependency here. Version 1 pulled in the whole
// of @mui/material for one button and two checkboxes, which every consumer then
// had to install.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';

import { AirCursorEngine } from './core/engine.js';
import { HOVER_CLASS } from './core/pointer.js';

const STORAGE_KEY = 'aircursor:active';

export const enLabels = {
  start: 'Enable hand control',
  dialogTitle: 'Control this page with your hand',
  grab: 'Pinch thumb and index finger to grab the page, then move your hand to scroll.',
  aim: 'Hold index and middle finger together to move the pointer.',
  click: 'While pointing, bring your thumb in to click. Hold it to drag.',
  rightClick: 'Make a fist with your other hand to turn the next click into a right click.',
  confirm: 'I have read the instructions',
  showPreview: 'Show the camera preview',
  previewPosition: 'Preview position',
  positions: {
    'top-left': 'Top left',
    'top-right': 'Top right',
    'bottom-left': 'Bottom left',
    'bottom-right': 'Bottom right',
  },
  begin: 'Start',
  close: 'Close',
  stop: 'Stop hand control',
  cameraError: 'The camera could not be started. Check that this page is allowed to use the camera.',
};

export const jaLabels = {
  start: 'ハンドトラッキングを使用する',
  dialogTitle: '手でこのページを操作する',
  grab: '親指と人差し指をつまむとページを掴めます。そのまま手を動かすとスクロールします。',
  aim: '人差し指と中指を合わせるとポインタが動きます。',
  click: 'ポインタを出したまま親指を合わせるとクリックします。保持するとドラッグになります。',
  rightClick: '反対の手を握ると、次のクリックが右クリックになります。',
  confirm: '操作説明を確認しました',
  showPreview: 'カメラ映像を表示する',
  previewPosition: 'カメラ映像の位置',
  positions: {
    'top-left': '左上',
    'top-right': '右上',
    'bottom-left': '左下',
    'bottom-right': '右下',
  },
  begin: '開始',
  close: '閉じる',
  stop: 'ハンドトラッキングを停止',
  cameraError: 'カメラを開始できませんでした。このページにカメラの使用が許可されているか確認してください。',
};

const CURSOR_STYLES = `
.aircursor-root { position: fixed; inset: 0; pointer-events: none; z-index: 2147483000; }
.aircursor-cursor {
  position: fixed; top: 0; left: 0;
  width: 26px; height: 26px;
  border-radius: 50%;
  border: 2px solid rgba(248, 250, 252, 0.9);
  background: rgba(15, 23, 42, 0.18);
  box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.35), 0 2px 10px rgba(15, 23, 42, 0.3);
  pointer-events: none;
  opacity: 0;
  will-change: transform, opacity;
  transition: width 90ms ease, height 90ms ease, background-color 90ms ease, border-color 90ms ease;
}
.aircursor-cursor::after {
  content: ''; position: absolute; top: 50%; left: 50%;
  width: 4px; height: 4px; margin: -2px 0 0 -2px;
  border-radius: 50%; background: rgba(248, 250, 252, 0.95);
}
.aircursor-cursor[data-mode="aim"]   { width: 20px; height: 20px; border-color: #38bdf8; background: rgba(56, 189, 248, 0.22); }
.aircursor-cursor[data-mode="press"] { width: 15px; height: 15px; border-color: #facc15; background: rgba(250, 204, 21, 0.75); }
.aircursor-cursor[data-mode="grab"]  { width: 30px; height: 30px; border-color: #fb7185; background: rgba(251, 113, 133, 0.3); }
.aircursor-cursor[data-modifier="on"] { box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.75), 0 2px 10px rgba(15, 23, 42, 0.3); }
.aircursor-preview {
  position: fixed; width: 240px; height: 135px; border-radius: 10px; overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.5); background: #0f172a;
  pointer-events: none; z-index: 2147483001;
}
.aircursor-preview > * { position: absolute; inset: 0; width: 100%; height: 100%; transform: scaleX(-1); }
@media (prefers-reduced-motion: reduce) { .aircursor-cursor { transition: none; } }
`;

const DIALOG_STYLES = `
.aircursor-backdrop {
  position: fixed; inset: 0; background: rgba(2, 6, 23, 0.6);
  display: flex; align-items: center; justify-content: center;
  z-index: 2147483002; padding: 16px;
}
.aircursor-dialog {
  background: #ffffff; color: #0f172a; width: min(520px, 100%); max-height: 86vh; overflow-y: auto;
  border-radius: 12px; padding: 26px 28px; box-shadow: 0 24px 60px rgba(2, 6, 23, 0.4);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 15px; line-height: 1.7;
  position: relative;
}
.aircursor-dialog h2 { margin: 0 0 14px; font-size: 19px; line-height: 1.35; }
.aircursor-dialog ul { margin: 0 0 20px; padding-left: 20px; }
.aircursor-dialog li { margin-bottom: 7px; }
.aircursor-dialog label { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; cursor: pointer; }
.aircursor-dialog fieldset { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin: 0 0 18px; }
.aircursor-dialog legend { padding: 0 6px; font-size: 13px; color: #475569; }
.aircursor-btn {
  font: inherit; font-weight: 600; padding: 9px 20px; border-radius: 8px; border: 1px solid transparent;
  background: #0f172a; color: #f8fafc; cursor: pointer;
}
.aircursor-btn:hover { background: #1e293b; }
.aircursor-btn:disabled { background: #cbd5e1; color: #64748b; cursor: not-allowed; }
.aircursor-btn:focus-visible { outline: 3px solid #38bdf8; outline-offset: 2px; }
.aircursor-close {
  position: absolute; top: 10px; right: 12px; background: none; border: none; font-size: 26px;
  line-height: 1; cursor: pointer; color: #64748b; padding: 4px 8px; border-radius: 6px;
}
.aircursor-close:focus-visible { outline: 3px solid #38bdf8; outline-offset: 2px; }
.aircursor-error { color: #b91c1c; margin: 8px 0 0; }
@media (prefers-color-scheme: dark) {
  .aircursor-dialog { background: #0f172a; color: #e2e8f0; }
  .aircursor-dialog fieldset { border-color: #1e293b; }
  .aircursor-dialog legend { color: #94a3b8; }
  .aircursor-btn { background: #38bdf8; color: #04202e; }
  .aircursor-btn:hover { background: #7dd3fc; }
  .aircursor-error { color: #fca5a5; }
}
`;

const POSITION_STYLE = {
  'top-left': { top: '12px', left: '12px' },
  'top-right': { top: '12px', right: '12px' },
  'bottom-left': { bottom: '12px', left: '12px' },
  'bottom-right': { bottom: '12px', right: '12px' },
};

function useInjectedStyles(css, id) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById(id)) return;
    const tag = document.createElement('style');
    tag.id = id;
    tag.textContent = css;
    document.head.appendChild(tag);
  }, [css, id]);
}

const AirCursor = ({
  buttonText,
  labels: labelsProp,
  dominantHand = 'right',
  modifierEnabled = true,
  regionSelectEnabled = true,
  showPreview: showPreviewDefault = false,
  previewPosition: previewPositionDefault = 'bottom-right',
  skipConsent = false,
  autoStart = false,
  rememberSession = true,
  mediapipeBasePath,
  activeRegion,
  inferenceFps,
  filter,
  scroll,
  region,
  thresholds,
  hands,
  camera,
  pointer,
  onStart,
  onStop,
  onState,
  onRegionSelect,
  onError,
}) => {
  const labels = useMemo(() => ({ ...enLabels, ...(labelsProp || {}) }), [labelsProp]);
  const startLabel = buttonText || labels.start;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [active, setActive] = useState(false);
  const [confirmed, setConfirmed] = useState(skipConsent);
  const [showPreview, setShowPreview] = useState(showPreviewDefault);
  const [previewPosition, setPreviewPosition] = useState(previewPositionDefault);
  const [error, setError] = useState(null);
  const [mounted, setMounted] = useState(false);

  const videoRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const cursorRef = useRef(null);
  const engineRef = useRef(null);
  const onStateRef = useRef(onState);
  const onRegionSelectRef = useRef(onRegionSelect);
  const onErrorRef = useRef(onError);

  onStateRef.current = onState;
  onRegionSelectRef.current = onRegionSelect;
  onErrorRef.current = onError;

  useInjectedStyles(CURSOR_STYLES, 'aircursor-cursor-styles');
  useInjectedStyles(DIALOG_STYLES, 'aircursor-dialog-styles');

  useEffect(() => {
    setMounted(true);
    if (autoStart) {
      setActive(true);
      return;
    }
    if (rememberSession && typeof sessionStorage !== 'undefined') {
      try {
        if (sessionStorage.getItem(STORAGE_KEY) === '1') setActive(true);
      } catch (e) {
        // Private mode or a blocked storage partition. Not worth failing over.
      }
    }
  }, [autoStart, rememberSession]);

  // Engine lifecycle. Options are read once when tracking starts: restarting on
  // every prop change would tear down the camera mid-use.
  useEffect(() => {
    if (!active || !mounted) return undefined;
    let cancelled = false;

    const engine = new AirCursorEngine({
      video: videoRef.current,
      previewCanvas: previewCanvasRef.current,
      cursorElement: cursorRef.current,
      dominantHand,
      modifierEnabled,
      regionSelectEnabled,
      // Unset props arrive here as `undefined` and are dropped by the engine
      // before they reach its defaults, so they can be forwarded plainly.
      // `activeRegion: null` is not undefined and still means "no region".
      mediapipeBasePath,
      activeRegion,
      inferenceFps,
      filter,
      scroll,
      region,
      thresholds,
      hands,
      camera,
      pointer,
      onState: (state) => {
        if (onStateRef.current) onStateRef.current(state);
      },
      onRegionSelect: (rect) => {
        if (onRegionSelectRef.current) onRegionSelectRef.current(rect);
      },
      onError: (err) => {
        if (onErrorRef.current) onErrorRef.current(err);
      },
    });
    engineRef.current = engine;

    engine
      .start()
      .then(() => {
        if (cancelled) return;
        setError(null);
        // The engine is handed over so an application can read what only it
        // knows — `inferenceCount` above all, which is the number that says
        // whether a stutter belongs to the tracker or to the page.
        if (onStart) onStart(engine);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(labels.cameraError);
        setActive(false);
        if (onErrorRef.current) onErrorRef.current(err);
      });

    return () => {
      cancelled = true;
      engine.stop();
      engineRef.current = null;
      if (typeof document !== 'undefined') {
        document
          .querySelectorAll('.' + HOVER_CLASS)
          .forEach((el) => el.classList.remove(HOVER_CLASS));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, mounted]);

  useEffect(() => {
    if (!rememberSession || typeof sessionStorage === 'undefined') return;
    try {
      if (active) sessionStorage.setItem(STORAGE_KEY, '1');
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* ignore */
    }
  }, [active, rememberSession]);

  const handleStartRequest = useCallback(() => {
    setError(null);
    if (skipConsent) setActive(true);
    else setDialogOpen(true);
  }, [skipConsent]);

  const handleBegin = useCallback((event) => {
    event.preventDefault();
    setDialogOpen(false);
    setActive(true);
  }, []);

  const handleStop = useCallback(() => {
    setActive(false);
    if (onStop) onStop();
  }, [onStop]);

  const previewStyle = {
    ...POSITION_STYLE[previewPosition],
    display: showPreview ? 'block' : 'none',
  };

  const overlay =
    mounted && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div className="aircursor-preview" style={previewStyle} aria-hidden="true">
              <video ref={videoRef} autoPlay playsInline muted />
              <canvas ref={previewCanvasRef} width={240} height={135} />
            </div>
            <div className="aircursor-root" aria-hidden="true">
              <div ref={cursorRef} className="aircursor-cursor" data-mode="idle" data-modifier="off" />
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        className="aircursor-btn"
        onClick={active ? handleStop : handleStartRequest}
      >
        {active ? labels.stop : startLabel}
      </button>

      {error && (
        <p className="aircursor-error" role="alert">
          {error}
        </p>
      )}

      {dialogOpen && (
        <div
          className="aircursor-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={labels.dialogTitle}
        >
          <div className="aircursor-dialog">
            <button
              type="button"
              className="aircursor-close"
              onClick={() => setDialogOpen(false)}
              aria-label={labels.close}
            >
              ×
            </button>
            <h2>{labels.dialogTitle}</h2>
            <ul>
              <li>{labels.grab}</li>
              <li>{labels.aim}</li>
              <li>{labels.click}</li>
              {modifierEnabled && <li>{labels.rightClick}</li>}
            </ul>

            <form onSubmit={handleBegin}>
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                {labels.confirm}
              </label>

              <label>
                <input
                  type="checkbox"
                  checked={showPreview}
                  onChange={(e) => setShowPreview(e.target.checked)}
                />
                {labels.showPreview}
              </label>

              {showPreview && (
                <fieldset>
                  <legend>{labels.previewPosition}</legend>
                  {Object.keys(POSITION_STYLE).map((key) => (
                    <label key={key}>
                      <input
                        type="radio"
                        name="aircursor-preview-position"
                        value={key}
                        checked={previewPosition === key}
                        onChange={(e) => setPreviewPosition(e.target.value)}
                      />
                      {labels.positions[key]}
                    </label>
                  ))}
                </fieldset>
              )}

              <button type="submit" className="aircursor-btn" disabled={!confirmed}>
                {labels.begin}
              </button>
            </form>
          </div>
        </div>
      )}

      {overlay}
    </>
  );
};

AirCursor.propTypes = {
  /** @deprecated pass `labels={{ start: '...' }}` instead */
  buttonText: PropTypes.string,
  labels: PropTypes.object,
  dominantHand: PropTypes.oneOf(['left', 'right']),
  modifierEnabled: PropTypes.bool,
  regionSelectEnabled: PropTypes.bool,
  region: PropTypes.object,
  onRegionSelect: PropTypes.func,
  showPreview: PropTypes.bool,
  previewPosition: PropTypes.oneOf(['top-left', 'top-right', 'bottom-left', 'bottom-right']),
  skipConsent: PropTypes.bool,
  autoStart: PropTypes.bool,
  rememberSession: PropTypes.bool,
  mediapipeBasePath: PropTypes.string,
  /** Part of the camera frame mapped to the viewport; null for the full frame. */
  activeRegion: PropTypes.oneOfType([PropTypes.object, PropTypes.oneOf([null])]),
  /** Cap on tracking rate. It shares the main thread with your rendering. */
  inferenceFps: PropTypes.number,
  pointer: PropTypes.object,
  filter: PropTypes.object,
  scroll: PropTypes.object,
  thresholds: PropTypes.object,
  hands: PropTypes.object,
  camera: PropTypes.object,
  onStart: PropTypes.func,
  onStop: PropTypes.func,
  onState: PropTypes.func,
  onError: PropTypes.func,
};

export default AirCursor;
