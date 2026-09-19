"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { advanceField, initialField, type FieldInput, type Phase } from "@/lib/gravity";
import { DESKTOP_BUDGET, FALLBACK_BUDGET, FIXED_STEP, MOBILE_BUDGET, ParticleField } from "@/lib/particle-field";
import { WebGLFieldRenderer, type FieldRenderer } from "@/lib/field-renderer";
import { CanvasFieldRenderer } from "@/lib/canvas-field-renderer";

interface Props { input: RefObject<FieldInput>; paused: boolean; reduced: boolean; onPhase: (phase: Phase) => void }

export function GravityField({ input, paused, reduced, onPhase }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLCanvasElement>(null);
  const controls = useRef({ paused, reduced, onPhase });
  const [fallback, setFallback] = useState(false);
  useEffect(() => { controls.current = { paused, reduced, onPhase }; }, [paused, reduced, onPhase]);

  useEffect(() => {
    const container = containerRef.current, canvas = canvasRef.current, alternate = fallbackRef.current;
    if (!container || !canvas || !alternate) return;
    const state = initialField();
    let renderer: FieldRenderer;
    let isFallback = false;
    try { renderer = new WebGLFieldRenderer(canvas); }
    catch (error) { console.warn("Gravity field: using the Canvas renderer.", error); renderer = new CanvasFieldRenderer(alternate); isFallback = true; }
    setFallback(isFallback);
    const rect = container.getBoundingClientRect();
    const budget = isFallback ? FALLBACK_BUDGET : rect.width < 650 ? MOBILE_BUDGET : DESKTOP_BUDGET;
    // Created once. IDs, positions, velocities and histories survive every phase.
    const field = new ParticleField(budget, rect.width / Math.max(1, rect.height));
    let raf = 0, last = 0, accumulator = 0, visible = true, dirty = true;
    let lastPhase: Phase = "ambient", lastReduced = controls.current.reduced;
    let quality = 1, slowFrames = 0;
    const resize = () => {
      const box = container.getBoundingClientRect();
      field.aspect = box.width / Math.max(1, box.height);
      const dpr = quality * Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1_600_000 / Math.max(1, box.width * box.height)));
      renderer.resize(box.width, box.height, dpr);
      dirty = true;
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(container);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; last = 0; accumulator = 0; });
    intersection.observe(container);
    const contextLost = (event: Event) => {
      event.preventDefault();
      renderer.dispose(); renderer = new CanvasFieldRenderer(alternate);
      isFallback = true; setFallback(true); resize();
    };
    canvas.addEventListener("webglcontextlost", contextLost);

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) { last = 0; accumulator = 0; return; }
      const delta = last ? Math.min((now - last) / 1000, .05) : 1 / 60;
      last = now;
      const current = controls.current;
      if (lastReduced !== current.reduced) { lastReduced = current.reduced; dirty = true; }
      if (current.paused && !dirty) return;
      if (!current.paused) {
        accumulator += delta;
        while (accumulator >= FIXED_STEP) {
          advanceField(state, input.current, FIXED_STEP, current.reduced ? undefined : field);
          if (!current.reduced) field.step(state, FIXED_STEP);
          accumulator -= FIXED_STEP;
        }
      }
      if (state.phase !== lastPhase) { lastPhase = state.phase; current.onPhase(state.phase); dirty = true; }
      container.dataset.phase = state.phase;
      container.dataset.elapsed = state.elapsed.toFixed(3);
      container.dataset.particles = String(field.lights.length);
      container.dataset.streams = String(field.streams.length);
      container.dataset.captured = field.captureFraction.toFixed(3);
      container.dataset.renderer = isFallback ? "canvas-2d" : "webgl-particles";
      // Reduced motion freezes the bodies; state changes remain accessible.
      if (current.reduced && !dirty && (state.phase === "ambient" || state.phase === "detection")) return;
      slowFrames = delta > .043 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
      if (slowFrames > 45 && quality > .7) { quality *= .85; resize(); slowFrames = 0; }
      renderer.draw(field, state, current.reduced);
      dirty = false;
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); observer.disconnect(); intersection.disconnect();
      canvas.removeEventListener("webglcontextlost", contextLost); renderer.dispose();
    };
  }, [input]);

  return <div ref={containerRef} className={`gravity-field ${fallback ? "is-fallback" : ""}`} aria-hidden="true">
    <canvas ref={canvasRef} className="webgl-canvas" />
    <canvas ref={fallbackRef} className="fallback-canvas" />
  </div>;
}
