"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronDown, Loader2, RefreshCw, UsersRound } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Avatar, EmptyState, ErrorNote, PageHeader, SkeletonList, VerifiedBadge, toast } from "@/components/ui/kit";
import { MatchBreakdown, MatchScore, type MatchResult } from "@/components/MatchScore";
import type { Candidate, Job } from "@/components/recruiter";

type M = { id: number; overall_score?: number | null; match?: MatchResult | null; status: string; profile?: Candidate | null };

export default function MatchesPage() {
  const { id } = useParams<{ id: string }>();
  const { data: job } = useApi<Job>(`/jobs/${id}`, [id]);
  const { data, error, loading, reload, setData } = useApi<M[]>(`/candidates/jobs/${id}/matches`, [id]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  async function run() {
    setBusy(true);
    try { setData(await api.post<M[]>(`/candidates/jobs/${id}/matches`)); toast("Candidates ranked"); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } finally { setBusy(false); }
  }
  const rows = [...(data || [])].sort((a, b) => (b.overall_score ?? -1) - (a.overall_score ?? -1));
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/recruiter/jobs" className="link-muted text-sm">← Jobs</Link>
      <PageHeader eyebrow="Matches" title={job?.title || "Candidates"} lead="Ranked with the same engine candidates see — open a row for the breakdown."
        action={<button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={run}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{rows.length ? "Re-rank" : "Find candidates"}</button>} />
      {error ? <ErrorNote message={error} onRetry={reload} /> : loading && !data ? <SkeletonList n={4} avatar /> : !rows.length ? (
        <EmptyState icon={UsersRound} title="No ranked candidates yet" body="Run matching to score public Crede profiles against this job's requirements." />
      ) : (
        <ul className="card divide-y divide-border overflow-hidden">
          {rows.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => setOpen(open === m.id ? null : m.id)} className="nav-hover flex w-full items-center gap-3 p-4 text-left">
                <Avatar name={m.profile?.full_name} src={m.profile?.avatar_url} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 font-medium">{m.profile?.full_name || "Candidate"}<VerifiedBadge level={m.profile?.badge_level} /></p>
                  <p className="line-clamp-1 text-sm text-muted">{[m.profile?.headline, m.profile?.location].filter(Boolean).join(" · ")}</p>
                </div>
                <MatchScore match={m.match} size={44} />
                <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", open === m.id && "rotate-180")} />
              </button>
              {open === m.id && (
                <div className="px-4 pb-4">
                  {m.match && <MatchBreakdown match={m.match} compact />}
                  {m.profile?.claims?.label && <p className="mt-3 text-xs text-muted">{m.profile.claims.label}</p>}
                  {m.profile?.username && <Link href={`/u/${m.profile.username}`} className="link mt-2 inline-block text-sm">View profile</Link>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
