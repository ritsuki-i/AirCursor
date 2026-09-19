"use client";

import { useState } from "react";
import { Icon } from "./icons";

const scenes = [
  { title: "Creative websites", name: "Aether", description: "Let visitors become part of the composition.", label: "01 / CREATIVE CANVAS", glyph: "A", className: "aether" },
  { title: "Interactive installations", name: "Forma", description: "Turn a screen into a space people can play with.", label: "02 / SPATIAL EXPERIENCE", glyph: "F", className: "forma" },
  { title: "Touchless interfaces", name: "Orbit", description: "Give everyday interfaces a new way to respond.", label: "03 / EVERYDAY INTERACTION", glyph: "O", className: "orbit" },
];

export function InteractionLab() {
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const scene = scenes[selected];
  return <section className="section lab-section" id="possibilities" aria-labelledby="lab-title">
    <div className="section-heading"><div><div className="eyebrow">03 / POSSIBILITIES</div><h2 id="lab-title">A gesture is just<br />the beginning.</h2></div><p>Same web. A different kind of connection.<br />Imagine what you could put within reach.</p></div>
    <div className="lab-layout">
      <div className={`demo-browser ${scene.className} ${expanded ? "is-expanded" : ""}`}>
        <div className="browser-chrome"><div><i /><i /><i /></div><span>an idea, brought to life</span><Icon name="code" width="14" height="14" /></div>
        <div className="demo-content"><span className="demo-wordmark">{scene.name.toLowerCase()}®</span><span className="demo-edition">EXPLORATIONS — VOL. 01</span><div className="demo-art" aria-hidden="true"><i /><i /><i /><span>{scene.glyph}</span></div><div className="demo-caption"><div><span>{scene.label}</span><h3>{expanded ? "You’re part of it." : "Made to be felt."}</h3></div><button aria-label={expanded ? "Reset composition" : "Transform composition"} aria-pressed={expanded} onClick={() => setExpanded(!expanded)}><Icon name={expanded ? "close" : "arrow"} /></button></div></div>
        <div className="demo-footer"><i className="live-dot" /><span>A REAL INTERFACE. TRY THE ARROW.</span><span>POWERED BY AIRCURSOR</span></div>
      </div>
      <div className="scene-options" aria-label="Example scenes">{scenes.map((item, index) => <button key={item.name} className={selected === index ? "scene-option is-selected" : "scene-option"} onClick={() => { setSelected(index); setExpanded(false); }} aria-pressed={selected === index}><span className="scene-number">0{index+1}</span><span><strong>{item.title}</strong><span>{item.description}</span></span><Icon /></button>)}<p className="lab-note"><Icon name="hand" width="18" height="18" />Camera enabled? These buttons respond to your hand, too.</p></div>
    </div>
  </section>;
}
