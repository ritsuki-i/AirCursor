// test/pointer.test.js
//
// Covers the behaviour that version 1 got wrong: a plain <div> with a click
// handler was unreachable, pointerdown never fired, and coordinates were 0.

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

function setupDom(html) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, {
    pretendToBeVisual: true,
  });
  global.window = dom.window;
  global.document = dom.window.document;
  return dom;
}

/** Record every event of interest that reaches the document. */
function recorder(dom, types) {
  const log = [];
  for (const type of types) {
    dom.window.document.addEventListener(
      type,
      (e) => log.push({ type: e.type, target: e.target, x: e.clientX, y: e.clientY, button: e.button, detail: e.detail }),
      true
    );
  }
  return log;
}

/** jsdom has no layout, so hit testing must be stubbed. */
function stubHitTest(dom, element) {
  dom.window.document.elementFromPoint = () => element;
}

function loadPointer() {
  delete require.cache[require.resolve('../dist/cjs/core/pointer.js')];
  return require('../dist/cjs/core/pointer.js');
}

test('clicks a plain div, which the tag whitelist in v1 could not reach', () => {
  const dom = setupDom('<div id="target">hello</div>');
  const target = dom.window.document.getElementById('target');
  stubHitTest(dom, target);
  const { VirtualPointer } = loadPointer();

  let clicked = 0;
  target.addEventListener('click', () => { clicked += 1; });

  const pointer = new VirtualPointer();
  pointer.move(120, 80);
  pointer.press(0);
  pointer.release();

  assert.equal(clicked, 1);
});

test('emits the full press sequence in the right order', () => {
  const dom = setupDom('<button id="b">go</button>');
  const target = dom.window.document.getElementById('b');
  stubHitTest(dom, target);
  const { VirtualPointer } = loadPointer();

  const log = recorder(dom, ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']);
  const pointer = new VirtualPointer();
  pointer.move(10, 10);
  pointer.press(0);
  pointer.release();

  assert.deepEqual(
    log.map((e) => e.type),
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']
  );
});

test('carries real viewport coordinates', () => {
  const dom = setupDom('<div id="d"></div>');
  const target = dom.window.document.getElementById('d');
  stubHitTest(dom, target);
  const { VirtualPointer } = loadPointer();

  const log = recorder(dom, ['pointermove', 'click']);
  const pointer = new VirtualPointer();
  pointer.move(321, 214);
  pointer.press(0);
  pointer.release();

  const move = log.find((e) => e.type === 'pointermove');
  const click = log.find((e) => e.type === 'click');
  assert.equal(move.x, 321);
  assert.equal(move.y, 214);
  assert.equal(click.x, 321);
  assert.equal(click.y, 214);
});

test('fires hover enter/leave when the target changes', () => {
  const dom = setupDom('<div id="a"></div><div id="b"></div>');
  const { document } = dom.window;
  const a = document.getElementById('a');
  const b = document.getElementById('b');
  const { VirtualPointer, HOVER_CLASS } = loadPointer();

  const seen = [];
  for (const [name, el] of [['a', a], ['b', b]]) {
    el.addEventListener('pointerover', () => seen.push(`over:${name}`));
    el.addEventListener('pointerout', () => seen.push(`out:${name}`));
    el.addEventListener('pointerenter', () => seen.push(`enter:${name}`));
    el.addEventListener('pointerleave', () => seen.push(`leave:${name}`));
  }

  const pointer = new VirtualPointer();
  stubHitTest(dom, a);
  pointer.move(5, 5);
  assert.ok(a.classList.contains(HOVER_CLASS), 'hover class lands on the first element');

  stubHitTest(dom, b);
  pointer.move(6, 6);

  assert.deepEqual(seen, ['over:a', 'enter:a', 'out:a', 'leave:a', 'over:b', 'enter:b']);
  assert.equal(a.classList.contains(HOVER_CLASS), false);
  assert.ok(b.classList.contains(HOVER_CLASS));
});

test('two quick clicks produce a dblclick, slow ones do not', () => {
  const dom = setupDom('<div id="d"></div>');
  const target = dom.window.document.getElementById('d');
  stubHitTest(dom, target);
  const { VirtualPointer } = loadPointer();

  let doubles = 0;
  target.addEventListener('dblclick', () => { doubles += 1; });

  const pointer = new VirtualPointer({ doubleClickMs: 400 });
  pointer.move(50, 50);
  pointer.press(0); pointer.release();
  pointer.press(0); pointer.release();
  assert.equal(doubles, 1);

  // Far away: counts as a fresh first click.
  pointer.move(400, 400);
  pointer.press(0); pointer.release();
  assert.equal(doubles, 1);
});

test('the secondary button produces contextmenu and no click', () => {
  const dom = setupDom('<div id="d"></div>');
  const target = dom.window.document.getElementById('d');
  stubHitTest(dom, target);
  const { VirtualPointer } = loadPointer();

  let context = 0;
  let clicks = 0;
  target.addEventListener('contextmenu', (e) => { context += 1; assert.equal(e.button, 2); });
  target.addEventListener('click', () => { clicks += 1; });

  const pointer = new VirtualPointer();
  pointer.move(30, 30);
  pointer.contextMenu();

  assert.equal(context, 1);
  assert.equal(clicks, 0);
});

test('a drag keeps delivering moves to the press target after leaving it', () => {
  const dom = setupDom('<div id="handle"></div><div id="other"></div>');
  const { document } = dom.window;
  const handle = document.getElementById('handle');
  const other = document.getElementById('other');
  const { VirtualPointer } = loadPointer();

  const moves = [];
  handle.addEventListener('pointermove', () => moves.push('handle'));
  other.addEventListener('pointermove', () => moves.push('other'));

  const pointer = new VirtualPointer();
  stubHitTest(dom, handle);
  pointer.move(10, 10);
  pointer.press(0);

  // Cursor travels over a different element while the button is held.
  stubHitTest(dom, other);
  pointer.move(200, 200);
  pointer.move(260, 240);

  assert.deepEqual(moves, ['handle', 'handle', 'handle']);
  pointer.release();
});

test('cancel aborts a press without producing a click', () => {
  const dom = setupDom('<div id="d"></div>');
  const target = dom.window.document.getElementById('d');
  stubHitTest(dom, target);
  const { VirtualPointer } = loadPointer();

  let clicks = 0;
  let cancels = 0;
  target.addEventListener('click', () => { clicks += 1; });
  target.addEventListener('pointercancel', () => { cancels += 1; });

  const pointer = new VirtualPointer();
  pointer.move(10, 10);
  pointer.press(0);
  pointer.cancel();

  assert.equal(clicks, 0);
  assert.equal(cancels, 1);
});
