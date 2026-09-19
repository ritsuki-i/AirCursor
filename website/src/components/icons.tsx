import type { SVGProps } from "react";
type Props = SVGProps<SVGSVGElement> & { name?: "arrow" | "github" | "hand" | "copy" | "check" | "play" | "pause" | "close" | "cursor" | "code" | "shield" };
export function Icon({ name = "arrow", ...props }: Props) {
  const paths: Record<NonNullable<Props["name"]>, React.ReactNode> = {
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    github: <><path d="M9 19c-4.5 1.5-4.5-2.5-6-3m12 6v-3.9c0-1 .1-1.4-.5-2 3.3-.4 6.7-1.6 6.7-7.3A5.7 5.7 0 0 0 19.7 5a5.3 5.3 0 0 0-.1-3.7S18.3.9 15.7 2.7a13.5 13.5 0 0 0-7 0C6.1.9 4.8 1.3 4.8 1.3A5.3 5.3 0 0 0 4.7 5a5.7 5.7 0 0 0-1.5 3.8c0 5.7 3.4 6.9 6.7 7.3-.5.5-.6 1.1-.5 2V22" /></>,
    hand: <path d="M8 12V5a1.5 1.5 0 0 1 3 0v6-8a1.5 1.5 0 0 1 3 0v8-6a1.5 1.5 0 0 1 3 0v7-3a1.5 1.5 0 0 1 3 0v6a7 7 0 0 1-13 3l-4-6a1.6 1.6 0 0 1 2.5-2z" />,
    copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M15 8V3H3v13h5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    play: <path d="m8 5 11 7-11 7z" />,
    pause: <path d="M8 5v14M16 5v14" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    cursor: <path d="m5 3 15 10-7 1-3 7z" />,
    code: <path d="m7 7-5 5 5 5m10-10 5 5-5 5m-4-14-2 18" />,
    shield: <><path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6z" /><path d="m8 12 3 3 5-6" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
export function Brand() {
  return <span className="brand"><span className="brand-orb" aria-hidden="true" />AirCursor</span>;
}
