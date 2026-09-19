// docs/assets/demo.js
//
// The page controller.
//
// The published npm engine owns recognition, cursor movement and event dispatch.
// The galaxy owns a separate worker; this file only connects product UI.

import { GalaxyField } from './galaxy.js';
import { AirCursorEngine, cropRegion, DEMO_PACKAGE } from './aircursor-core.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- particles

const canvas = document.getElementById('spellfield');
const field = new GalaxyField(canvas, { reducedMotion: prefersReducedMotion });
if (!field.supported) document.body.classList.add('no-webgl');


let lastFrame = performance.now();
let fieldActive = true;
let fieldRect = canvas.parentElement.getBoundingClientRect();

const hero = document.querySelector('.hero');
hero.dataset.package = `${DEMO_PACKAGE.name}@${DEMO_PACKAGE.version}`;
function updateFieldVisibility() {
  const rect = hero.getBoundingClientRect();
  fieldRect = rect;
  const next = rect.bottom > 0 && rect.top < window.innerHeight;
  if (fieldActive && !next) field.setPointer(null);
  fieldActive = next;
  field.setVisible(next && !document.hidden);
}
window.addEventListener('scroll', updateFieldVisibility, { passive: true });
updateFieldVisibility();

// Before the camera starts, the field follows the mouse. This is not decoration
// for its own sake: it is the same readout the hand will drive, so the visitor
// already understands what they are looking at when tracking begins.
// True only while a hand is actually in frame. The mouse keeps control of the
// field at every other moment, including while the camera is on but the user
// has their hands down — otherwise the page would freeze between gestures.
let handInFrame = false;

function pointerFromMouse(event) {
  if (handInFrame || !fieldActive) return;
  field.setPointer({ x: event.clientX - fieldRect.left, y: event.clientY - fieldRect.top });
}
window.addEventListener('pointermove', pointerFromMouse, { passive: true });
hero.addEventListener('pointerleave', () => { if (!handInFrame) field.setPointer(null); });
document.getElementById('galaxy-pause').addEventListener('click', event => {
  field.paused = !field.paused;
  event.currentTarget.setAttribute('aria-pressed', String(field.paused));
  updateMotionLabel();
});
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => field.setReducedMotion(event.matches));
document.addEventListener('visibilitychange', () => {
  lastFrame = performance.now();
  field.setVisible(fieldActive && !document.hidden);
  if (document.hidden && engine) stopTracking();
});

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    field.resize();
    updateFieldVisibility();
  }, 150);
});

// ------------------------------------------------------------ hand tracking

const els = {
  cast: document.getElementById('cast'),
  language: document.getElementById('language-toggle'),
  status: document.getElementById('status'),
  hud: document.getElementById('hud'),
  hudMode: document.getElementById('hud-mode'),
  hudFps: document.getElementById('hud-fps'),
  hudInfer: document.getElementById('hud-infer'),
  hudInferMs: document.getElementById('hud-infer-ms'),
  hudHands: document.getElementById('hud-hands'),
  video: document.getElementById('camera'),
  cursor: document.getElementById('cursor'),
  preview: document.getElementById('preview'),
  previewSkeleton: document.getElementById('preview-skeleton'),
  regionBox: document.getElementById('region-box'),
  regionHint: document.getElementById('region-hint'),
  shotFrame: document.getElementById('shot-frame'),
  shotImg: document.getElementById('shot-img'),
  shotPlaceholder: document.getElementById('shot-placeholder'),
  shotSave: document.getElementById('shot-save'),
  regionToast: document.getElementById('region-toast'),
  regionToastImg: document.getElementById('region-toast-img'),
  regionToastText: document.getElementById('region-toast-text'),
};

const statusTranslations = new Map([
  ['Move your mouse to stir the field. Enable hand tracking to take control.', 'マウスで粒子を揺らせます。ハンド操作を開始すると手の操作へ切り替わります。'],
  ['Loading the hand model…', 'ハンドモデルを読み込んでいます…'],
  ['The hand model could not be downloaded. Check your network and try again.', 'ハンドモデルを取得できませんでした。ネットワークを確認して再度お試しください。'],
  ['Waiting for camera permission…', 'カメラの許可を待っています…'],
  ['The camera could not be started. This page needs camera permission and an https connection.', 'カメラを開始できませんでした。カメラの許可とHTTPS接続が必要です。'],
  ['Hold your index and middle fingers together to move the pointer.', '人差し指と中指を合わせるとポインターを動かせます。'],
  ['Stopped. The camera has been released.', '停止しました。カメラを解放しました。'],
  ['The crop could not be rendered.', '範囲を画像化できませんでした。'],
]);
const pageTranslations = [
  ['#try > .eyebrow', 'プロダクト導入を想定したデモ'],
  ['#try > h2', '既存のインターフェースを、そのまま非接触に。'],
  ['#try > .lede', '各パネルは一般的なWebプロダクトと同じイベントを受け取ります。専用UIへ作り直す必要はありません。開始ボタンから、導入後の操作感をその場で確認できます。'],
  ['#try .pad:nth-child(1) h3', '通常のdiv'],
  ['#try .pad:nth-child(1) p', 'ボタンでもリンクでもない、単なる <code>&lt;div onClick&gt;</code> も操作できます。'],
  ['#t-div', 'クリック'],
  ['#try .pad:nth-child(2) h3', 'ホバー'],
  ['#try .pad:nth-child(2) p', 'ツールチップやメニューが利用する <code>pointerenter</code> と <code>pointerleave</code> を送出します。'],
  ['#t-hover', 'ここをポイント'],
  ['#try .pad:nth-child(3) h3', '右クリック'],
  ['#try .pad:nth-child(3) p', '反対の手を握ってからクリックすると、<code>contextmenu</code> を送出します。'],
  ['#t-ctx', '右クリック'],
  ['#ctx-menu div:nth-child(1)', 'エフェクトを確認'],
  ['#ctx-menu div:nth-child(2)', '操作をコピー'],
  ['#try .pad:nth-child(4) h3', 'ドラッグ'],
  ['#try .pad:nth-child(4) p', 'つまんだまま動かすと、<code>pointerdown</code> → <code>pointermove</code> → <code>pointerup</code> を送出します。'],
  ['#try .pad:nth-child(5) h3', '領域内スクロール'],
  ['#try .pad:nth-child(5) p', 'パネル内をつかむと、ページではなくパネルだけがスクロールします。'],
  ['#how > .eyebrow', '既存のWeb技術に対応'],
  ['#how > h2', '標準ポインターイベント。独自の操作レイヤーは不要。'],
  ['#how > .lede', '多くのジェスチャーライブラリは <code>elementFromPoint</code> で要素を探し、<code>click</code> を1回送るだけです。AirCursorは実際のポインティングデバイスと同じイベント列を生成するため、Radix、MUI、ポインターベースのドラッグライブラリでも動作します。'],
  ['#how thead th:nth-child(1)', '操作'], ['#how thead th:nth-child(2)', '送出イベント'],
  ['#how tbody tr:nth-child(1) td:first-child', 'ホバー'], ['#how tbody tr:nth-child(2) td:first-child', '移動'],
  ['#how tbody tr:nth-child(3) td:first-child', 'クリック'],
  ['#how tbody tr:nth-child(4) td:first-child', '右クリック'], ['#how tbody tr:nth-child(5) td:first-child', 'ドラッグ'],
  ['#how tbody tr:nth-child(5) td:nth-child(2)', '<code>pointerdown</code> → <code>pointermove</code>… → <code>pointerup</code>。押下対象へ送出し続けます'],
  ['#how .two-col > div:nth-child(1) h3', '狙えるほど安定した動き'],
  ['#how .two-col > div:nth-child(1) p:nth-of-type(1)', 'ポインター位置にはOne Euroフィルターを適用し、静止中の揺れを抑えながら素早い動きには遅れず追従します。ジェスチャー判定には開始・終了で別のしきい値と保持時間を設け、境界付近での誤作動を防ぎます。'],
  ['#how .two-col > div:nth-child(1) p:nth-of-type(2)', 'すべてのしきい値は、手首から中指の付け根までを基準とする<strong>手単位</strong>で計測します。カメラとの距離が変わっても同じジェスチャーとして認識されます。'],
  ['#how .two-col > div:nth-child(2) h3', '追跡が不安定でも滑らかに'],
  ['#how .two-col > div:nth-child(2) p:nth-of-type(1)', '推論と操作処理は分離されています。MediaPipeの処理速度が変動しても、スクロール、カーソル移動、物理演算は <code>requestAnimationFrame</code> で滑らかに動作します。'],
  ['#how .two-col > div:nth-child(2) p:nth-of-type(2)', '対応ブラウザでは背景の粒子をWorkerで描画し、カメラ動作中は描画負荷を抑えて操作へ処理時間を割り当てます。'],
  ['#gestures .eyebrow', 'ジェスチャー'], ['#gestures h2', '5つの操作。2つの手。'],
  ['#gestures thead th:nth-child(1)', 'ジェスチャー'], ['#gestures thead th:nth-child(2)', '操作'],
  ['#gestures tbody tr:nth-child(1) td:nth-child(1)', '人差し指と中指の先を合わせる'], ['#gestures tbody tr:nth-child(1) td:nth-child(2)', '手に合わせてポインターを移動'],
  ['#gestures tbody tr:nth-child(2) td:nth-child(1)', 'そのまま親指を合わせる'], ['#gestures tbody tr:nth-child(2) td:nth-child(2)', 'クリック。保持するとドラッグ'],
  ['#gestures tbody tr:nth-child(3) td:nth-child(1)', '他の指を開き、親指と人差し指をつまむ'], ['#gestures tbody tr:nth-child(3) td:nth-child(2)', 'ページをつかんでスクロール'],
  ['#gestures tbody tr:nth-child(4) td:nth-child(1)', '反対の手を握る'], ['#gestures tbody tr:nth-child(4) td:nth-child(2)', '次のクリックを右クリックへ変更'],
  ['#install > .eyebrow', 'プロダクトへ導入'], ['#install > h2', 'ひとつの導入で、新しい操作。'],
  ['#install .two-col > div:nth-child(1) > .lede', 'コンポーネントが開始ボタン、同意手順、カメラプレビューを表示します。許可後は、既存ページを変更せず手で操作できます。'],
  ['#install .two-col > div:nth-child(2) > .lede', 'エンジンはReactに依存しないため、JavaScript、Vue、Svelteでも利用できます。独自の操作割り当てに使える各モジュールも個別に公開しています。'],
  ['#limits .eyebrow', '既知の制約'], ['#limits h2', '合成ポインターでできないこと。'],
  ['#limits > .lede', '以下は実装不足ではなく、ブラウザプラットフォームの制約です。'],
  ['#limits li:nth-child(1)', '<strong>ダブルクリックは手では実行できません。</strong> クリックは「親指がたまたま通過しただけ」を弾くために一定時間の保持を必要とするため、その2回分がブラウザのダブルクリック受付時間に収まりません。ダブルクリックが必要な操作は単クリックに割り当ててください。'],
  ['#limits li:nth-child(2)', '<strong>ユーザー操作として認証されません。</strong> 合成イベントは <code>isTrusted: false</code> のため、クリップボード読み取り、<code>requestFullscreen()</code>、<code>window.open()</code> など実操作が必要な機能は利用できません。'],
  ['#limits li:nth-child(3)', '<strong>CSSの <code>:hover</code> は反応しません。</strong> JavaScriptのホバーイベントは動作します。スタイルにはAirCursorが付与する <code>aircursor-hover</code> クラスを利用してください。'],
  ['#limits li:nth-child(4)', '<strong>HTML5標準のドラッグ＆ドロップは開始できません。</strong> ポインターイベントを使うドラッグライブラリは動作します。'],
  ['#limits li:nth-child(5)', '<strong>標準設定ではモデルをCDNから取得します。</strong> オフライン環境では <code>mediapipeBasePath</code> にセルフホストしたファイルを指定してください。'],
  ['#cite .eyebrow', '引用'], ['#cite h2', '作品や研究で利用しますか？'],
  ['#cite > .lede', 'AirCursorはMITライセンスで自由に利用できます。製品、論文、公開プロジェクトで使用する場合は、引用していただけると幸いです。'],
  ['#try .pad:nth-child(6) h3', '範囲キャプチャ'],
  ['#shot-save', 'PNGで保存'],
  ['#try .pad:nth-child(6) p', '<em>両手</em>でつまんで範囲を囲み、手を開いて、両手でそれぞれ1回タップします。確定せず待つと解除されます。切り取られた画像がここに表示され、結果は手元にも通知されます。'],
  ['#shot-placeholder', 'まだ範囲を囲んでいません'],
  ['.stage-pointer .tutorial-title', 'ポインター'],
  ['.stage-click .tutorial-title', 'クリック'],
];
const spellLabels = {
  en: ['Levitate the cursor', 'Pinch to select', 'Grab the page', 'Release to fling', 'Fist for the modifier', 'Hover without touching', 'Drag across the track', 'Right click with the off hand', 'Scroll a nested panel', 'No mouse required', 'No hardware required', 'Nothing leaves the device'],
  ja: ['カーソルを浮かせる', 'つまんで選択', 'ページをつかむ', '離してスクロール', '握りこぶしで修飾', '触れずにホバー', 'トラックをドラッグ', '反対の手で右クリック', 'パネル内をスクロール', 'マウス不要', '専用機器不要', '映像は端末の外へ出ません'],
};

function renderSpellList() {
  const spellList = document.getElementById('t-scroll');
  if (!spellList) return;
  const labels = spellLabels[currentLanguage];
  spellList.innerHTML = labels.map((label, i) => `<li><span>${String(i + 1).padStart(2, '0')}</span>${label}</li>`).join('');
}
// English is the indexable default; remember only an explicit visitor choice.
let currentLanguage = 'en';
try { if (localStorage.getItem('aircursor:language') === 'ja') currentLanguage = 'ja'; } catch { /* Storage may be disabled. */ }
let currentStatus = 'Move your mouse to stir the field. Enable hand tracking to take control.';

function applyLanguage() {
  document.documentElement.lang = currentLanguage;
  els.language.textContent = currentLanguage === 'en' ? '日本語' : 'English';
  els.language.setAttribute('aria-label', currentLanguage === 'en' ? '日本語に切り替える' : 'Switch to English');
  els.cast.textContent = running
    ? (currentLanguage === 'ja' ? '停止' : 'Stop')
    : (currentLanguage === 'ja' ? 'ハンド操作を開始' : 'Enable hand tracking');
  els.status.textContent = currentLanguage === 'ja'
    ? (statusTranslations.get(currentStatus) || currentStatus)
    : currentStatus;
  if (document.getElementById('try-result').dataset.clicks) renderTrialResult();
  for (const [selector, japanese] of pageTranslations) {
    const element = document.querySelector(selector);
    if (!element) continue;
    if (!element.dataset.englishHtml) element.dataset.englishHtml = element.innerHTML;
    element.innerHTML = currentLanguage === 'ja' ? japanese : element.dataset.englishHtml;
  }
  const hudLabels = currentLanguage === 'ja'
    ? ['状態 ', '描画 fps ', '推論 fps ', '推論 ms ', '手 ']
    : ['mode ', 'render fps ', 'infer fps ', 'infer ms ', 'hands '];
  els.hud.querySelectorAll(':scope > span').forEach((span, index) => {
    if (span.firstChild && span.firstChild.nodeType === Node.TEXT_NODE) {
      span.firstChild.nodeValue = hudLabels[index];
    }
  });
  document.title = currentLanguage === 'ja'
    ? 'AirCursor — 触れずにWebを操る'
    : 'AirCursor — Hand Tracking for JavaScript & React | Try & Install';
  updateMotionLabel();
  document.querySelectorAll('[data-alt-ja]').forEach(img => {
    if (!img.dataset.altEn) img.dataset.altEn = img.alt;
    img.alt = currentLanguage === 'ja' ? img.dataset.altJa : img.dataset.altEn;
  });
  // Alt text is not innerHTML, so the table above cannot reach it. Left alone
  // it stayed English in Japanese, which is the one piece of the page only a
  // screen reader would ever have noticed.
  els.shotImg.alt = currentLanguage === 'ja'
    ? '両手で最後に囲んだ範囲'
    : 'The area you last framed with both hands';
  renderSpellList();
  updateTryLabel();
}

els.language.addEventListener('click', () => {
  currentLanguage = currentLanguage === 'en' ? 'ja' : 'en';
  try { localStorage.setItem('aircursor:language', currentLanguage); } catch { /* Language switching still works without storage. */ }
  applyLanguage();
});

function updateMotionLabel() {
  document.getElementById('galaxy-pause').textContent = currentLanguage === 'ja'
    ? (field.paused ? '再生' : '一時停止') : (field.paused ? 'Resume motion' : 'Pause motion');
}

document.getElementById('copy-citation').addEventListener('click', async () => {
  const feedback = document.getElementById('citation-feedback');
  try {
    await navigator.clipboard.writeText(document.getElementById('citation').textContent);
    trackConversion('citation_copy', 'cite');
    feedback.textContent = currentLanguage === 'ja' ? 'コピーしました' : 'Copied';
  } catch {
    feedback.textContent = currentLanguage === 'ja' ? '上の引用を選択してコピーしてください' : 'Select and copy the citation above.';
  }
});

let running = false;
let starting = false;
let engine = null;
let previousMode = 'idle';
let frames = 0;
let fpsClock = performance.now();
let lastInferCount = 0;

function setStatus(text, tone = 'info') {
  currentStatus = text;
  els.status.textContent = currentLanguage === 'ja' ? (statusTranslations.get(text) || text) : text;
  els.status.dataset.tone = tone;
}

function setText(node, value) {
  const text = String(value);
  if (node.textContent !== text) node.textContent = text;
}

async function startTracking() {
  if (starting) return;
  if (running) return stopTracking();
  starting = true;
  els.cast.disabled = true;
  document.getElementById('try-camera').disabled = true;
  setStatus('Loading the hand model…');
  setStatus('Waiting for camera permission…');

  const sessionEngine = new AirCursorEngine({
    video: els.video,
    previewCanvas: els.previewSkeleton,
    cursorElement: els.cursor,
    // The hero already has a full-screen particle simulation. Use the light
    // landmark model and a smaller upload here; gesture geometry does not need
    // a high-resolution camera frame.
    inferenceFps: 24,
    mediapipeBasePath: 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240',
    hands: { modelComplexity: 0 },
    camera: { width: 480, height: 360 },
    onState: applyEngineState,
    onRegionSelect: captureRegion,
    onError: () => setStatus('The camera could not be started. This page needs camera permission and an https connection.', 'error'),
  });
  engine = sessionEngine;

  try {
    await sessionEngine.start();
    if (engine !== sessionEngine || document.hidden) { sessionEngine.stop(); return; }
    running = true;
    field.setTracking(true);
    trackConversion('demo_started');
  } catch (error) {
    running = false;
    sessionEngine.stop();
    if (engine !== sessionEngine) return;
    engine = null;
    starting = false;
    els.cast.disabled = false;
    document.getElementById('try-camera').disabled = false;
    setStatus('The camera could not be started. This page needs camera permission and an https connection.', 'error');
    return;
  }

  window.__airCursorDemo = engine;
  starting = false;
  lastInferCount = 0;
  // Camera permission and video initialization can resize the visual viewport.
  // Re-evaluate from real geometry and rebuild the canvas backing buffers.
  updateFieldVisibility();
  field.resize();
  els.cast.disabled = false;
  document.getElementById('try-camera').disabled = false;
  els.cast.textContent = currentLanguage === 'ja' ? '停止' : 'Stop';
  els.hud.hidden = false;
  els.preview.hidden = false;
  document.body.classList.add('tracking');
  setStatus('Hold your index and middle fingers together to move the pointer.', 'ok');
  updateTryLabel();
}

function stopTracking() {
  running = false;
  starting = false;
  els.cast.disabled = false;
  document.getElementById('try-camera').disabled = false;
  field.setTracking(false);
  handInFrame = false;
  document.body.classList.remove('hand-live', 'hand-pressing-control');
  if (engine) engine.stop();
  engine = null;
  window.__airCursorDemo = null;
  previousMode = 'idle';
  els.cast.textContent = currentLanguage === 'ja' ? 'ハンド操作を開始' : 'Enable hand tracking';
  els.hud.hidden = true;
  els.preview.hidden = true;
  els.previewSkeleton.getContext('2d')?.clearRect(0, 0, els.previewSkeleton.width, els.previewSkeleton.height);
  els.cursor.style.opacity = '0';
  els.regionBox.hidden = true;
  els.regionToast.hidden = true;
  field.setAttractors(null);
  document.body.classList.remove('tracking');
  document.getElementById('gesture-feedback').textContent = currentLanguage === 'ja' ? 'カメラは停止しています。' : 'Camera is off.';
  setStatus('Stopped. The camera has been released.');
  updateTryLabel();
}

applyLanguage();

els.cast.addEventListener('click', startTracking);
document.getElementById('try-camera').addEventListener('click', startTracking);

// ------------------------------------------------------------------- loop

function applyEngineState(state) {
  // A Stop click can arrive inside the engine's current event dispatch.
  // Ignore the last callback from that frame after the session is released.
  if (!running) { els.cursor.style.opacity = '0'; return; }
  if (!state) {
    field.setAttractors(null);
    if (handInFrame) document.body.classList.remove('hand-live');
    handInFrame = false;
    setText(els.hudMode, currentLanguage === 'ja' ? '手を検出していません' : 'no hand');
    setText(els.hudHands, '0');
    previousMode = 'idle';
    setText(document.getElementById('gesture-feedback'), currentLanguage === 'ja' ? '右手全体をカメラに映してください。' : 'Keep your whole right hand in the camera frame.');
    // Keep the last rectangle visible while RegionSelector is deliberately
    // riding through a short MediaPipe hand dropout. A missing dominant hand
    // makes the engine emit null, but it must not make an in-progress screenshot
    // appear to have been cancelled.
    const selectionStillActive = engine &&
      (engine.region.phase === 'framing' || engine.region.phase === 'pending');
    if (!selectionStillActive) drawRegion(null);
    return;
  }

  if (!handInFrame) document.body.classList.add('hand-live');
  handInFrame = true;

  const modeLabel = currentLanguage === 'ja'
    ? ({ idle: '待機', aim: 'ポインター', press: 'クリック', grab: 'スクロール', region: '範囲選択' }[state.mode] || state.mode)
    : state.mode;
  setText(els.hudMode, state.modifier
    ? `${modeLabel} + ${currentLanguage === 'ja' ? '修飾' : 'modifier'}`
    : modeLabel);
  setText(els.hudHands, state.hands || 1);

  const pointerPoint = { x: state.x - fieldRect.left, y: state.y - fieldRect.top };
  field.setPointer(pointerPoint);
  const target = engine?.pointer.currentTarget;
  const overControl = target?.closest('a, button, input, select, textarea, [role=button], .target, #t-drag');
  // The galaxy follows the same pointer everywhere, including over controls.
  // AirCursor still owns hit testing and dispatches the control's real events.
  field.setAttractors(state.mode === 'aim' ? [pointerPoint] : null, 'aim');
  const isPressingControl = state.mode === 'press' && !!overControl;
  document.body.classList.toggle('hand-pressing-control', isPressingControl);
  setText(document.getElementById('gesture-feedback'), currentLanguage === 'ja'
    ? (state.mode === 'press' ? '親指を離すとクリック。保持して動かすとドラッグ。' : '人差し指と中指を合わせて移動。親指を合わせて、離すとクリック。')
    : (state.mode === 'press' ? 'Release your thumb to click. Keep holding to drag.' : 'Point with two fingertips together. Bring in your thumb, then release to click.'));

  drawRegion(state.region);

  if (state.mode === 'press' && previousMode === 'aim') {
    castRelease(state.x, state.y, state.modifier ? 1.35 : 1);
  }
  previousMode = state.mode;
}

// --------------------------------------------------------- region selection

const regionHints = {
  framing: ['Open both hands to freeze', '両手を開いて固定'],
  pending: ['Tap each hand to capture · wait to cancel', '左右でタップして確定・待つと解除'],
  half: ['Now tap with the other hand', 'もう片方もタップ'],
  waiting: ['Open both hands', '両手を開く'],
};

// Why a selection was thrown away. The rectangle vanishing on its own carries
// no information -- it looks the same whether the gesture was misread, too
// small, or simply waited out.
const regionRejections = {
  tooSmall: ['That area was too small — frame a wider one', '範囲が小さすぎます。もう少し広く囲んでください'],
  timeout: ['Selection cancelled — nothing was captured', '選択を取り消しました。キャプチャしていません'],
  cancelled: ['Selection cancelled with both fists', '両手のグーで範囲選択を解除しました'],
};

/**
 * Outline what is being selected. The rectangle comes from the engine rather
 * than from the hand positions, so what is drawn is exactly what will be
 * captured -- the engine deliberately lets it trail the hands by a few frames
 * so that opening a pinch cannot drag a corner.
 */
function drawRegion(region) {
  const box = els.regionBox;
  if (region && region.rejected) {
    const message = regionRejections[region.rejected];
    if (message) showRegionToast(message[currentLanguage === 'ja' ? 1 : 0], null, 'error');
  }
  // No rectangle to draw covers the cooldown phase as well as idle: the
  // selection has resolved and the box should go, even though the phase is
  // deliberately still held while the hands open.
  if (!region || !region.rect) {
    box.hidden = true;
    return;
  }
  const { left, top, width, height } = region.rect;
  box.hidden = false;
  box.dataset.phase = region.phase;
  box.classList.toggle('half', !!region.halfConfirmed);
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
  box.style.width = `${width}px`;
  box.style.height = `${height}px`;

  const key = region.phase === 'framing'
    ? 'framing'
    : region.halfConfirmed
      ? 'half'
      : region.awaitingConfirm ? 'pending' : 'waiting';
  els.regionHint.textContent = regionHints[key][currentLanguage === 'ja' ? 1 : 0];
}

function cancelRegionSelection() {
  if (!engine || typeof engine.cancelRegionSelection !== 'function' || !engine.cancelRegionSelection()) return false;
  drawRegion(null);
  showRegionToast(
    currentLanguage === 'ja' ? '範囲選択を解除しました' : 'Selection cancelled — nothing was captured',
    null
  );
  return true;
}

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && cancelRegionSelection()) event.preventDefault();
});

// The crop lands in the Region capture panel, which is most of a page away from
// wherever the gesture was made -- so on its own it is invisible feedback. This
// says what happened next to the hands, and shows the crop while it does.
let regionToastTimer = null;
function showRegionToast(text, dataUrl, tone = 'info') {
  const toast = els.regionToast;
  if (!toast) return;
  toast.hidden = false;
  toast.dataset.tone = tone;
  els.regionToastText.textContent = text;
  els.regionToastImg.hidden = !dataUrl;
  if (dataUrl) els.regionToastImg.src = dataUrl;
  clearTimeout(regionToastTimer);
  regionToastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

// html2canvas is only fetched the first time a region is confirmed. It is the
// one route to a crop that needs no permission at all: getDisplayMedia() would
// be sharper, but it needs a real user gesture to start and a hand cannot
// supply one -- see the citation section's note on synthetic events.
let html2canvasPromise = null;
function loadHtml2Canvas() {
  if (!html2canvasPromise) {
    html2canvasPromise = new Promise((resolve, reject) => {
      if (window.html2canvas) return resolve(window.html2canvas);
      const tag = document.createElement('script');
      tag.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      tag.onload = () => (window.html2canvas ? resolve(window.html2canvas) : reject(new Error('no html2canvas')));
      tag.onerror = () => reject(new Error('html2canvas failed to load'));
      document.head.appendChild(tag);
      return undefined;
    }).catch((error) => {
      html2canvasPromise = null;
      throw error;
    });
  }
  return html2canvasPromise;
}

// AirCursor's own furniture must not appear in the crop, and neither must the
// hero's WebGL canvas: html2canvas cannot read a context that was not created
// with preserveDrawingBuffer, so including it would paint a black hole.
const OMIT_FROM_CAPTURE = new Set(['region-box', 'region-toast', 'cursor', 'hud', 'preview', 'spellfield', 'camera']);

// The last crop, kept so it can be written to a file on request. Downloading
// on every capture would litter the user's disk with pictures they were only
// checking, so the gesture produces the image and the button writes it.
let lastCrop = null;

els.shotSave.addEventListener('click', () => {
  if (!lastCrop) return;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const link = document.createElement('a');
  link.href = lastCrop;
  link.download = `aircursor-${stamp}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
});

let capturing = false;

async function captureRegion(rect) {
  if (capturing) return;
  capturing = true;
  els.regionBox.hidden = true;
  try {
    const html2canvas = await loadHtml2Canvas();
    // The coordinate and colour corrections live in the library now, so this
    // page and anyone installing the package are running the same code. They
    // used to be duplicated here, which is exactly how the two would drift.
    const canvas = await cropRegion(html2canvas, rect, {
      ignoreElements: (el) => OMIT_FROM_CAPTURE.has(el.id),
    });
    const dataUrl = canvas.toDataURL('image/png');
    lastCrop = dataUrl;
    els.shotSave.disabled = false;
    els.shotImg.src = dataUrl;
    els.shotImg.hidden = false;
    els.shotPlaceholder.hidden = true;
    els.shotFrame.classList.add('filled');
    bump('shot', document.getElementById('c-shot'));
    showRegionToast(
      currentLanguage === 'ja' ? 'キャプチャしました（下の「範囲キャプチャ」に表示）' : 'Captured — the crop is in the Region capture panel',
      dataUrl
    );
  } catch (error) {
    setStatus('The crop could not be rendered.', 'error');
    showRegionToast(
      currentLanguage === 'ja' ? '範囲を画像化できませんでした' : 'The crop could not be rendered',
      null,
      'error'
    );
    // html2canvas comes from a CDN and renders the whole document: both the
    // download and the render can fail for reasons only the console will name.
    // Swallowing that is what made a failed capture indistinguishable from a
    // gesture that never fired.
    console.error('[AirCursor] region capture failed', error);
  } finally {
    capturing = false;
  }
}

/** A click lets go of everything the hand had gathered. */
function castRelease(x, y, strength) {
  field.release(x - fieldRect.left, y - fieldRect.top, strength);
}

function frame(now) {
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;

  if (fieldActive && !document.hidden) {
    field.step(dt);
    field.render();
  }

  frames += 1;
  if (now - fpsClock >= 1000) {
    if (!els.hud.hidden) {
      els.hudFps.textContent = String(frames);
      // Reported separately from the render rate because they trade against
      // each other: inference and rendering share one thread, so a high infer
      // number next to a low render one is the whole story of a stuttering
      // field, and the two averaged together hid exactly that.
      els.hudInfer.textContent = engine ? String(engine.inferenceCount - lastInferCount) : '—';
      els.hudInferMs.textContent = engine && engine.inferenceDurationMs > 0
        ? engine.inferenceDurationMs.toFixed(1)
        : '—';
      if (engine) lastInferCount = engine.inferenceCount;
    }
    frames = 0;
    fpsClock = now;
  }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// -------------------------------------------------------------- playground
//
// These handlers exist to be driven by a hand. Each one listens the way real
// application code listens, not the way a demo would be written to make a
// gesture library look good.

const scoreboard = {};
function bump(name, node) {
  scoreboard[name] = (scoreboard[name] || 0) + 1;
  node.textContent = String(scoreboard[name]);
  node.classList.remove('pulse');
  void node.offsetWidth;
  node.classList.add('pulse');
}

// A plain div with a click handler: the case a tag whitelist cannot reach.
const divTarget = document.getElementById('t-div');
divTarget.addEventListener('click', () => bump('div', document.getElementById('c-div')));

// Hover, via JavaScript rather than CSS :hover.
const hoverTarget = document.getElementById('t-hover');
hoverTarget.addEventListener('pointerenter', () => hoverTarget.classList.add('lit'));
hoverTarget.addEventListener('pointerleave', () => hoverTarget.classList.remove('lit'));

// Right click, through the contextmenu event.
const ctxTarget = document.getElementById('t-ctx');
const ctxMenu = document.getElementById('ctx-menu');
ctxTarget.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  ctxMenu.hidden = false;
  bump('ctx', document.getElementById('c-ctx'));
});
document.addEventListener('pointerdown', (event) => {
  if (!ctxMenu.hidden && !ctxMenu.contains(event.target) && event.target !== ctxTarget) {
    ctxMenu.hidden = true;
  }
});

// Drag, using the pointerdown / pointermove / pointerup sequence that drag
// libraries rely on.
const dragTarget = document.getElementById('t-drag');
const dragTrack = document.getElementById('drag-track');
let dragging = false;
let dragOffset = 0;
dragTarget.addEventListener('pointerdown', (event) => {
  dragging = true;
  dragOffset = event.clientX - dragTarget.getBoundingClientRect().left;
  dragTarget.classList.add('held');
});
window.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  const track = dragTrack.getBoundingClientRect();
  const max = track.width - dragTarget.offsetWidth;
  const next = Math.max(0, Math.min(max, event.clientX - track.left - dragOffset));
  dragTarget.style.transform = `translateX(${next}px)`;
  document.getElementById('c-drag').textContent = `${Math.round((next / max) * 100)}%`;
});
window.addEventListener('pointerup', () => {
  if (!dragging) return;
  dragging = false;
  dragTarget.classList.remove('held');
});

// Populate the scrollable panel so grab-scrolling has something to move.
renderSpellList();

// Copy the install command. Clipboard writes need the page to be focused; in
// Chrome this succeeds from a synthetic click too, elsewhere it may not.
const copyBtn = document.getElementById('copy');
copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText('npm install air-cursor');
    copyBtn.dataset.state = 'copied';
    trackConversion('install_copy', 'hero');
    setTimeout(() => { copyBtn.dataset.state = ''; }, 1600);
  } catch (error) {
    copyBtn.dataset.state = 'failed';
    setTimeout(() => { copyBtn.dataset.state = ''; }, 2400);
  }
});

// Only intent/actions are measured. Camera frames, landmarks and coordinates
// are never included in analytics payloads.
function trackConversion(name, placement = 'page') {
  if (typeof window.gtag === 'function') window.gtag('event', name, { placement, package_version: DEMO_PACKAGE.version });
}
function updateTryLabel() {
  const button = document.getElementById('try-camera');
  button.textContent = currentLanguage === 'ja' ? (running ? 'カメラを停止' : '手で試す') : (running ? 'Stop camera' : 'Try with your hand');
}
document.querySelectorAll('a[href*="npmjs.com/package/air-cursor"]').forEach(link => {
  link.addEventListener('click', () => trackConversion('npm_visit', link.closest('section')?.id || 'hero'));
});
document.querySelectorAll('[data-copy-install]').forEach(button => {
  button.addEventListener('click', () => copyInstall(button));
});
async function copyInstall(button) {
  try {
    await navigator.clipboard.writeText('npm install air-cursor');
    button.dataset.state = 'copied';
    document.getElementById('install-feedback').textContent = currentLanguage === 'ja' ? 'インストールコマンドをコピーしました' : 'Install command copied';
    trackConversion('install_copy', button.closest('section')?.id || 'hero');
  } catch {
    document.getElementById('install-feedback').textContent = currentLanguage === 'ja' ? 'npm install air-cursor を選択してコピーしてください' : 'Select and copy: npm install air-cursor';
  }
}

let trialClicks = 0;
let trialInput = 'mouse';
function renderTrialResult() {
  const result = document.getElementById('try-result');
  result.textContent = currentLanguage === 'ja'
    ? `${result.dataset.clicks} 回クリック成功。次はあなたのアプリで。`
    : `${result.dataset.clicks} successful click${Number(result.dataset.clicks) === 1 ? '' : 's'}. Your app could be next.`;
}
document.getElementById('try-target').addEventListener('click', event => {
  trialClicks++;
  trialInput = event.isTrusted ? 'mouse' : 'hand';
  const result = document.getElementById('try-result');
  result.dataset.clicks = String(trialClicks);
  result.dataset.input = trialInput;
  renderTrialResult();
  document.querySelector('.try-console').classList.add('has-clicked');
  if (trialClicks === 1) trackConversion('demo_first_click', trialInput);
});
