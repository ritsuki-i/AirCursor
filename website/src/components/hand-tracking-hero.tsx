"use client";

import { useCallback, useEffect, useState, type PointerEvent } from "react";
import { useAirCursor } from "./air-cursor-provider";
import { GravityField } from "./gravity-field";
import { Icon } from "./icons";
import { PHASES, type Phase } from "@/lib/gravity";

const labels: Record<Phase, string> = {
  ambient: "A SPACE WAITING FOR YOU", detection: "HAND DETECTED", attraction: "DRAWING THE UNIVERSE CLOSER",
  compression: "ENERGY IN YOUR HANDS", silence: "LIGHT READY · CLICK TO RELEASE", rupture: "LET IT GO", afterglow: "BACK TO THE QUIET",
};

export function HandTrackingHero() {
  const { input, surface, status, error, start, stop } = useAirCursor();
  const [phase, setPhase] = useState<Phase>("ambient");
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const onPhase = useCallback((next: Phase) => setPhase(next), []);
  const cameraOn = ["loading", "ready", "tracking"].includes(status);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(media.matches);
    sync(); media.addEventListener("change", sync);
    const release = () => { if (!cameraOn) input.current.pressed = false; };
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => { media.removeEventListener("change", sync); window.removeEventListener("pointercancel", release); window.removeEventListener("blur", release); };
  }, [input, cameraOn]);

  function move(event: PointerEvent<HTMLElement>) {
    if (cameraOn || input.current.demo || !event.isTrusted) return;
    if ((event.target as Element).closest("a, button")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    input.current.x = (event.clientX-rect.left)/rect.width;
    input.current.y = (event.clientY-rect.top)/rect.height;
    input.current.detected = true;
    input.current.pressed = true;
  }
  function preview() {
    setPaused(false);
    if (["attraction", "compression", "silence"].includes(phase)) { input.current.launch = true; return; }
    input.current.x = .67;
    input.current.y = .54;
    input.current.demo = true;
  }

  return <section ref={surface} id="experience" className="hero" data-phase={phase} aria-labelledby="hero-title"
    onPointerMove={move}
    onPointerDown={event => {
      if (cameraOn || !event.isTrusted || event.button !== 0 || (event.target as Element).closest("a, button")) return;
      move(event); input.current.launch = true; setPaused(false);
    }}
    onPointerLeave={() => { if (!cameraOn) { input.current.detected = false; input.current.pressed = false; } }}>
    <GravityField input={input} paused={paused} reduced={reduced} onPhase={onPhase} />
    <div className="hero-copy">
      <h1 id="hero-title">Move <em>your hand.</em><br />Move the Web.</h1>
      <p lang="ja">手を動かすだけで、<br />Web はもっと自由になる。</p>
      <span className="hero-product-note">A touchless interaction library for the web.</span>
    </div>
    <div className="hero-controls">
      <div className="hero-actions">
        <button className="button button-primary" onClick={cameraOn ? stop : start}>
          <Icon name={cameraOn ? "close" : "hand"} />{status === "loading" ? "Cancel camera" : cameraOn ? "Stop camera" : "Enable hand tracking"}<Icon />
        </button>
        <button className="text-button" onClick={preview} disabled={["rupture", "afterglow"].includes(phase)}><Icon name="play" width="15" height="15" />{["attraction", "compression", "silence"].includes(phase) ? "Release the light" : "Play the experience"}</button>
      </div>
      <div className="privacy-note"><Icon name="shield" width="12" height="12" /> Your camera. Your device. Your space.</div>
      {error && <p className="camera-error" role="alert">{error}</p>}
      {cameraOn && <div className="camera-guidance" role="status"><i className="live-dot" />{status === "loading" ? "Allow camera access. Loading hand tracking…" : status === "ready" ? "Show your right hand. Bring index and middle fingertips together." : "Point to gather and compress. Add your thumb to release the light."}</div>}
    </div>

    <div className="hero-bottom">
      <a href="#about" className="scroll-cue"><span className="scroll-line" /><span>SCROLL<br />TO EXPLORE</span><span className="scroll-orb" /></a>
      <div className="field-status" role="status" aria-live="polite"><span>{paused ? "THE FIELD IS PAUSED" : labels[phase]}</span><div className="phase-track" aria-hidden="true">{PHASES.map((step, index) => <i key={step} className={index <= PHASES.indexOf(phase) ? "is-lit" : ""} />)}</div></div>
      <button className="pause-button" aria-label={paused ? "Resume animation" : "Pause animation"} aria-pressed={paused} onClick={() => setPaused(value => !value)}><Icon name={paused ? "play" : "pause"} width="15" height="15" /></button>
    </div>
    <div className="interaction-hint"><span>{cameraOn ? "POINT TO GATHER · CLICK TO RELEASE" : "MOVE TO GATHER · CLICK TO RELEASE"}</span></div>
  </section>;
}
