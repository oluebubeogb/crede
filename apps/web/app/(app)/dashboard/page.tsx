"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, BarChart3, BriefcaseBusiness, FileText, Lightbulb, MessagesSquare, ShieldCheck, Sparkles, Target, TrendingUp } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorNote, Skeleton, SoftIcon, Stat, type Tint } from "@/components/ui/kit";
import { AreaChart, CoverageBars, Histogram, StackedBars } from "@/components/Charts";
import CareerInsights from "@/components/CareerInsights";
import { TierChecklist, TierEmblem, TierTrack, type Tier } from "@/components/VerificationTier";

type Dash = {
  profile: { full_name?: string; headline?: string; verification_score: number; profile_completion: number; badge_level?: string | null };
  timeline_count: number; verified_docs: number; generated_cvs: number; recommended_actions: string[];
};
type Stats = {
  strength: { day: string; completion: number; claims: number; verified: number; issuer: number }[];
  documents: { month: string; cv: number; cover_letter: number; bio: number }[];
  matches: { buckets: { range: string; count: number }[]; insufficient: number };
  skill_coverage: { skill: string; demand: number; met: number; partial: number; missing: number }[];
  community: { weeks: { week: string; posts: number; comments: number; likes_received: number }[]; totals: { posts: number; likes: number; comments: number; shares: number } };
  claims: { total: number; verified: number; issuer_verified: number; label: string; ratio: number; identity_verified: boolean };
  badge_level?: string | null;
  tier?: Tier;
};

const TIER_NAME: Record<string, string> = { green: "Green badge", gray: "Gray badge", none: "Not verified" };
const MONTH = (m: string) => new Date(m + "-01").toLocaleString("en", { month: "short" });
const DAY = (d: string) => new Date(d).toLocaleDateString("en", { day: "numeric", month: "short" });

function Card({ title, icon, tint, href, hrefLabel, children, className }: { title: string; icon: typeof BarChart3; tint: Tint; href?: string; hrefLabel?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("card p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5"><SoftIcon icon={icon} tint={tint} size="sm" /><h2 className="section-title">{title}</h2></div>
        {href && <Link href={href} className="link-muted text-xs">{hrefLabel || "View"}</Link>}
      </div>
      {children}
    </section>
  );
}

export default function DashboardPage() {
  const { data: d, error, reload } = useApi<Dash>("/profile/dashboard");
  const { data: s } = useApi<Stats>("/profile/dashboard/stats");

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!d) return (
    <div className="space-y-6"><Skeleton className="h-9 w-56" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div><Skeleton className="h-56" /></div>
  );

  const p = d.profile;
  const first = p.full_name?.split(" ")[0];
  const totalMatches = s ? s.matches.buckets.reduce((a, b) => a + b.count, 0) : 0;
  const strong = s ? s.matches.buckets.slice(-2).reduce((a, b) => a + b.count, 0) : 0;
  const docsTotal = s ? s.documents.reduce((a, m) => a + m.cv + m.cover_letter + m.bio, 0) : d.generated_cvs;
  const next = d.timeline_count === 0 ? { href: "/timeline#import", label: "Add your first role — or upload your CV", body: "Drop a CV or LinkedIn export and we fill your timeline, skills, education and certifications for you." }
    : (s?.tier?.level || p.badge_level || "none") === "none" && (s?.claims.issuer_verified ?? 0) === 0 ? { href: "/verification", label: "Get a claim verified", body: "Recruiters filter for verified claims first. One issuer-verified role changes how you rank." }
      : d.generated_cvs === 0 ? { href: "/generate", label: "Tailor a CV to a job", body: "Paste a job description and get a matched, designed CV in under a minute." }
        : { href: "/opportunities", label: "See your best matches", body: `${strong} open role${strong === 1 ? "" : "s"} match you at 60% or more.` };

  const level = s?.tier?.level || p.badge_level || "none";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Dashboard</p>
          <h1 className="page-title">{first ? `Hello, ${first}` : "Welcome"}</h1>
          <p className="page-lead">{p.headline || "Complete your profile to get started."}</p>
        </div>
        <Link href="/generate" className="btn btn-primary btn-sm"><Sparkles className="h-4 w-4" />Tailor a CV</Link>
      </header>

      <Link href={next.href} className="card group flex items-center gap-4 p-5">
        <SoftIcon icon={Target} tint="blue" />
        <div className="min-w-0 flex-1"><p className="eyebrow">Next best step</p><p className="mt-0.5 font-semibold">{next.label}</p><p className="text-sm text-muted">{next.body}</p></div>
        <ArrowRight className="h-5 w-5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
      </Link>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={TrendingUp} tint="blue" label="Profile strength" value={`${p.profile_completion}%`} href="/profile" />
        <Stat icon={ShieldCheck} tint="emerald" label="Verification" value={<span className="flex items-center gap-2 text-[17px] sm:text-[22px]"><TierEmblem level={level} size={22} />{s?.tier?.label || TIER_NAME[level] || "Not verified"}</span>} sub={s?.tier?.status || s?.claims.label} href="/verification" />
        <Stat icon={FileText} tint="violet" label="Documents" value={docsTotal} href="/documents" />
        <Stat icon={BriefcaseBusiness} tint="amber" label="Strong matches" value={strong} sub={totalMatches ? `of ${totalMatches} open roles` : undefined} href="/opportunities" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <CareerInsights />
        {s && (
          <Card title="Trust" icon={BadgeCheck} tint="emerald" href="/verification" hrefLabel="Verify more" className="self-start">
            <div className="flex items-center gap-4">
              <TierEmblem level={level} size={56} />
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{s.tier?.label || TIER_NAME[level]}</p>
                <p className="text-muted">{s.claims.label}</p>
                <div className="mt-2"><TierTrack level={level} /></div>
              </div>
            </div>
            {s.tier && <div className="mt-4 border-t border-border pt-4"><TierChecklist tier={s.tier} compact /></div>}
          </Card>
        )}
      </div>

      {!s ? <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-60" />)}</div> : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card title="Profile strength over time" icon={TrendingUp} tint="blue" href="/profile" hrefLabel="Improve">
            <AreaChart data={s.strength.map((x) => ({ ...x, day: DAY(x.day), verifiedPct: x.claims ? Math.round((x.verified / x.claims) * 100) : 0 }))} x="day" suffix="%"
              series={[{ key: "completion", label: "Completion", color: "var(--accent)" }, { key: "verifiedPct", label: "Claims verified", color: "var(--success)" }]} />
            {s.strength.length < 2 && <p className="mt-2 text-[11px] text-muted">Tracking started recently — this fills in as you update your profile.</p>}
          </Card>

          <Card title="Match distribution" icon={BarChart3} tint="amber" href="/opportunities" hrefLabel="Opportunities">
            {totalMatches ? <Histogram buckets={s.matches.buckets} /> : <EmptyState icon={BriefcaseBusiness} title="No open roles yet" body="When roles are posted, you'll see how well you match them here." />}
            {s.matches.insufficient > 0 && <p className="mt-2 text-[11px] text-muted">{s.matches.insufficient} role{s.matches.insufficient === 1 ? "" : "s"} need more profile data to score.</p>}
          </Card>

          <Card title="Documents" icon={FileText} tint="violet" href="/documents" hrefLabel="All documents">
            {docsTotal ? <StackedBars data={s.documents} x="month" fmt={MONTH}
              series={[{ key: "cv", label: "CVs", color: "var(--violet)" }, { key: "cover_letter", label: "Cover letters", color: "color-mix(in srgb, var(--violet) 45%, var(--surface))" }, { key: "bio", label: "Bios", color: "var(--sky)" }]} />
              : <EmptyState icon={FileText} title="No documents yet" body="Tailored CVs and cover letters you create will show up here." action={<Link href="/generate" className="link text-sm">Create one</Link>} />}
          </Card>

          <Card title="Skill coverage in demand" icon={Lightbulb} tint="emerald" href="/skills" hrefLabel="Add skill">
            {s.skill_coverage.length ? <CoverageBars rows={s.skill_coverage.slice(0, 6)} /> : <EmptyState icon={Lightbulb} title="Nothing to compare yet" body="Once roles are open we'll show which in-demand skills you cover." />}
          </Card>

          <Card title="Community engagement" icon={MessagesSquare} tint="sky" href="/feed" hrefLabel="Community" className="lg:col-span-2">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_200px]">
              <StackedBars data={s.community.weeks} x="week" fmt={DAY} height={110}
                series={[{ key: "posts", label: "Posts", color: "var(--sky)" }, { key: "comments", label: "Comments", color: "color-mix(in srgb, var(--sky) 50%, var(--surface))" }, { key: "likes_received", label: "Likes received", color: "var(--rose)" }]} />
              <div className="grid grid-cols-2 gap-3 self-start">
                {([["Posts", s.community.totals.posts], ["Likes", s.community.totals.likes], ["Comments", s.community.totals.comments], ["Shares", s.community.totals.shares]] as const).map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-surface-2 p-3"><p className="text-lg font-semibold tabular">{v}</p><p className="text-[11px] text-muted">{k}</p></div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

    </div>
  );
}
