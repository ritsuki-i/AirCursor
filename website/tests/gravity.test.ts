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
