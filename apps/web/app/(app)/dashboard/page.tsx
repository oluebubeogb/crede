"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { api, getSession } from "@/lib/api";
import { TextAction } from "@/components/ui/TextAction";
import { SignInContinue } from "@/components/SignInContinue";
import { cn } from "@/lib/utils";

type Dashboard = {
  profile: {
    full_name?: string;
    headline?: string;
    verification_score: number;
    profile_completion: number;
    industry?: string;
  };
  timeline_count: number;
  verified_docs: number;
  generated_cvs: number;
  recommended_actions: string[];
};

type TimelineEntry = {
  id: number;
  job_title: string;
  organization: string;
  start_date: string;
  end_date?: string | null;
  is_current?: boolean;
};

/* ── Circular progress (profile completion) ─────────────────────────────── */
function CircularProgress({
  value,
  size = 120,
  stroke = 10,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, value));
  const offset = c - (pct / 100) * c;
  const color =
    pct >= 80 ? "#10b981" : pct >= 50 ? "#3b82f6" : pct >= 25 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-border opacity-60"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums" style={{ color }}>
            {pct}%
          </span>
        </div>
      </div>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

/* ── Verification score arc ─────────────────────────────────────────────── */
function ScoreArc({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(max, Math.max(0, value)) / max;
  const w = 160;
  const h = 90;
  const r = 70;
  const cx = w / 2;
  const cy = h - 8;
  const start = Math.PI;
  const end = 0;
  const angle = start + (end - start) * pct;

  function polar(a: number) {
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }
  const bgStart = polar(Math.PI);
  const bgEnd = polar(0);
  const fgEnd = polar(angle);
  const large = pct > 0.5 ? 1 : 0;

  const color =
    value >= 70 ? "#10b981" : value >= 40 ? "#3b82f6" : value >= 20 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <path
          d={`M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 0 1 ${bgEnd.x} ${bgEnd.y}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={10}
          strokeLinecap="round"
          className="text-border opacity-60"
        />
        {pct > 0 && (
          <path
            d={`M ${bgStart.x} ${bgStart.y} A ${r} ${r} 0 ${large} 1 ${fgEnd.x} ${fgEnd.y}`}
            fill="none"
            stroke={color}
            strokeWidth={10}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        )}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          className="fill-foreground text-2xl font-semibold"
          style={{ fontSize: 28 }}
        >
          {value}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          className="fill-muted"
          style={{ fontSize: 11 }}
        >
          / {max}
        </text>
      </svg>
      <p className="text-sm text-muted">Verification score</p>
    </div>
  );
}

/* ── Career timeline bars by year ───────────────────────────────────────── */
function CareerChart({ entries }: { entries: TimelineEntry[] }) {
  const years = useMemo(() => {
    if (!entries.length) return [];
    const map = new Map<number, number>();
    const nowY = new Date().getFullYear();
    for (const e of entries) {
      const start = new Date(e.start_date).getFullYear();
      const end = e.is_current || !e.end_date ? nowY : new Date(e.end_date).getFullYear();
      for (let y = start; y <= end; y++) {
        map.set(y, (map.get(y) || 0) + 1);
      }
    }
    const sorted = [...map.entries()].sort((a, b) => a[0] - b[0]);
    // show last 8 years max
    return sorted.slice(-8);
  }, [entries]);

  const max = Math.max(1, ...years.map(([, n]) => n));
  const colors = ["#3b82f6", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ec4899", "#6366f1", "#14b8a6"];

  if (!years.length) {
    return (
      <div className="flex h-36 items-center justify-center text-sm text-muted">
        No career entries yet
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex h-36 items-end gap-2 sm:gap-3">
        {years.map(([year, count], i) => {
          const h = Math.max(12, (count / max) * 100);
          return (
            <div key={year} className="group flex flex-1 flex-col items-center gap-1.5">
              <span className="text-[10px] font-medium tabular-nums text-muted opacity-0 transition group-hover:opacity-100">
                {count}
              </span>
              <div
                className="w-full max-w-[36px] rounded-t-md transition-all duration-500 ease-out group-hover:opacity-90"
                style={{
                  height: `${h}%`,
                  background: colors[i % colors.length],
                  minHeight: 12,
                }}
                title={`${year}: ${count} role${count === 1 ? "" : "s"}`}
              />
              <span className="text-[11px] tabular-nums text-muted">{year}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-center text-sm text-muted">
        Career activity by year · {entries.length} entr{entries.length === 1 ? "y" : "ies"}
      </p>
    </div>
  );
}

/* ── Generated CVs mini chart ───────────────────────────────────────────── */
function CvsChart({ count }: { count: number }) {
  const bars = Math.min(12, Math.max(count, 1));
  const filled = Math.min(count, 12);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex h-28 items-end gap-1.5">
        {Array.from({ length: bars }).map((_, i) => {
          const active = i < filled;
          const heights = [40, 55, 70, 50, 85, 60, 75, 45, 90, 65, 80, 55];
          return (
            <div
              key={i}
              className={cn(
                "w-3 rounded-t transition-all duration-500",
                active ? "bg-violet-500 dark:bg-violet-400" : "bg-border"
              )}
              style={{
                height: `${heights[i % heights.length]}%`,
                opacity: active ? 1 : 0.4,
                transitionDelay: `${i * 40}ms`,
              }}
            />
          );
        })}
      </div>
      <div className="text-center">
        <p className="text-2xl font-semibold tabular-nums text-violet-600 dark:text-violet-400">
          {count}
        </p>
        <p className="text-sm text-muted">Generated CVs</p>
      </div>
    </div>
  );
}

/* ── Notebook section wrapper ───────────────────────────────────────────── */
function NoteSection({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-b border-border pb-8 pt-2", className)}>
      {children}
    </section>
  );
}

export default function DashboardPage() {
  const pathname = usePathname();
  const [data, setData] = useState<Dashboard | null>(null);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [signedOut, setSignedOut] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const session = await getSession();
        if (!session) {
          setSignedOut(true);
          setLoading(false);
          return;
        }
        const [dash, timeline] = await Promise.all([
          api<Dashboard>("/api/profile/dashboard"),
          api<TimelineEntry[]>("/api/timeline").catch(() => [] as TimelineEntry[]),
        ]);
        setData(dash);
        setEntries(Array.isArray(timeline) ? timeline : []);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (msg === "Unauthorized" || msg.toLowerCase().includes("not auth")) {
          setSignedOut(true);
        } else {
          // soft fail — still show signed-out style rather than tech errors
          setSignedOut(true);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <p className="py-12 text-sm text-muted">Loading dashboard…</p>;
  }

  if (signedOut || !data) {
    return <SignInContinue next={pathname} />;
  }

  const p = data.profile;
  const nextAction =
    data.timeline_count === 0
      ? { href: "/timeline", label: "Add your first career entry" }
      : p.verification_score < 30
        ? { href: "/verification", label: "Raise your verification score" }
        : { href: "/opportunities", label: "Browse matched opportunities" };

  const insights: string[] = [];
  if (data.timeline_count >= 2) {
    insights.push(
      "Professionals with similar verified timelines typically move into senior or cross-functional roles within 18–24 months."
    );
  }
  if (p.verification_score >= 40) {
    insights.push("Your verification score is competitive — recruiters filter for verified claims first.");
  } else if (data.timeline_count > 0) {
    insights.push("Adding employment proof for your latest role is the highest-leverage next step for trust.");
  }
  if (data.generated_cvs === 0 && data.timeline_count > 0) {
    insights.push("You have timeline data ready — generate a tailored CV for an open role in one step.");
  }

  return (
    <div className="space-y-0">
      {/* Header — notebook top */}
      <NoteSection>
        <h1 className="text-3xl font-semibold tracking-tight">
          Hello{p.full_name ? `, ${p.full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1.5 text-muted">{p.headline || "Complete your profile to get started."}</p>
      </NoteSection>

      {/* Metrics row — colorful charts, no boxes */}
      <NoteSection>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          <CircularProgress value={p.profile_completion} label="Profile completion" />
          <ScoreArc value={p.verification_score} />
          <div className="sm:col-span-2 lg:col-span-1">
            <CareerChart entries={entries} />
          </div>
          <CvsChart count={data.generated_cvs} />
        </div>
      </NoteSection>

      {/* Next step */}
      <NoteSection>
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          Most important next step
        </p>
        <TextAction href={nextAction.href} variant="primary" className="mt-2 text-base">
          {nextAction.label} →
        </TextAction>
      </NoteSection>

      {/* Insights */}
      {insights.length > 0 && (
        <NoteSection>
          <h2 className="mb-4 text-lg font-semibold">Career insights</h2>
          <ul className="space-y-3">
            {insights.map((insight) => (
              <li key={insight} className="border-b border-border/60 pb-3 text-sm text-muted last:border-0 last:pb-0">
                {insight}
              </li>
            ))}
          </ul>
        </NoteSection>
      )}

      {/* Recommended actions */}
      {data.recommended_actions?.length > 0 && (
        <NoteSection>
          <h2 className="mb-4 text-lg font-semibold">Recommended actions</h2>
          <ul className="space-y-2">
            {data.recommended_actions.map((a) => (
              <li key={a} className="text-sm text-foreground">
                <span className="mr-2 text-accent">→</span>
                {a}
              </li>
            ))}
          </ul>
        </NoteSection>
      )}

      {/* Quick links */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-6 text-sm">
        <TextAction href="/timeline" variant="primary">
          Career Timeline
        </TextAction>
        <span className="text-muted">·</span>
        <TextAction href="/opportunities" variant="secondary">
          Opportunities
        </TextAction>
        <span className="text-muted">·</span>
        <TextAction href="/generate" variant="secondary">
          Generate CV
        </TextAction>
        <span className="text-muted">·</span>
        <TextAction href="/verification" variant="muted">
          Verification
        </TextAction>
        <span className="text-muted">·</span>
        <TextAction href="/recruiter/dashboard" variant="muted">
          Recruiter portal
        </TextAction>
      </div>
    </div>
  );
}
