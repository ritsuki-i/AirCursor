// docs/tools/labeler.js
//
// A labelling and threshold-fitting tool.
//
// The gesture thresholds in the library were picked by hand, which is why they
// kept being wrong: there was no measurement behind them. This records real
// poses against a label, then reads the thresholds back out of the recording.
//
// The fit is deliberately not a classifier. The library's recognizer is a set of
// Schmitt triggers on named, physically meaningful quantities, and keeping it
// that way means a threshold can still be read, argued with and overridden. What
// this replaces is only the guessing:
//
//   enter  the value at which almost no negative sample would fire it
//   exit   the value at which almost no positive sample would drop out
//
// which is exactly the asymmetry hysteresis is for. The raw landmarks are stored
// alongside the features, so the same recording can train a classifier later
// without collecting anything again.

import { fit } from './fit.js';
import {
  LM,
  normDistance,
  handScale,
  fingerExtension,
  meanFingerExtension,
  neighbourGap,
  userHandFrom,
} from '../assets/aircursor-core.js';

const MP_HANDS = '0.4.1675469240';
const MP_CAMERA = '0.3.1675466862';
const CDN = 'https://cdn.jsdelivr.net/npm';

/**
 * The poses to record. `idle` is the important one and the easiest to skimp on:
 * it is every shape a hand makes when it is not asking for anything, and it is
 * what the thresholds have to be safe against.
 */
const CLASSES = [
  { id: 'idle', key: '1', label: 'Idle', hint: 'Hand relaxed, open, moving about. Anything that is not a gesture.' },
  // "Touching" rather than "together": the first recording of this class was
  // made to the looser wording and a fifth of it is a slightly open V sign,
  // which is how a V sign came to be accepted as a pointer in the first place.
  // A label set is only ever as good as the sentence describing it.
  { id: 'aim', key: '2', label: 'Pointer', hint: 'Index and middle TOUCHING along their length, thumb away. If you can see daylight between them, it is a V sign, not a pointer.' },
  { id: 'select', key: '3', label: 'Click', hint: 'Index, middle and thumb all together.' },
  { id: 'grab', key: '4', label: 'Grab', hint: 'Thumb and index pinched, other fingers apart.' },
  { id: 'fist', key: '5', label: 'Fist', hint: 'Closed hand — the off-hand modifier.' },
  // The negative the pointer decision actually needs. Without it the separation
  // threshold has to be fitted against `grab` as a stand-in, which is a
  // different pose that merely happens to share the spread fingers.
  { id: 'peace', key: '6', label: 'V sign', hint: 'Index and middle extended and APART, ring and pinky curled. Record it narrow, wide, and everywhere between — the narrow ones decide where the line goes.' },
];

const els = {
  video: document.getElementById('video'),
  skeleton: document.getElementById('skeleton'),
  start: document.getElementById('start'),
  clear: document.getElementById('clear'),
  export: document.getElementById('export'),
  importBtn: document.getElementById('importBtn'),
  import: document.getElementById('import'),
  analyse: document.getElementById('analyse'),
  copy: document.getElementById('copy'),
  status: document.getElementById('status'),
  live: document.getElementById('live'),
  classes: document.getElementById('classes'),
  report: document.getElementById('report'),
};

const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
const TIPS = [4, 8, 12, 16, 20];

/** @type {Array<{label: string, features: object, landmarks: number[][]}>} */
let samples = [];
let armed = null;
let running = false;
let lastThresholds = null;

// ---------------------------------------------------------------- features

/**
 * Everything the recognizer looks at, plus a little more, all normalised by
 * hand size so nothing here varies with distance from the camera.
 */
function extract(lm) {
  const indexMiddle = normDistance(lm, LM.INDEX_TIP, LM.MIDDLE_TIP);
  const middleRing = normDistance(lm, LM.MIDDLE_TIP, LM.RING_TIP);
  return {
    thumbIndex: normDistance(lm, LM.THUMB_TIP, LM.INDEX_TIP),
    thumbMiddle: normDistance(lm, LM.THUMB_TIP, LM.MIDDLE_TIP),
    indexMiddle,
    middleRing,
    ringPinky: normDistance(lm, LM.RING_TIP, LM.PINKY_TIP),
    // The library's own pointer score, imported rather than reimplemented so
    // the two cannot drift apart. `spread` below is kept for continuity with
    // the version 1 recordings, but it is not what the recognizer looks at:
    // it omits the ring/pinky gap, so a fit against it produced a threshold
    // for a quantity nothing ever computes.
    gapScore: neighbourGap(lm),
    spread: middleRing - indexMiddle,
    extension: meanFingerExtension(lm),
    extIndex: fingerExtension(lm, LM.INDEX_TIP),
    extMiddle: fingerExtension(lm, LM.MIDDLE_TIP),
    extRing: fingerExtension(lm, LM.RING_TIP),
    extPinky: fingerExtension(lm, LM.PINKY_TIP),
  };
}

// ------------------------------------------------------------------- setup

function renderClasses() {
  els.classes.innerHTML = '';
  for (const c of CLASSES) {
    const n = samples.filter((s) => s.label === c.id).length;
    const row = document.createElement('div');
    row.className = 'cls' + (armed === c.id ? ' armed' : '');
    row.dataset.id = c.id;
    row.innerHTML = `<kbd>${c.key}</kbd>
      <div><strong>${c.label}</strong><small>${c.hint}</small></div>
      <div class="n">${n}</div>`;
    els.classes.appendChild(row);
  }
}
renderClasses();

function setStatus(text) {
  els.status.textContent = text;
}

// ------------------------------------------------------------------ camera

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = src;
    tag.crossOrigin = 'anonymous';
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(tag);
  });
}

async function start() {
  if (running) return;
  els.start.disabled = true;
  setStatus('Loading the hand model…');
  try {
    if (!window.Hands) await loadScript(`${CDN}/@mediapipe/hands@${MP_HANDS}/hands.js`);
    if (!window.Camera) await loadScript(`${CDN}/@mediapipe/camera_utils@${MP_CAMERA}/camera_utils.js`);
  } catch (e) {
    els.start.disabled = false;
    setStatus('The hand model could not be downloaded.');
    return;
  }

  const hands = new window.Hands({ locateFile: (f) => `${CDN}/@mediapipe/hands@${MP_HANDS}/${f}` });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
  });
  hands.onResults(onResults);

  const camera = new window.Camera(els.video, {
    onFrame: async () => {
      if (!running) return;
      try { await hands.send({ image: els.video }); } catch (e) { /* dropped frame */ }
    },
    width: 1280,
    height: 720,
  });

  try {
    running = true;
    await camera.start();
  } catch (e) {
    running = false;
    els.start.disabled = false;
    setStatus('The camera could not be started. This page needs camera permission.');
    return;
  }
  els.start.textContent = 'Camera running';
  setStatus('Hold a pose and hold its key to record. Release the key to stop.');
}

els.start.addEventListener('click', start);

// ----------------------------------------------------------------- capture

function onResults(results) {
  const ctx = els.skeleton.getContext('2d');
  const w = els.skeleton.width;
  const h = els.skeleton.height;
  ctx.clearRect(0, 0, w, h);

  const hands = results.multiHandLandmarks;
  if (!hands || !hands.length) {
    els.live.textContent = 'no hand';
    return;
  }

  const lm = hands[0];
  const handedness = results.multiHandedness && results.multiHandedness[0];

  // draw
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = armed ? '#ff4257' : '#e9bd6a';
  ctx.beginPath();
  for (const [a, b] of BONES) {
    ctx.moveTo(lm[a].x * w, lm[a].y * h);
    ctx.lineTo(lm[b].x * w, lm[b].y * h);
  }
  ctx.stroke();
  for (let i = 0; i < lm.length; i++) {
    ctx.fillStyle = TIPS.includes(i) ? '#fff3e6' : ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(lm[i].x * w, lm[i].y * h, TIPS.includes(i) ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const f = extract(lm);
  els.live.innerHTML = [
    `hand <b>${userHandFrom(handedness)}</b>  scale <b>${handScale(lm).toFixed(3)}</b>`,
    `index–middle <b>${f.indexMiddle.toFixed(3)}</b>   gap score <b>${f.gapScore.toFixed(3)}</b>`,
    `thumb–index <b>${f.thumbIndex.toFixed(3)}</b>   extension <b>${f.extension.toFixed(3)}</b>`,
    armed ? `recording <b>${armed}</b>` : 'idle',
  ].join('<br>');

  if (armed) {
    samples.push({
      label: armed,
      features: f,
      // Kept so the same recording can train a classifier later.
      landmarks: lm.map((p) => [+p.x.toFixed(5), +p.y.toFixed(5), +p.z.toFixed(5)]),
    });
    if (samples.length % 10 === 0) renderClasses();
  }
}

// -------------------------------------------------------------- key arming

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const c = CLASSES.find((x) => x.key === e.key);
  if (!c) return;
  e.preventDefault();
  armed = c.id;
  renderClasses();
});
window.addEventListener('keyup', (e) => {
  const c = CLASSES.find((x) => x.key === e.key);
  if (!c) return;
  if (armed === c.id) {
    armed = null;
    renderClasses();
    setStatus(`${samples.length} samples recorded.`);
  }
});

// ------------------------------------------------------------ import/export

els.clear.addEventListener('click', () => {
  if (!samples.length) return;
  samples = [];
  renderClasses();
  els.report.innerHTML = '';
  setStatus('Cleared.');
});

els.export.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ version: 2, samples }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `aircursor-gestures-${samples.length}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

els.importBtn.addEventListener('click', () => els.import.click());
els.import.addEventListener('change', async () => {
  const file = els.import.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = Array.isArray(data) ? data : data.samples;
    // Version 1 recordings predate `gapScore`. They kept the raw landmarks, so
    // it can be recomputed rather than the recording being thrown away.
    for (const s of incoming) {
      if (s.features && s.features.gapScore === undefined && s.landmarks) {
        s.features.gapScore = neighbourGap(s.landmarks.map(([x, y, z]) => ({ x, y, z })));
      }
    }
    samples = samples.concat(incoming);
    renderClasses();
    setStatus(`Imported ${incoming.length} samples, ${samples.length} total.`);
  } catch (e) {
    setStatus('That file could not be read as a sample set.');
  }
});

// -------------------------------------------------------------- the fitting
// (the fit itself lives in ./fit.js, so it can be tested)

const pick = (label) => samples.filter((s) => s.label === label);
const values = (rows, key) => rows.map((s) => s.features[key]);

function analyse() {
  if (samples.length < 100) {
    els.report.innerHTML = `<p class="verdict bad">Only ${samples.length} samples. Record a few hundred per class first.</p>`;
    return;
  }

  const idle = pick('idle');
  const aim = pick('aim');
  const select = pick('select');
  const grab = pick('grab');
  const fist = pick('fist');
  const peace = pick('peace');

  // The pointer is live for both the aim pose and the click pose, since a click
  // is an aim with the thumb added.
  const pointerOn = [...aim, ...select];
  const pointerOff = [...idle, ...grab, ...fist, ...peace];

  const results = [
    {
      // The gap score, not the index/middle distance. These two were the wrong
      // way round: the library thresholds `aimEnter` against the gap score, so
      // fitting it against the raw distance produced a number that was then
      // applied to a different quantity entirely.
      name: 'aim (gap score)',
      keys: ['aimEnter', 'aimExit'],
      fit: fit(values(pointerOn, 'gapScore'), values(pointerOff, 'gapScore'), 'above'),
    },
    {
      // The V sign decision. The gap score cannot make it: it compares the
      // index/middle gap against the neighbouring ones, so curling the ring and
      // pinky raises it however far the two pointing fingers are spread. Only
      // the distance itself says whether they are actually together.
      //
      // Fitted against the poses that have those two fingers deliberately
      // apart. Idle is left out on purpose — a resting hand has them close, so
      // including it would drag the line tighter for a case the gap score
      // already rejects.
      name: 'aim (index–middle separation)',
      keys: ['aimSeparationEnter', 'aimSeparationExit'],
      fit: fit(values(pointerOn, 'indexMiddle'), values([...peace, ...grab], 'indexMiddle'), 'below'),
    },
    {
      name: 'select (thumb–index, while aiming)',
      keys: ['selectEnter', 'selectExit'],
      fit: fit(values(select, 'thumbIndex'), values(aim, 'thumbIndex'), 'below'),
    },
    {
      name: 'grab (thumb–index, not aiming)',
      keys: ['grabEnter', 'grabExit'],
      fit: fit(values(grab, 'thumbIndex'), values([...idle, ...fist], 'thumbIndex'), 'below'),
    },
    {
      name: 'fist (mean finger extension)',
      keys: ['fistEnter', 'fistExit'],
      fit: fit(values(fist, 'extension'), values([...idle, ...aim, ...select, ...grab], 'extension'), 'below'),
    },
  ];

  const thresholds = {};
  for (const r of results) {
    if (r.fit.ok && r.fit.usable) {
      thresholds[r.keys[0]] = r.fit.enter;
      thresholds[r.keys[1]] = r.fit.exit;
    }
  }
  lastThresholds = thresholds;
  els.copy.disabled = !Object.keys(thresholds).length;

  const rows = results.map((r) => {
    const f = r.fit;
    if (!f.ok) {
      return `<tr><td>${r.name}</td><td colspan="4" class="verdict bad">${f.reason} (${f.pos}/${f.neg})</td></tr>`;
    }
    const cls = !f.usable ? 'bad' : f.falseFireRate > 0.05 ? 'weak' : 'good';
    const verdict = !f.usable ? 'inseparable' : f.falseFireRate > 0.05 ? 'weak' : 'clean';
    return `<tr>
      <td>${r.name}</td>
      <td class="num">${f.enter}</td>
      <td class="num">${f.exit}</td>
      <td class="num">${f.posMedian} / ${f.negMedian}</td>
      <td class="verdict ${cls}">${verdict}</td>
    </tr>`;
  }).join('');

  const usableCount = results.filter((r) => r.fit.ok && r.fit.usable).length;

  els.report.innerHTML = `
    <table>
      <thead><tr><th>Decision</th><th class="num">enter</th><th class="num">exit</th><th class="num">median +/−</th><th>Fit</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="hint">
      ${usableCount} of ${results.length} decisions separate cleanly.
      <strong>inseparable</strong> means the feature cannot tell those poses apart
      at all — no threshold will fix it and the gesture needs a different
      measurement, not a different number.
    </p>
    <pre>thresholds={${JSON.stringify(thresholds, null, 2).slice(1, -1).replace(/\n/g, '\n')}}</pre>`;
}

els.analyse.addEventListener('click', analyse);

els.copy.addEventListener('click', async () => {
  if (!lastThresholds) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(lastThresholds, null, 2));
    setStatus('Thresholds copied.');
  } catch (e) {
    setStatus('Clipboard blocked — copy them from the box instead.');
  }
});
