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
