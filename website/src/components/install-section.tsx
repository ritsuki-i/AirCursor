"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
const commands = { npm: "npm install air-cursor", pnpm: "pnpm add air-cursor", yarn: "yarn add air-cursor" };

export function InstallSection() {
  const [manager, setManager] = useState<keyof typeof commands>("npm");
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try { await navigator.clipboard.writeText(commands[manager]); setCopied(true); setMessage("Command copied"); clearTimeout(timer.current); timer.current = setTimeout(() => { setCopied(false); setMessage(""); }, 2200); }
    catch { setMessage("Select the command to copy it manually."); }
  }
  return <section className="section install-section" id="install" aria-labelledby="install-title">
    <div className="install-copy"><div className="eyebrow">04 / MAKE IT YOURS</div><h2 id="install-title">Less setup.<br /><span>More possibility.</span></h2><p>Your UI already knows how to respond.<br />AirCursor gives it a new way to listen.</p><a className="text-link" href="https://github.com/ritsuki-i/AirCursor#readme">Read the documentation <Icon /></a><div className="install-tags"><span>React component</span><span>TypeScript ready</span><span>MIT license</span></div></div>
    <div className="code-panel"><div className="code-tabs" aria-label="Package manager">{(Object.keys(commands) as Array<keyof typeof commands>).map(name => <button key={name} aria-pressed={manager === name} onClick={() => { setManager(name); setCopied(false); setMessage(""); }}>{name}</button>)}<span>01 / INSTALL</span></div><div className="install-command"><span>$</span><code>{commands[manager]}</code><button onClick={copy} aria-label="Copy install command"><Icon name={copied ? "check" : "copy"} width="17" height="17" /></button></div><span className="copy-message" role="status">{message}</span><div className="code-file"><span><i /> app/air-control.tsx</span><span>02 / CONNECT</span></div><pre><code><span className="syntax-muted">{"'use client';"}</span>{"\n\n"}<span className="syntax-blue">import</span>{" AirCursor "}<span className="syntax-blue">from</span>{" "}<span className="syntax-mint">{'\'air-cursor\';'}</span>{"\n\n"}<span className="syntax-blue">export default function</span>{" AirControl() {\n  "}<span className="syntax-blue">return</span>{" <"}<span className="syntax-mint">AirCursor</span>{" />;\n}"}</code></pre><div className="code-footnote"><i className="live-dot" /> Add this component to your page. Let your hands take it from there.</div></div>
  </section>;
}
