import { AirCursorProvider } from "@/components/air-cursor-provider";
import { HandTrackingHero } from "@/components/hand-tracking-hero";
import { SiteHeader } from "@/components/site-header";
import { InteractionLab } from "@/components/interaction-lab";
import { InstallSection } from "@/components/install-section";
import { Brand, Icon } from "@/components/icons";

function CapabilityArt({ type }: { type: "gesture" | "events" | "private" }) {
  return <div className={`capability-art art-${type}`} aria-hidden="true">{type === "gesture" ? <><div className="gesture-path" /><div className="gesture-point"><Icon name="cursor" width="23" height="23" /></div><span className="art-label">a natural extension of you</span></> : type === "events" ? <><span className="event-tag">your gesture</span><div className="event-connector"><i /><i /><i /></div><span className="event-tag event-code">onPointerDown</span></> : <><div className="privacy-orbit"><Icon name="shield" width="32" height="32" /></div><span className="art-label">your camera → your browser</span></>}</div>;
}

export default function Home() {
  return <AirCursorProvider><SiteHeader /><main id="main">
    <HandTrackingHero />
    <div className="principles-strip"><span>BUILT FOR A MORE HUMAN WEB</span><span><i /> Browser-native</span><span><i /> No extra hardware</span><span><i /> Private by design</span><span className="strip-open">Open source, always. <Icon name="github" width="15" height="15" /></span></div>
    <section className="section about-section" id="about" aria-labelledby="about-title"><div className="eyebrow">01 / BEYOND THE SCREEN</div><div className="about-content"><h2 id="about-title">The most natural interface<br />was always <span>in your hands.</span></h2><div className="about-bottom"><p>AirCursor turns your webcam into a new way to interact. Move, click, drag, and scroll with simple hand gestures—on the web you already build.</p><p>A small npm library.<br />An entirely new connection.</p></div></div></section>
    <section className="section capabilities-section" id="capabilities" aria-labelledby="capabilities-title"><div className="section-heading"><div><div className="eyebrow">02 / HUMAN INPUT. WEB OUTPUT.</div><h2 id="capabilities-title">Simple gestures.<br />Extraordinary possibilities.</h2></div><a className="text-link" href="https://github.com/ritsuki-i/AirCursor#gestures">Explore the gestures <Icon /></a></div><div className="capability-grid">{[
      { type: "gesture" as const, n: "01", title: "Intuition, built in.", text: "Point to move. Bring your thumb in to click. Hold to drag. Familiar intentions, without a surface." },
      { type: "events" as const, n: "02", title: "Your UI. Already compatible.", text: "Real pointer event sequences connect gestures to the buttons, menus, and interactions you already use." },
      { type: "private" as const, n: "03", title: "A little camera. A lot of trust.", text: "Hand tracking runs in your browser. Your video stays on your device. All you need is a webcam." },
    ].map(item => <article className="capability-card" key={item.n}><CapabilityArt type={item.type} /><div className="capability-card-copy"><span>{item.n} /</span><h3>{item.title}</h3><p>{item.text}</p></div></article>)}</div></section>
    <InteractionLab /><InstallSection />
    <section className="closing-section" aria-labelledby="closing-title"><div className="closing-orbit" aria-hidden="true" /><div className="eyebrow">THE NEXT INTERACTION IS YOURS.</div><h2 id="closing-title">Make room for<br /><span>a little wonder.</span></h2><a className="button button-primary" href="#install">Start building with AirCursor <Icon /></a><a className="closing-github" href="https://github.com/ritsuki-i/AirCursor"><Icon name="github" width="16" height="16" /> Open source. Open possibilities.</a></section>
  </main><footer className="site-footer"><a href="#" aria-label="Back to top"><Brand /></a><span>A little movement changes everything.</span><div><a href="https://github.com/ritsuki-i/AirCursor">GitHub ↗</a><a href="https://github.com/ritsuki-i/AirCursor#readme">Docs ↗</a><a href="https://github.com/ritsuki-i/AirCursor/blob/main/LICENSE">MIT License ↗</a></div><small>© {new Date().getFullYear()} AirCursor</small></footer></AirCursorProvider>;
}
