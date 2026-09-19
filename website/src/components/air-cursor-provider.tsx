"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { AirCursorEngine, AirCursorState } from "air-cursor";
import { initialInput, type FieldInput } from "@/lib/gravity";

type CameraStatus = "off" | "loading" | "ready" | "tracking" | "error";
interface AirContext {
  input: RefObject<FieldInput>;
  surface: RefObject<HTMLElement | null>;
  status: CameraStatus;
  error: string;
  start: () => Promise<void>;
  stop: () => void;
}
const Context = createContext<AirContext | null>(null);

export function AirCursorProvider({ children }: { children: ReactNode }) {
  const input = useRef(initialInput());
  const surface = useRef<HTMLElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const engine = useRef<AirCursorEngine | null>(null);
  const generation = useRef(0);
  const starting = useRef(false);
  const [status, setStatus] = useState<CameraStatus>("off");
  const [error, setError] = useState("");

  const release = useCallback(() => {
    generation.current += 1;
    starting.current = false;
    engine.current?.stop(); engine.current = null;
    const stream = video.current?.srcObject;
    if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop());
    if (video.current) { video.current.srcObject = null; video.current.remove(); video.current = null; }
    input.current.detected = false; input.current.pressed = false; input.current.launch = false;
  }, []);
  const stop = useCallback(() => { release(); setStatus("off"); }, [release]);

  const start = useCallback(async () => {
    if (starting.current || engine.current) return;
    setError("");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Camera access needs HTTPS or localhost. You can still explore with your mouse, touch, or keyboard.");
      setStatus("error"); return;
    }
    starting.current = true; setStatus("loading");
    const token = ++generation.current;
    // Each attempt owns its video, so a late permission response cannot take
    // over a newer session or leave the canceled session's camera running.
    const sessionVideo = document.createElement("video");
    sessionVideo.muted = true; sessionVideo.playsInline = true;
    sessionVideo.className = "tracking-video"; sessionVideo.setAttribute("aria-hidden", "true");
    document.body.appendChild(sessionVideo); video.current = sessionVideo;
    const disposeVideo = () => {
      const stream = sessionVideo.srcObject;
      if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop());
      sessionVideo.srcObject = null; sessionVideo.remove();
    };
    let instance: AirCursorEngine | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const fail = (cause: unknown) => {
      if (token !== generation.current) return;
      console.warn("AirCursor could not start:", cause);
      release();
      const name = cause instanceof Error ? cause.name : "";
      setError(name === "NotAllowedError"
        ? "Camera permission was declined. Allow it in your browser to try again, or keep exploring with your mouse."
        : name === "NotFoundError"
          ? "No camera was found. The full field experience is available with your mouse, touch, or keyboard."
          : "The camera or hand model could not start. Check your camera and connection, then retry. Mouse mode is ready.");
      setStatus("error");
    };
    try {
      const { AirCursorEngine: Engine } = await import("air-cursor");
      if (token !== generation.current) { disposeVideo(); return; }
      let previousMode = "idle";
      instance = new Engine({
        video: sessionVideo,
        cursorElement: cursor.current,
        inferenceFps: 24,
        hands: { maxNumHands: 1, modelComplexity: 0 },
        regionSelectEnabled: false,
        modifierEnabled: false,
        onState: (hand: AirCursorState | null) => {
          if (token !== generation.current) return;
          setStatus(hand ? "tracking" : "ready");
          const rect = surface.current?.getBoundingClientRect();
          if (!hand || !rect) { input.current.detected = false; input.current.pressed = false; previousMode = "idle"; return; }
          const within = hand.x >= rect.left && hand.x <= rect.right && hand.y >= rect.top && hand.y <= rect.bottom;
          input.current.detected = within;
          if (within) {
            input.current.x = (hand.x-rect.left)/rect.width;
            input.current.y = (hand.y-rect.top)/rect.height;
          }
          input.current.pressed = within && hand.mode === "aim";
          if (within && hand.mode === "press" && previousMode === "aim") input.current.launch = true;
          previousMode = hand.mode;
        },
        onError: fail,
      });
      engine.current = instance;
      // Covers stalled permission/model loading; a late start is stopped below.
      timeout = setTimeout(() => fail(new Error("Camera start timed out")), 25_000);
      await instance.start();
      if (token !== generation.current) { instance.stop(); disposeVideo(); return; }
      setStatus("ready");
      const stream = sessionVideo.srcObject;
      if (stream instanceof MediaStream) stream.getVideoTracks().forEach(track => track.addEventListener("ended", stop, { once: true }));
    } catch (cause) { instance?.stop(); disposeVideo(); fail(cause); }
    finally { clearTimeout(timeout); if (token === generation.current) starting.current = false; }
  }, [release, stop]);

  useEffect(() => {
    const onHidden = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", stop);
    return () => { release(); document.removeEventListener("visibilitychange", onHidden); window.removeEventListener("pagehide", stop); };
  }, [release, stop]);

  return <Context.Provider value={{ input, surface, status, error, start, stop }}>
    {children}
    <div ref={cursor} className="air-hand-cursor" aria-hidden="true" />
  </Context.Provider>;
}

export function useAirCursor() {
  const context = useContext(Context);
  if (!context) throw new Error("useAirCursor requires AirCursorProvider");
  return context;
}
