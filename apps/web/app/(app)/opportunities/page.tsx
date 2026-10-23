"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BriefcaseBusiness, Check, MapPin, Minus, Search, Sparkles, X } from "lucide-react";
import { useApi, useDebounced } from "@/lib/hooks";
import { cn, naira, timeAgo } from "@/lib/utils";
import { EmptyState, ErrorNote, OrgMark, Sheet, SkeletonList, VerifiedBadge } from "@/components/ui/kit";
import { MatchBreakdown, MatchScore, type MatchResult } from "@/components/MatchScore";

type Org = { id?: number | null; name?: string | null; logo_url?: string | null; verified?: boolean };
type Job = { id: number; title: string; location?: string | null; employment_type?: string | null; salary_min?: number | null; salary_max?: number | null; created_at?: string | null; deadline?: string | null; organization?: Org };
type Opp = { score: number | null; match: MatchResult; job: Job };
type Req = { id: string; text: string; status: "met" | "partial" | "missing"; priority: string; suggestion?: string };
type Detail = { job: Job & { description?: string; requirements?: string }; match: MatchResult & { requirements?: Req[] } };

const FILTERS = [
  { key: "high", label: "Match ≥ 70%" },
  { key: "remote", label: "Remote / hybrid" },
  { key: "senior", label: "Senior" },
  { key: "verified", label: "Verified employers" },
] as const;
type FKey = (typeof FILTERS)[number]["key"];

const ICON = { met: Check, partial: Minus, missing: X };
const TONE = { met: "text-success", partial: "text-warning", missing: "text-danger" };

function salary(j: Job) {
  if (!j.salary_min && !j.salary_max) return null;
  if (j.salary_min && j.salary_max) return `${naira(j.salary_min)} – ${naira(j.salary_max)}`;
  return naira(j.salary_min || j.salary_max);
}

function JobSheet({ id, onClose }: { id: number | null; onClose: () => void }) {
  const { data, loading } = useApi<Detail>(id ? `/opportunities/${id}/match` : null, [id]);
  const j = data?.job;
  return (
    <Sheet open={id != null} onClose={onClose} title={j?.title || "Role"} wide
      footer={j && <Link href={`/generate?job=${j.id}`} className="btn btn-primary w-full"><Sparkles className="h-4 w-4" />Tailor my CV for this role</Link>}>
      {loading || !data ? <SkeletonList n={2} /> : (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <OrgMark name={j!.organization?.name} src={j!.organization?.logo_url} />
            <div className="min-w-0 text-sm">
              <p className="flex items-center gap-1 font-medium">{j!.organization?.name}{j!.organization?.verified && <VerifiedBadge level="issuer_verified" size={14} />}</p>
              <p className="text-muted">{[j!.location, j!.employment_type?.replace("_", " "), salary(j!)].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-border p-4"><MatchBreakdown match={data.match} /></div>
          {!!data.match.requirements?.length && (
            <div>
              <h3 className="section-title mb-2">How you match</h3>
              <ul className="space-y-2">
                {data.match.requirements.map((r) => { const I = ICON[r.status]; return (
                  <li key={r.id} className="flex gap-2.5 text-sm">
                    <I className={cn("mt-0.5 h-4 w-4 shrink-0", TONE[r.status])} strokeWidth={2.5} />
                    <span>{r.text}{r.priority === "nice" && <span className="text-muted"> · nice to have</span>}</span>
                  </li>); })}
              </ul>
            </div>
          )}
          {j!.description && <div><h3 className="section-title mb-2">About the role</h3><p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{j!.description}</p></div>}
        </div>
      )}
    </Sheet>
  );
}

export default function OpportunitiesPage() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 300);
  const { data, error, loading, reload } = useApi<Opp[]>(`/opportunities${dq ? `?q=${encodeURIComponent(dq)}` : ""}`, [dq]);
  const [on, setOn] = useState<Partial<Record<FKey, boolean>>>({});
  const [open, setOpen] = useState<number | null>(null);

  const items = useMemo(() => (data || []).filter(({ job, score }) => {
    if (on.high && (score ?? 0) < 70) return false;
    if (on.remote && !/remote|hybrid/i.test(job.location || "")) return false;
    if (on.senior && !/senior|lead|principal|head|manager/i.test(job.title)) return false;
    if (on.verified && !job.organization?.verified) return false;
    return true;
  }), [data, on]);
  const anyFilter = Object.values(on).some(Boolean);

  return (
    <div>
      <header className="mb-5">
        <p className="eyebrow mb-1">Opportunities</p>
        <h1 className="page-title">Roles that fit you</h1>
        <p className="page-lead">Scored against your timeline, skills and verified claims. Hover or tap a score to see why.</p>
      </header>

      <div className="mb-5 space-y-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Search roles" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {FILTERS.map((f) => <button key={f.key} type="button" onClick={() => setOn({ ...on, [f.key]: !on[f.key] })} className={cn("chip shrink-0", on[f.key] && "chip-active")}>{f.label}</button>)}
        </div>
      </div>

      {error ? <ErrorNote message={error} onRetry={reload} /> : loading && !data ? <SkeletonList n={4} avatar /> : items.length === 0 ? (
        <EmptyState icon={BriefcaseBusiness} title={data?.length ? "Nothing matches these filters" : "No open roles yet"}
          body={data?.length ? "Try removing a filter." : "Complete your timeline and skills. When employers post roles, your matches appear here."}
          action={anyFilter ? <button type="button" className="link text-sm" onClick={() => setOn({})}>Clear filters</button>
            : <div className="flex gap-4 text-sm"><Link href="/timeline" className="link">Complete timeline</Link><Link href="/skills" className="link">Add skill</Link></div>} />
      ) : (
        <ul className="space-y-3">
          {items.map(({ job, match }) => (
            <li key={job.id}>
              <div role="button" tabIndex={0} onClick={() => setOpen(job.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(job.id)}
                className="card group flex cursor-pointer items-start gap-4 p-4 sm:p-5">
                <OrgMark name={job.organization?.name} src={job.organization?.logo_url} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-snug group-hover:underline group-hover:decoration-border-strong group-hover:underline-offset-4">{job.title}</p>
                  <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">{job.organization?.name}{job.organization?.verified && <VerifiedBadge level="issuer_verified" size={13} />}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    {job.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{job.location}</span>}
                    {salary(job) && <span>{salary(job)}</span>}
                    {job.created_at && <span>{timeAgo(job.created_at)}</span>}
                  </p>
                  {match.insufficient ? (
                    <p className="mt-2 text-xs text-muted">Add more to your profile to score this role.</p>
                  ) : !!match.top_gaps?.length && (
                    <p className="mt-2 text-xs text-muted">Gap: <span className="text-foreground">{match.top_gaps[0]}</span></p>
                  )}
                </div>
                <div onClick={(e) => e.stopPropagation()}><MatchScore match={match} size={48} /></div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <JobSheet id={open} onClose={() => setOpen(null)} />
    </div>
  );
}
