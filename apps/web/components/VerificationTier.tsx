"use client";
/* Badge-tier presentation of verification (none → gray → green) with a checklist.
 * Replaces the old percentage ring: trust is a tier you reach, not a score. */
import Link from "next/link";
import { BadgeCheck, Check, ChevronRight, ShieldQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

export type TierItem = { key: string; label: string; done: boolean; tier: "gray" | "green"; detail?: string; href?: string };
export type Tier = {
  level: "none" | "gray" | "green" | string; label: string; next: "gray" | "green" | null; status: string;
  eligible: { gray: boolean; green: boolean }; done: number; items: TierItem[];
};

const LEVEL_STYLE: Record<string, { ring: string; fg: string; bg: string; name: string }> = {
  green: { ring: "var(--success)", fg: "text-success", bg: "color-mix(in srgb, var(--success) 14%, transparent)", name: "Green badge" },
  gray: { ring: "var(--muted)", fg: "text-muted", bg: "color-mix(in srgb, var(--muted) 14%, transparent)", name: "Gray badge" },
  none: { ring: "var(--border)", fg: "text-muted", bg: "var(--surface-2)", name: "Not verified yet" },
};

/** Round emblem showing the current tier — used on Verification, Dashboard stat and Trust card. */
export function TierEmblem({ level, size = 64 }: { level?: string | null; size?: number }) {
  const st = LEVEL_STYLE[level || "none"] || LEVEL_STYLE.none!;
  const Icon = level === "gray" || level === "green" ? BadgeCheck : ShieldQuestion;
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full", st.fg)}
      style={{ width: size, height: size, background: st.bg, boxShadow: `inset 0 0 0 2px ${st.ring}`, borderStyle: level && level !== "none" ? undefined : "dashed" }}>
      <Icon style={{ width: size * 0.48, height: size * 0.48 }} strokeWidth={2} />
    </span>
  );
}

/** Three-step track: None · Gray · Green */
export function TierTrack({ level }: { level?: string | null }) {
  const idx = level === "green" ? 2 : level === "gray" ? 1 : 0;
  const steps = [["none", "Unverified"], ["gray", "Gray"], ["green", "Green"]] as const;
  return (
    <div className="flex items-center gap-1.5" aria-label={`Badge tier: ${steps[idx]![1]}`}>
      {steps.map(([k, l], i) => (
        <div key={k} className="flex items-center gap-1.5">
          {i > 0 && <span className={cn("h-0.5 w-5 rounded-full sm:w-8", i <= idx ? (idx === 2 ? "bg-success" : "bg-muted") : "bg-surface-2")} />}
          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors",
            i === idx ? (k === "green" ? "pill-green" : "bg-surface-2 text-foreground") : i < idx ? "text-foreground" : "text-muted")}>{l}</span>
        </div>
      ))}
    </div>
  );
}

export function TierChecklist({ tier, compact = false }: { tier: Tier; compact?: boolean }) {
  const groups: ("gray" | "green")[] = ["gray", "green"];
  return (
    <div className={cn("grid gap-4", !compact && "sm:grid-cols-2")}>
      {groups.map((g) => {
        const items = tier.items.filter((i) => i.tier === g);
        const reached = g === "gray" ? tier.level === "gray" || tier.level === "green" : tier.level === "green";
        return (
          <div key={g}>
            <p className="eyebrow mb-1.5 flex items-center gap-1.5">
              <BadgeCheck className={cn("h-3.5 w-3.5", g === "green" ? "text-success" : "text-muted")} />
              {g === "gray" ? "Gray badge" : "Green badge"}{reached ? " · reached" : tier.eligible[g] ? " · eligible" : ""}
            </p>
            <ul className="space-y-0.5">
              {items.map((i) => {
                const row = (
                  <>
                    <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                      i.done ? "border-transparent bg-success text-white" : "border-border bg-surface")}>
                      {i.done && <Check className="h-3 w-3" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm", i.done ? "text-muted line-through decoration-border" : "font-medium")}>{i.label}</span>
                      {i.detail && !compact && <span className="block text-xs text-muted">{i.detail}</span>}
                    </span>
                    {!i.done && i.href && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />}
                  </>
                );
                return (
                  <li key={i.key}>
                    {!i.done && i.href
                      ? <Link href={i.href} className="group -mx-2 flex items-start gap-2.5 rounded-xl px-2 py-1.5 nav-hover">{row}</Link>
                      : <div className="-mx-2 flex items-start gap-2.5 px-2 py-1.5">{row}</div>}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
