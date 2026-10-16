"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { api, getSession } from "@/lib/api";
import { TextAction } from "@/components/ui/TextAction";
import { SignInContinue } from "@/components/SignInContinue";
import { cn } from "@/lib/utils";
import { ActivityGraph, parseActivityDate, type ActivityPoint } from "@/components/ActivityGraph";

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

function parseActivityDate(v?: string | null): Date | null {
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
      const d = parseActivityDate(e.start_date);
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
      const d = parseActivityDate(s.acquired_at) || parseActivityDate(s.created_at);
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
      const d = parseActivityDate(c.issued_at) || parseActivityDate(c.created_at);
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
      const d = parseActivityDate(doc.created_at);
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
        <ActivityGraph
          points={activityPoints}
          emptyMessage="Add timeline, skills, certifications, or generate a CV to see your activity graph."
        />
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
