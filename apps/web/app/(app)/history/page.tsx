"use client";

import Link from "next/link";
import { ClipboardList, Plus } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { timeAgo } from "@/lib/utils";
import { EmptyState, ErrorNote, PageHeader, SkeletonList } from "@/components/ui/kit";
import { MatchScore, type MatchResult } from "@/components/MatchScore";

type Item = { id: number; title?: string | null; organization?: string | null; job_description_excerpt?: string; analysis?: Record<string, unknown> | null; created_at?: string };

export default function HistoryPage() {
  const { data, error, loading, reload } = useApi<{ items: Item[] }>("/history?page_size=50");
  const items = data?.items || [];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Analysis" title="Job matches" lead="Every job you've checked, with what you meet and what's missing."
        action={<Link href="/generate" className="btn btn-primary btn-sm"><Plus className="h-4 w-4" />Check a job</Link>} />
      {error ? <ErrorNote message={error} onRetry={reload} /> : loading && !data ? <SkeletonList n={4} /> : !items.length ? (
        <EmptyState icon={ClipboardList} tint="sky" title="No jobs checked yet" body="Paste any job description to see your match, requirement by requirement." action={<Link href="/generate" className="link text-sm">Check a job</Link>} />
      ) : (
        <ul className="card divide-y divide-border overflow-hidden">
          {items.map((h) => {
            const c = (h.analysis?.counts || {}) as Record<string, number>;
            return (
              <li key={h.id}>
                <Link href={`/history/${h.id}`} className="nav-hover flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 font-medium">{h.title || "Untitled role"}{h.organization ? <span className="font-normal text-muted"> · {h.organization}</span> : null}</p>
                    <p className="mt-0.5 line-clamp-1 text-sm text-muted">{h.job_description_excerpt}</p>
                    <p className="mt-1 text-xs text-muted">
                      {c.met != null && <span className="text-success">{c.met} met</span>}{c.partial ? <span> · {c.partial} partial</span> : null}{c.missing ? <span> · {c.missing} missing</span> : null}
                      {h.created_at && <span> · {timeAgo(h.created_at)}</span>}
                    </p>
                  </div>
                  {h.analysis && <MatchScore match={h.analysis as unknown as MatchResult} size={44} />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
