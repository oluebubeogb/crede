"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Download, FileText, Loader2, Mail, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { cn, timeAgo } from "@/lib/utils";
import { EmptyState, ErrorNote, PageHeader, SkeletonList, SoftIcon, Tabs, toast } from "@/components/ui/kit";

type Doc = { id: number; title: string; doc_type: string; template: string; created_at: string; status?: string; target_job_title?: string | null; target_organization?: string | null; storage_key_pdf?: string | null; error_message?: string | null };
type ListRes = { items: Doc[]; total: number; page: number; pages: number };

export default function DocumentsPage() {
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState("all");
  const { data, error, loading, reload, setData } = useApi<ListRes>(`/documents?page=${page}&page_size=24`, [page]);
  const [busy, setBusy] = useState<number | null>(null);
  const items = (data?.items || []).filter((d) => tab === "all" || (tab === "cv" ? d.doc_type === "cv" : d.doc_type !== "cv"));

  async function remove(d: Doc) {
    if (!confirm(`Delete “${d.title}”?`)) return;
    setBusy(d.id);
    try {
      await api.delete(`/documents/${d.id}`);
      if (data) setData({ ...data, items: data.items.filter((x) => x.id !== d.id), total: data.total - 1 });
      toast("Deleted");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't delete", "error"); } finally { setBusy(null); }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Documents" title="Your CVs & letters" lead="Every document is built from your timeline — restyle or edit any of them."
        action={<Link href="/generate" className="btn btn-primary btn-sm"><Plus className="h-4 w-4" />New</Link>} />
      <Tabs className="mb-4" value={tab} onChange={setTab} items={[{ value: "all", label: "All", count: data?.total }, { value: "cv", label: "CVs" }, { value: "letter", label: "Cover letters" }]} />
      {error ? <ErrorNote message={error} onRetry={reload} /> : loading && !data ? <SkeletonList n={4} /> : !items.length ? (
        <EmptyState icon={FileText} title="No documents yet" body="Paste a job description and Crede tailors a CV or cover letter from your profile." action={<Link href="/generate" className="link text-sm">Create your first CV</Link>} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((d) => {
            const cv = d.doc_type === "cv";
            const ready = (d.status || "ready") === "ready";
            return (
              <li key={d.id} className="card card-hover group relative flex gap-3 p-4">
                <SoftIcon icon={cv ? FileText : Mail} tint={cv ? "blue" : "violet"} />
                <div className="min-w-0 flex-1">
                  <Link href={`/documents/${d.id}`} className="line-clamp-1 font-semibold after:absolute after:inset-0">{d.title}</Link>
                  <p className="line-clamp-1 text-sm text-muted">{[d.target_organization, d.template && d.template[0].toUpperCase() + d.template.slice(1)].filter(Boolean).join(" · ")}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                    {ready ? <span>{timeAgo(d.created_at)}</span> : d.status === "failed" ? <span className="pill pill-red">Failed</span> : <span className="pill pill-blue"><Loader2 className="h-3 w-3 animate-spin" />Building</span>}
                  </div>
                </div>
                <div className={cn("relative z-10 flex shrink-0 flex-col gap-0.5 opacity-70 transition-opacity group-hover:opacity-100")}>
                  {ready && d.storage_key_pdf && <a href={`/backend/api/documents/${d.id}/download.pdf`} className="btn btn-ghost btn-sm px-2" aria-label="Download PDF"><Download className="h-4 w-4" /></a>}
                  <button type="button" className="btn btn-ghost btn-sm px-2 text-danger" aria-label="Delete" disabled={busy === d.id} onClick={() => remove(d)}>{busy === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {data && data.pages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3 text-sm">
          <button type="button" className="btn btn-soft btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="h-4 w-4" /></button>
          <span className="tabular text-muted">{page} / {data.pages}</span>
          <button type="button" className="btn btn-soft btn-sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}><ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}
