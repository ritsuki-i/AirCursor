import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AirCursor — Move your hand. Move the Web.",
  description: "A touchless interaction library for the web. Explore a living gravity field with your hand, then bring AirCursor to your own interface.",
  openGraph: { title: "AirCursor — Move your hand. Move the Web.", description: "Touch nothing. Create a new dimension of interaction.", type: "website" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a>{children}</body></html>;
}
