// docs/assets/demo.js
//
// The page controller.
//
// One animation loop drives everything: the particle field, the synthetic
// pointer and the scroller. MediaPipe runs on its own cadence and only ever
// writes into `latest`; nothing in the render path waits on inference. That is
// the same split the library itself uses, and it is why the visuals stay
// smooth while the model is working.

import { SpellField } from './spellfield.js';
import { AirCursorEngine, cropRegion } from './aircursor-core.js';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- particles

const canvas = document.getElementById('spellfield');
const field = new SpellField(canvas, { reducedMotion: prefersReducedMotion });
if (!field.supported) document.body.classList.add('no-webgl');


let lastFrame = performance.now();
let fieldActive = true;
let fieldRect = canvas.getBoundingClientRect();

const hero = document.querySelector('.hero');
function updateFieldVisibility() {
  const rect = hero.getBoundingClientRect();
  fieldRect = canvas.getBoundingClientRect();
  const next = rect.bottom > 0 && rect.top < window.innerHeight;
  if (fieldActive && !next) field.setPointer(null);
  fieldActive = next;
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

// MediaPipe hand topology, so the preview can be drawn without pulling in
// @mediapipe/drawing_utils just for twenty line segments.
const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
const FINGER_TIPS = [4, 8, 12, 16, 20];
const previewCtx = els.previewSkeleton ? els.previewSkeleton.getContext('2d') : null;

/**
 * Draw every detected hand over the camera preview.
 *
 * Without this the preview only proves the camera is on, not that the hand is
 * being found — so a visitor whose hand is out of frame or badly lit has no way
 * to tell why nothing is happening. The dominant hand is drawn in the page red
 * and the off hand, which acts as the modifier, in gold.
 */
function drawPreviewSkeleton(results) {
  if (!previewCtx) return;
  const w = els.previewSkeleton.width;
  const h = els.previewSkeleton.height;
  previewCtx.clearRect(0, 0, w, h);

  const hands = results.multiHandLandmarks;
  if (!hands || !hands.length) return;

  for (let i = 0; i < hands.length; i++) {
    const lm = hands[i];
    const handedness = results.multiHandedness && results.multiHandedness[i];
    // MediaPipe reports handedness from the camera's point of view, so its
    // "Right" is the user's left.
    const isDominant = handedness ? handedness.label === 'Left' : i === 0;
    const stroke = isDominant ? '#ff4257' : '#e9bd6a';

    previewCtx.lineWidth = 2;
    previewCtx.lineCap = 'round';
    previewCtx.strokeStyle = stroke;
    previewCtx.globalAlpha = 0.9;
    previewCtx.beginPath();
    for (const [a, b] of HAND_BONES) {
      previewCtx.moveTo(lm[a].x * w, lm[a].y * h);
      previewCtx.lineTo(lm[b].x * w, lm[b].y * h);
    }
    previewCtx.stroke();

    previewCtx.globalAlpha = 1;
    for (let k = 0; k < lm.length; k++) {
      const tip = FINGER_TIPS.includes(k);
      previewCtx.fillStyle = tip ? '#fff3e6' : stroke;
      previewCtx.beginPath();
      previewCtx.arc(lm[k].x * w, lm[k].y * h, tip ? 3.2 : 2, 0, Math.PI * 2);
      previewCtx.fill();
    }
  }
}

const statusTranslations = new Map([
  ['Move your mouse to stir the field. Press Start to hand it over to your hand.', 'マウスで粒子を揺らせます。開始を押すと手の操作へ切り替わります。'],
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
  ['#how .two-col > div:nth-child(2) p:nth-of-type(2)', 'ヒーロー背景の粒子も同じ描画ループを使うため、ハンドモデルの処理を妨げません。'],
  ['#gestures .eyebrow', 'ジェスチャー'], ['#gestures h2', '5つの操作。2つの手。'],
  ['#gestures thead th:nth-child(1)', 'ジェスチャー'], ['#gestures thead th:nth-child(2)', '操作'],
  ['#gestures tbody tr:nth-child(1) td:nth-child(1)', '人差し指と中指の先を合わせる'], ['#gestures tbody tr:nth-child(1) td:nth-child(2)', '手に合わせてポインターを移動'],
  ['#gestures tbody tr:nth-child(2) td:nth-child(1)', 'そのまま親指を合わせる'], ['#gestures tbody tr:nth-child(2) td:nth-child(2)', 'クリック。保持するとドラッグ'],
  ['#gestures tbody tr:nth-child(3) td:nth-child(1)', '他の指を開き、親指と人差し指をつまむ'], ['#gestures tbody tr:nth-child(3) td:nth-child(2)', 'ページをつかんでスクロール'],
  ['#gestures tbody tr:nth-child(4) td:nth-child(1)', '反対の手を握る'], ['#gestures tbody tr:nth-child(4) td:nth-child(2)', '次のクリックを右クリックへ変更'],
  ['#install > .eyebrow', 'プロダクトへ導入'], ['#install > h2', 'わずか3行でリリース。'],
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
  ['#try .pad:nth-child(6) p', '<em>両手</em>でつまんで範囲を囲み、手を開いて、両手でそれぞれ1回タップします。解除するときは両手をグーにします。切り取られた画像がここに表示され、結果は手元にも通知されます。'],
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
let currentLanguage = localStorage.getItem('aircursor:language') === 'ja' ? 'ja' : 'en';
let currentStatus = 'Move your mouse to stir the field. Press Start to hand it over to your hand.';

function applyLanguage() {
  document.documentElement.lang = currentLanguage;
  els.language.textContent = currentLanguage === 'en' ? '日本語' : 'English';
  els.language.setAttribute('aria-label', currentLanguage === 'en' ? '日本語に切り替える' : 'Switch to English');
  els.cast.textContent = running
    ? (currentLanguage === 'ja' ? '停止' : 'Stop')
    : (currentLanguage === 'ja' ? '開始' : 'Start');
  els.status.textContent = currentLanguage === 'ja'
    ? (statusTranslations.get(currentStatus) || currentStatus)
    : currentStatus;
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
    : 'AirCursor — touchless pointer for the web';
  // Alt text is not innerHTML, so the table above cannot reach it. Left alone
  // it stayed English in Japanese, which is the one piece of the page only a
  // screen reader would ever have noticed.
  els.shotImg.alt = currentLanguage === 'ja'
    ? '両手で最後に囲んだ範囲'
    : 'The area you last framed with both hands';
  renderSpellList();
}

els.language.addEventListener('click', () => {
  currentLanguage = currentLanguage === 'en' ? 'ja' : 'en';
  localStorage.setItem('aircursor:language', currentLanguage);
  applyLanguage();
});

let running = false;
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
  if (running) return stopTracking();

  els.cast.disabled = true;
  setStatus('Loading the hand model…');
  setStatus('Waiting for camera permission…');

  engine = new AirCursorEngine({
    video: els.video,
    previewCanvas: els.previewSkeleton,
    cursorElement: els.cursor,
    // The hero already has a full-screen particle simulation. Use the light
    // landmark model and a smaller upload here; gesture geometry does not need
    // a high-resolution camera frame.
    inferenceFps: 30,
    hands: { modelComplexity: 0 },
    camera: { width: 480, height: 360 },
    onState: applyEngineState,
    onRegionSelect: captureRegion,
    onError: () => setStatus('The camera could not be started. This page needs camera permission and an https connection.', 'error'),
  });

  try {
    await engine.start();
    running = true;
  } catch (error) {
    running = false;
    engine.stop();
    engine = null;
    els.cast.disabled = false;
    setStatus('The camera could not be started. This page needs camera permission and an https connection.', 'error');
    return;
  }

  window.__airCursorDemo = engine;
  lastInferCount = 0;
  // Camera permission and video initialization can resize the visual viewport.
  // Re-evaluate from real geometry and rebuild the canvas backing buffers.
  updateFieldVisibility();
  field.resize();
  els.cast.disabled = false;
  els.cast.textContent = currentLanguage === 'ja' ? '停止' : 'Stop';
  els.hud.hidden = false;
  els.preview.hidden = false;
  document.body.classList.add('tracking');
  setStatus('Hold your index and middle fingers together to move the pointer.', 'ok');
}

function stopTracking() {
  running = false;
  handInFrame = false;
  document.body.classList.remove('hand-live');
  if (engine) engine.stop();
  engine = null;
  window.__airCursorDemo = null;
  previousMode = 'idle';
  els.cast.textContent = currentLanguage === 'ja' ? '開始' : 'Start';
  els.hud.hidden = true;
  els.preview.hidden = true;
  if (previewCtx) {
    previewCtx.clearRect(0, 0, els.previewSkeleton.width, els.previewSkeleton.height);
  }
  els.cursor.style.opacity = '0';
  els.regionBox.hidden = true;
  els.regionToast.hidden = true;
  field.setAttractors(null);
  document.body.classList.remove('tracking');
  setStatus('Stopped. The camera has been released.');
}

applyLanguage();

els.cast.addEventListener('click', startTracking);

// ------------------------------------------------------------------- loop

function applyEngineState(state) {
  if (!state) {
    field.setAttractors(null);
    if (handInFrame) document.body.classList.remove('hand-live');
    handInFrame = false;
    setText(els.hudMode, currentLanguage === 'ja' ? '手を検出していません' : 'no hand');
    setText(els.hudHands, '0');
    previousMode = 'idle';
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
  field.setAttractors(state.mode === 'aim' ? [pointerPoint] : null, 'aim');

  drawRegion(state.region);

  if (state.mode === 'press' && previousMode !== 'press') {
    castRelease(state.x, state.y, state.modifier ? 1.35 : 1);
  }
  previousMode = state.mode;
}

// --------------------------------------------------------- region selection

const regionHints = {
  framing: ['Open to freeze · hold both fists to cancel', '両手を開いて固定・両手グーで解除'],
  pending: ['Tap both hands to capture · fists to cancel', '両手タップで確定・両手グーで解除'],
  half: ['Now the other hand · fists to cancel', 'もう片方もタップ・両手グーで解除'],
  waiting: ['Open both hands · fists to cancel', '両手を開く・両手グーで解除'],
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
  if (!engine || !engine.cancelRegionSelection()) return false;
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

function applyHand(now) {
  const state = latest;
  const hand = state && state.dominant;
  const landmarks = state && state.dominantLandmarks;

  if (!hand || !landmarks) {
    if (wasPressed) { pointer.cancel(); wasPressed = false; }
    if (wasGrabbing) { scroller.end(); wasGrabbing = false; }
    pointer.clear();
    field.setAttractors(null);
    targetPoint = null;
    visualPoint = null;
    lastVisualTime = null;
    smoother.reset();
    els.cursor.style.opacity = '0';
    els.hudMode.textContent = currentLanguage === 'ja' ? '手を検出していません' : 'no hand';
    els.hudHands.textContent = '0';
    // Hand out of frame: the mouse takes the field back, and the system
    // cursor comes back with it.
    if (handInFrame) document.body.classList.remove('hand-live');
    handInFrame = false;
    return;
  }
  if (!handInFrame) document.body.classList.add('hand-live');
  handInFrame = true;

  const raw = landmarkToViewport(
    midpoint(landmarks[LM.INDEX_TIP], landmarks[LM.MIDDLE_TIP]),
    window.innerWidth,
    window.innerHeight
  );
  // Update the signal filter exactly once per camera inference. Re-filtering a
  // repeated sample on every animation frame makes the next real sample look
  // like a step, which is the source of the visible 24 fps judder.
  if (handledRevision !== inferenceRevision || !targetPoint) {
    targetPoint = smoother.filter(raw, inferenceTime || now / 1000);
    handledRevision = inferenceRevision;
  }
  if (!visualPoint) visualPoint = { ...targetPoint };
  const visualDt = lastVisualTime === null ? 1 / 60 : Math.min(0.05, (now - lastVisualTime) / 1000);
  lastVisualTime = now;
  const follow = 1 - Math.exp(-visualDt / 0.045);
  visualPoint.x += (targetPoint.x - visualPoint.x) * follow;
  visualPoint.y += (targetPoint.y - visualPoint.y) * follow;
  const x = Math.max(0, Math.min(window.innerWidth - 1, visualPoint.x));
  const y = Math.max(0, Math.min(window.innerHeight - 1, visualPoint.y));
  const modifier = !!state.modifier;


  pointer.move(x, y);

  if (hand.selecting && !wasPressed) {
    if (modifier) {
      if (!contextFired) {
        pointer.contextMenu();
        contextFired = true;
        castRelease(x, y, 1.35);
      }
    } else {
      pointer.press(0);
      wasPressed = true;
      castRelease(x, y, 1);
    }
  } else if (!hand.selecting) {
    if (wasPressed) { pointer.release(); wasPressed = false; }
    contextFired = false;
  }

  if (hand.grabbing && !wasGrabbing) {
    scroller.begin({ x, y }, hitTest(x, y));
    wasGrabbing = true;
  } else if (hand.grabbing) {
    scroller.update({ x, y });
  } else if (wasGrabbing) {
    scroller.end();
    wasGrabbing = false;
  }

  const mode = hand.grabbing ? 'grab' : wasPressed ? 'press' : hand.aiming ? 'aim' : 'idle';
  els.cursor.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
  els.cursor.style.opacity = '1';
  els.cursor.dataset.mode = mode;
  els.cursor.dataset.modifier = modifier ? 'on' : 'off';
  const modeLabel = currentLanguage === 'ja'
    ? ({ idle: '待機', aim: 'ポインター', press: 'クリック', grab: 'スクロール' }[mode] || mode)
    : mode;
  els.hudMode.textContent = modifier
    ? `${modeLabel} + ${currentLanguage === 'ja' ? '修飾' : 'modifier'}`
    : modeLabel;
  els.hudHands.textContent = state.offLandmarks ? '2' : '1';

  // Light belongs to the pointer itself, not to the individual fingertips.
  // Gestures decide when it gathers; the single synthetic-pointer coordinate
  // decides where.
  const rect = canvas.getBoundingClientRect();
  const pointerPoint = { x: x - rect.left, y: y - rect.top };
  // A detected hand always stirs and lights nearby dust at the pointer. The
  // gesture-specific attractor below is what additionally captures it.
  field.setPointer(pointerPoint);

  if (hand.grabbing) {
    // Thumb + index is reserved for page grabbing/scrolling. It may stir the
    // passive dust through setPointer(), but must never charge the light.
    field.setAttractors(null);
  } else if (hand.aiming) {
    field.setAttractors([pointerPoint], 'aim');
  } else {
    field.setAttractors(null);
  }
}

/** A click lets go of everything the hand had gathered. */
function castRelease(x, y, strength) {
  field.release(x - fieldRect.left, y - fieldRect.top, strength);
}

function frame(now) {
  const dt = (now - lastFrame) / 1000;
  lastFrame = now;

  if (fieldActive) {
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
    setTimeout(() => { copyBtn.dataset.state = ''; }, 1600);
  } catch (error) {
    copyBtn.dataset.state = 'failed';
    setTimeout(() => { copyBtn.dataset.state = ''; }, 2400);
  }
});
