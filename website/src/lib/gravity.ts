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
