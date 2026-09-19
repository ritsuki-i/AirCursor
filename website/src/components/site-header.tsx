"use client";

import { useState } from "react";
import { Brand, Icon } from "./icons";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return <header className="site-header">
    <a href="#" aria-label="AirCursor home"><Brand /></a>
    <nav className={open ? "navigation is-open" : "navigation"} aria-label="Main navigation">
      <a href="#capabilities" onClick={() => setOpen(false)}>Features</a>
      <a href="https://github.com/ritsuki-i/AirCursor#readme">Docs</a>
      <a href="#possibilities" onClick={() => setOpen(false)}>Showcase</a>
    </nav>
    <div className="header-actions"><a className="header-cta" href="#install">Get Started <Icon width="15" height="15" /></a><button className="menu-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Close" : "Menu"}</button></div>
  </header>;
}
