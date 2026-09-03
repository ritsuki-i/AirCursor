const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

test('moving the visible grab pointer moves a smooth-scrolling page', () => {
  const dom = new JSDOM(
    '<!doctype html><style>html{scroll-behavior:smooth}</style><body><main></main></body>',
    { pretendToBeVisual: true }
  );
  global.window = dom.window;
  global.document = dom.window.document;

  const root = document.documentElement;
  Object.defineProperty(document, 'scrollingElement', { value: root });
  Object.defineProperty(root, 'scrollHeight', { value: 3000 });
  Object.defineProperty(window, 'innerHeight', { value: 800 });

  const { GrabScroller } = require('../dist/cjs/core/scroller.js');
  const scroller = new GrabScroller({ horizontal: false, followTau: 0.001 });
  scroller.begin({ x: 400, y: 500 }, document.querySelector('main'));
  assert.equal(root.style.getPropertyValue('scroll-behavior'), 'auto');

  // The on-screen pointer moved upward by 100 px while grab remained active.
  scroller.update({ x: 400, y: 400 });
  scroller.tick(1 / 60);

  assert.ok(root.scrollTop > 200, `expected page scrollTop to change, got ${root.scrollTop}`);
  scroller.cancel();
  assert.equal(root.style.getPropertyValue('scroll-behavior'), '');

  dom.window.close();
  delete global.window;
  delete global.document;
});
