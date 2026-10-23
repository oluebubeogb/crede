import Link from "next/link";
import { Fragment } from "react";

const TOKEN = /(#[a-z0-9][a-z0-9-]{1,30}|@[a-z0-9_.]{2,40}|https?:\/\/[^\s<]+)/gi;

/** Plain text with #topics, @mentions and URLs linked. Never renders HTML. */
export function RichText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(TOKEN);
  return (
    <p className={className} style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
      {parts.map((p, i) => {
        if (!p) return null;
        if (/^#[a-z0-9]/i.test(p)) return <Link key={i} href={`/feed?topic=${encodeURIComponent(p.slice(1).toLowerCase())}`} className="link">{p}</Link>;
        if (/^@[a-z0-9_.]{2,}/i.test(p)) return <Link key={i} href={`/u/${encodeURIComponent(p.slice(1).replace(/\.$/, ""))}`} className="link">{p}</Link>;
        if (/^https?:\/\//i.test(p)) return <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="link break-all">{p.replace(/^https?:\/\//, "").slice(0, 48)}{p.length > 56 ? "…" : ""}</a>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </p>
  );
}
