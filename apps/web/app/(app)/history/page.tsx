"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { History as HistoryIcon } from "lucide-react";

type HistoryItem = {
  id: number;
  title: string;
  organization?: string | null;
  job_description_excerpt: string;
  analysis?: { score?: number; strengths?: string[]; gaps?: string[] } | null;
  created_at: string;
  updated_at: string;
  document_count: number;
  has_cv: boolean;
  has_cover_letter: boolean;
};

type ListRes = {
  items: HistoryItem[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function HistoryPage() {
  const [data, setData] = useState<ListRes | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<ListRes>(`/history?page=${page}&page_size=20`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const items = data?.items || [];

  return (
    <div className="space-y-0">
      <section className="note-section">
        <h1 className="page-title">History</h1>
        <p className="page-lead">
          Job descriptions you&apos;ve analyzed or generated files for. Click a row to review the
          JD, analysis, CV, and cover letter.
        </p>
      </section>

      {loading && (
        <section className="note-section py-8 text-sm text-muted">Loading history…</section>
      )}

      {!loading && items.length === 0 && (
        <section className="note-section py-12 text-center">
          <HistoryIcon className="mx-auto mb-3 h-8 w-8 text-muted" />
          <p className="text-sm text-muted">No history yet.</p>
          <p className="mt-1 text-sm text-muted">
            Analyze a job description or generate a CV from{" "}
            <Link href="/generate" className="text-accent hover:underline">
              Generate Files
            </Link>
            .
          </p>
        </section>
      )}

      {!loading &&
        items.map((item) => (
          <Link
            key={item.id}
            href={`/history/${item.id}`}
            className="note-section block py-4 transition hover:bg-border/20"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                {item.organization && (
                  <p className="mt-0.5 text-xs text-muted">{item.organization}</p>
                )}
                <p className="mt-1.5 line-clamp-2 text-sm text-muted">
                  {item.job_description_excerpt}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted">
                <span>{formatDate(item.created_at)}</span>
                {item.analysis?.score != null && (
                  <span className="font-medium text-accent">{item.analysis.score}% match</span>
                )}
                <span>
                  {[
                    item.has_cv && "CV",
                    item.has_cover_letter && "Cover letter",
                  ]
                    .filter(Boolean)
                    .join(" · ") || "JD only"}
                </span>
              </div>
            </div>
          </Link>
        ))}

      {data && data.pages > 1 && (
        <section className="note-section flex items-center justify-between py-4 text-sm">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="text-muted hover:text-foreground disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-muted">
            Page {data.page} of {data.pages}
          </span>
          <button
            type="button"
            disabled={page >= data.pages}
            onClick={() => setPage((p) => p + 1)}
            className="text-muted hover:text-foreground disabled:opacity-40"
          >
            Next
          </button>
        </section>
      )}
    </div>
  );
}
