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

type Skill = {
  id: number;
  name: string;
  acquired_at?: string | null;
  created_at?: string;
};

type Cert = {
  id: number;
  name: string;
  issued_at?: string | null;
  created_at?: string;
};

type Doc = {
  id: number;
  title: string;
  doc_type: string;
  created_at: string;
  target_job_title?: string | null;
};

type ActivityPoint = {
  id: string;
  date: Date;
  label: string;
  kind: "career" | "skill" | "cert" | "cv";
  detail?: string;
};

function CircularMetric({
  value,
  max = 100,
  size = 128,
  stroke = 11,
  label,
  display,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  label: string;
  display?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const targetOffset = c - (pct / 100) * c;
  const color =
    pct >= 80 ? "#10b981" : pct >= 50 ? "#3b82f6" : pct >= 25 ? "#f59e0b" : "#ef4444";
  const [offset, setOffset] = useState(targetOffset);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    setOffset(targetOffset);
  }, [targetOffset]);

  function play() {
    setOffset(c);
    // next frame animate to target
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setOffset(targetOffset));
    });
    setAnimKey((k) => k + 1);
  }

  return (
    <div
      className="flex flex-col items-center gap-3"
      onMouseEnter={play}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" key={animKey}>
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
            style={{ transition: "stroke-dashoffset 0.85s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums" style={{ color }}>
            {display ?? `${Math.round(pct)}%`}
          </span>
        </div>
      </div>
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

function CvsSummary({ count, recent }: { count: number; recent: Doc[] }) {
  return (
    <div className="flex min-h-[128px] flex-col items-center justify-center gap-2">
      <p className="text-4xl font-semibold tracking-tight tabular-nums text-violet-600 dark:text-violet-400">
        {count}
      </p>
      <p className="text-sm text-muted">Generated CVs</p>
      {recent.length > 0 && (
        <ul className="mt-1 w-full max-w-[200px] space-y-0.5 text-center">
          {recent.map((d) => (
            <li
              key={d.id}
              className="truncate text-[11px] leading-tight text-muted/80"
              title={d.title}
            >
              {d.target_job_title || d.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const KIND_META: Record<
  ActivityPoint["kind"],
  { y: number; color: string; label: string }
> = {
  career: { y: 0, color: "#3b82f6", label: "Career" },
  skill: { y: 1, color: "#10b981", label: "Skills" },
  cert: { y: 2, color: "#f59e0b", label: "Certs" },
  cv: { y: 3, color: "#8b5cf6", label: "CVs" },
};

function ActivityGraph({ points }: { points: ActivityPoint[] }) {
  const [hover, setHover] = useState<ActivityPoint | null>(null);

  const sorted = useMemo(
    () =>
      [...points]
        .filter((p) => !Number.isNaN(p.date.getTime()))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [points]
  );

  if (sorted.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted">
        Add timeline, skills, certifications, or generate a CV to see your activity graph.
      </div>
    );
  }

  const padL = 56;
  const padR = 24;
  const padT = 16;
  const padB = 36;
  const width = 800;
  const height = 260;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const laneH = plotH / 4;

  const tMin = sorted[0].date.getTime();
  const tMax = Math.max(sorted[sorted.length - 1].date.getTime(), tMin + 1);
  const span = tMax - tMin || 1;

  function xOf(d: Date) {
    return padL + ((d.getTime() - tMin) / span) * plotW;
  }
  function yOf(kind: ActivityPoint["kind"]) {
    return padT + KIND_META[kind].y * laneH + laneH / 2;
  }

  const tickCount = Math.min(6, Math.max(2, sorted.length));
  const ticks: Date[] = [];
  for (let i = 0; i < tickCount; i++) {
    ticks.push(new Date(tMin + (span * i) / (tickCount - 1 || 1)));
  }

  const byKind = (Object.keys(KIND_META) as ActivityPoint["kind"][]).map((kind) => ({
    kind,
    pts: sorted.filter((p) => p.kind === kind),
  }));

  function fmtTick(d: Date) {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  }

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted">
        {(Object.keys(KIND_META) as ActivityPoint["kind"][]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: KIND_META[k].color }}
            />
            {KIND_META[k].label}
          </span>
        ))}
      </div>
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full min-w-[520px]"
          role="img"
          aria-label="Career activity over time"
        >
          {(Object.keys(KIND_META) as ActivityPoint["kind"][]).map((k) => {
            const y = yOf(k);
            return (
              <g key={k}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={0.08}
                  strokeWidth={1}
                />
                <text
                  x={padL - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted"
                  style={{ fontSize: 11 }}
                >
                  {KIND_META[k].label}
                </text>
              </g>
            );
          })}

          <line
            x1={padL}
            y1={height - padB + 4}
            x2={width - padR}
            y2={height - padB + 4}
            stroke="currentColor"
            strokeOpacity={0.2}
            strokeWidth={1}
          />
          {ticks.map((t, i) => (
            <text
              key={i}
              x={xOf(t)}
              y={height - 10}
              textAnchor="middle"
              className="fill-muted"
              style={{ fontSize: 10 }}
            >
              {fmtTick(t)}
            </text>
          ))}

          {byKind.map(({ kind, pts }) => {
            if (pts.length < 2) return null;
            const d = pts
              .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.date)} ${yOf(kind)}`)
              .join(" ");
            return (
              <path
                key={kind}
                d={d}
                fill="none"
                stroke={KIND_META[kind].color}
                strokeWidth={2}
                strokeOpacity={0.45}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}

          {sorted.map((p) => {
            const cx = xOf(p.date);
            const cy = yOf(p.kind);
            const active = hover?.id === p.id;
            return (
              <g
                key={p.id}
                onMouseEnter={() => setHover(p)}
                onMouseLeave={() => setHover(null)}
                className="cursor-pointer"
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={active ? 7 : 5}
                  fill={KIND_META[p.kind].color}
                  stroke="var(--background)"
                  strokeWidth={2}
                  className="transition-all duration-150"
                />
              </g>
            );
          })}
        </svg>
      </div>
      {hover ? (
        <p className="mt-2 text-center text-sm text-foreground">
          <span className="font-medium">{hover.label}</span>
          {hover.detail ? <span className="text-muted"> · {hover.detail}</span> : null}
          <span className="text-muted">
            {" "}
            ·{" "}
            {hover.date.toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-center text-sm text-muted">
          Hover a point to inspect · {sorted.length} events across your timeline
        </p>
      )}
    </div>
  );
}

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

function parseDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default function DashboardPage() {
  const pathname = usePathname();
  const [data, setData] = useState<Dashboard | null>(null);
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [certs, setCerts] = useState<Cert[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
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
        const [dash, timeline, sk, cert, documents] = await Promise.all([
          api<Dashboard>("/api/profile/dashboard"),
          api<TimelineEntry[]>("/api/timeline").catch(() => [] as TimelineEntry[]),
          api<Skill[]>("/api/skills").catch(() => [] as Skill[]),
          api<Cert[]>("/api/certifications").catch(() => [] as Cert[]),
          api<{ items?: Doc[] } | Doc[]>("/api/documents?page_size=50").catch(() => ({ items: [] })),
        ]);
        setData(dash);
        setEntries(Array.isArray(timeline) ? timeline : []);
        setSkills(Array.isArray(sk) ? sk : []);
        setCerts(Array.isArray(cert) ? cert : []);
        const docList = Array.isArray(documents)
          ? documents
          : Array.isArray((documents as any)?.items)
            ? (documents as any).items
            : [];
        setDocs(docList);
      } catch {
        setSignedOut(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activityPoints = useMemo(() => {
    const pts: ActivityPoint[] = [];
    for (const e of entries) {
      const d = parseDate(e.start_date);
      if (d) {
        pts.push({
          id: `career-${e.id}`,
          date: d,
          label: e.job_title,
          detail: e.organization,
          kind: "career",
        });
      }
    }
    for (const s of skills) {
      const d = parseDate(s.acquired_at) || parseDate(s.created_at);
      if (d) {
        pts.push({
          id: `skill-${s.id}`,
          date: d,
          label: s.name,
          kind: "skill",
        });
      }
    }
    for (const c of certs) {
      const d = parseDate(c.issued_at) || parseDate(c.created_at);
      if (d) {
        pts.push({
          id: `cert-${c.id}`,
          date: d,
          label: c.name,
          kind: "cert",
        });
      }
    }
    for (const doc of docs) {
      if (doc.doc_type !== "cv") continue;
      const d = parseDate(doc.created_at);
      if (d) {
        pts.push({
          id: `cv-${doc.id}`,
          date: d,
          label: doc.target_job_title || doc.title,
          kind: "cv",
        });
      }
    }
    return pts;
  }, [entries, skills, certs, docs]);

  const recentCvs = useMemo(() => {
    return docs
      .filter((d) => d.doc_type === "cv")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 3);
  }, [docs]);

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
    insights.push(
      "Your verification score is competitive — recruiters filter for verified claims first."
    );
  } else if (data.timeline_count > 0) {
    insights.push(
      "Adding employment proof for your latest role is the highest-leverage next step for trust."
    );
  }
  if (data.generated_cvs === 0 && data.timeline_count > 0) {
    insights.push(
      "You have timeline data ready — generate a tailored CV for an open role in one step."
    );
  }

  return (
    <div className="space-y-0">
      <NoteSection>
        <h1 className="text-3xl font-semibold tracking-tight">
          Hello{p.full_name ? `, ${p.full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1.5 text-muted">
          {p.headline || "Complete your profile to get started."}
        </p>
      </NoteSection>

      <NoteSection className="pt-8">
        <div className="grid gap-10 sm:grid-cols-3">
          <CircularMetric value={p.profile_completion} label="Profile completion" />
          <CircularMetric
            value={p.verification_score}
            max={100}
            label="Verification score"
            display={`${p.verification_score}`}
          />
          <CvsSummary count={data.generated_cvs} recent={recentCvs} />
        </div>
      </NoteSection>

      <NoteSection className="pt-8">
        <h2 className="mb-4 text-lg font-semibold">Career activity</h2>
        <ActivityGraph points={activityPoints} />
      </NoteSection>

      <NoteSection>
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          Most important next step
        </p>
        <TextAction href={nextAction.href} variant="primary" className="mt-2 text-base">
          {nextAction.label} →
        </TextAction>
      </NoteSection>

      {insights.length > 0 && (
        <NoteSection>
          <h2 className="mb-4 text-lg font-semibold">Career insights</h2>
          <ul className="space-y-3">
            {insights.map((insight) => (
              <li
                key={insight}
                className="border-b border-border/60 pb-3 text-sm text-muted last:border-0 last:pb-0"
              >
                {insight}
              </li>
            ))}
          </ul>
        </NoteSection>
      )}

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
