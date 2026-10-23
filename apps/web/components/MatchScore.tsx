"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type BreakdownItem = {
  key: string; label: string; max: number; points: number; weight: number; applies: boolean; value: number;
};
export type MatchResult = {
  score: number | null;
  insufficient?: boolean;
  label?: string;
  prompts?: { text: string; href?: string }[] | string[];
  breakdown?: BreakdownItem[];
  counts?: { met: number; partial: number; missing: number };
  top_gaps?: string[];
  top_matches?: string[];
};

export function scoreTone(score: number | null | undefined) {
  if (score == null) return { text: "text-muted", ring: "var(--muted)", pill: "pill-gray" };
  if (score >= 75) return { text: "text-success", ring: "var(--success)", pill: "pill-green" };
  if (score >= 50) return { text: "text-accent", ring: "var(--accent)", pill: "pill-blue" };
  if (score >= 30) return { text: "text-warning", ring: "var(--warning)", pill: "pill-amber" };
  return { text: "text-danger", ring: "var(--danger)", pill: "pill-red" };
}

function promptText(p: { text: string; href?: string } | string) {
  return typeof p === "string" ? { text: p, href: undefined } : p;
}

/** Ring + number. Hover (desktop) or tap (mobile) reveals the weighted breakdown. */
export function MatchScore({
  match, size = 48, align = "right",
}: { match: MatchResult | null | undefined; size?: number; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  const insufficient = !match || match.insufficient || match.score == null;
  const score = insufficient ? null : Math.round(match!.score as number);
  const tone = scoreTone(score);
  const stroke = Math.max(3, Math.round(size / 12));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = score ?? 0;

  return (
    <div ref={ref} data-match-score className="relative inline-flex"
      onMouseEnter={() => window.matchMedia("(hover: hover)").matches && setOpen(true)}
      onMouseLeave={() => window.matchMedia("(hover: hover)").matches && setOpen(false)}>
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); }}
        aria-label={score != null ? `${score}% match — show breakdown` : "Not enough data — show what's needed"}
        className="relative flex items-center justify-center rounded-full" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
          {score != null && (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone.ring} strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c}
              style={{ transition: "stroke-dashoffset .8s cubic-bezier(.2,.7,.2,1)" }} />
          )}
        </svg>
        <span className={cn("absolute inset-0 flex items-center justify-center font-semibold tabular", tone.text)}
          style={{ fontSize: Math.round(size * 0.3) }}>
          {score != null ? score : "—"}
        </span>
      </button>
      {open && (
        <div className={cn("animate-in absolute top-full z-50 mt-2 w-72 rounded-2xl border border-border bg-surface p-4 text-left",
          align === "right" ? "right-0" : "left-0")} style={{ boxShadow: "var(--shadow-hover)" }}
          onClick={(e) => e.stopPropagation()}>
          <MatchBreakdown match={match} />
        </div>
      )}
    </div>
  );
}

export function MatchBreakdown({ match, compact = false }: { match: MatchResult | null | undefined; compact?: boolean }) {
  if (!match) return <p className="text-sm text-muted">No match data yet.</p>;
  const insufficient = match.insufficient || match.score == null;
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">{insufficient ? "Not enough to score yet" : match.label || "Match"}</p>
        {!insufficient && <p className={cn("text-sm font-semibold tabular", scoreTone(match.score).text)}>{Math.round(match.score!)}%</p>}
      </div>
      {insufficient && (match.prompts?.length ?? 0) > 0 && (
        <ul className="space-y-1.5">
          {match.prompts!.map((p, i) => {
            const { text, href } = promptText(p);
            return (
              <li key={i} className="text-sm text-muted">
                {href ? <Link href={href} className="link">{text}</Link> : text}
              </li>
            );
          })}
        </ul>
      )}
      {!insufficient && match.breakdown && (
        <ul className="space-y-2">
          {match.breakdown.filter((b) => b.applies !== false).map((b) => {
            const frac = b.max > 0 ? Math.min(1, b.points / b.max) : 0;
            return (
              <li key={b.key}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-muted">{b.label}</span>
                  <span className="tabular font-medium">{Math.round(b.points)}<span className="text-muted">/{Math.round(b.max)}</span></span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full" style={{ width: `${frac * 100}%`, background: scoreTone(frac * 100).ring, transition: "width .6s ease" }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!compact && match.counts && (
        <p className="text-xs text-muted">
          {match.counts.met} met · {match.counts.partial} partial · {match.counts.missing} missing
        </p>
      )}
      {!compact && !insufficient && (match.top_gaps?.length ?? 0) > 0 && (
        <p className="text-xs text-muted">Gaps: <span className="text-foreground">{match.top_gaps!.slice(0, 3).join(", ")}</span></p>
      )}
    </div>
  );
}
