"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { IconButton } from "@/components/ui/IconButton";
import { FileEdit, FileText, FileType, Trash2 } from "lucide-react";

type Doc = {
  id: number;
  title: string;
  doc_type: string;
  template: string;
  created_at: string;
  status?: string;
  target_job_title?: string | null;
  storage_key_pdf?: string | null;
  storage_key_docx?: string | null;
};

type ListRes = {
  items: Doc[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
};

export default function DocumentsPage() {
  const [data, setData] = useState<ListRes | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<ListRes>(`/documents?page=${page}&page_size=12`)
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(id: number) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleAll() {
    if (!data) return;
    if (selected.size === data.items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.items.map((d) => d.id)));
    }
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} document(s)?`)) return;
    setBusy(true);
    try {
      await api.post("/documents/bulk-delete", { ids: Array.from(selected) });
      setSelected(new Set());
      load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteOne(id: number, title: string) {
    if (!confirm(`Delete “${title}”?`)) return;
    setBusy(true);
    try {
      await api.delete(`/documents/${id}`);
      setSelected((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
      load();
    } finally {
      setBusy(false);
    }
  }

  const items = data?.items || [];

  return (
    <div className="space-y-0">
      <section className="note-section flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          <p className="mt-1.5 text-sm text-muted">
            {data ? `${data.total} document${data.total === 1 ? "" : "s"}` : "—"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <button
              type="button"
              className="text-action-danger"
              disabled={busy}
              onClick={bulkDelete}
            >
              Delete selected ({selected.size})
            </button>
          )}
          <Link href="/generate" className="text-action">
            Generate Files
          </Link>
        </div>
      </section>

      {loading && <p className="py-8 text-sm text-muted">Loading…</p>}

      {!loading && items.length === 0 && (
        <section className="note-section text-center py-12">
          <p className="text-muted">Generate your first tailored CV or cover letter.</p>
          <Link href="/generate" className="text-action mt-3 inline-block">
            Go to Generate Files
          </Link>
        </section>
      )}

      {items.length > 0 && (
        <>
          <section className="note-section flex items-center gap-2 text-sm py-4">
            <input
              type="checkbox"
              checked={selected.size === items.length && items.length > 0}
              onChange={toggleAll}
              id="select-all"
            />
            <label htmlFor="select-all" className="text-muted">
              Select all on this page
            </label>
          </section>

          <div>
            {items.map((d) => {
              const marked = selected.has(d.id);
              const ready = d.status === "ready" || !d.status;
              return (
                <div
                  key={d.id}
                  className="note-section flex flex-wrap items-start justify-between gap-3 py-4"
                >
                  <div className="flex min-w-0 flex-1 gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={marked}
                      onChange={() => toggle(d.id)}
                      aria-label={`Select ${d.title}`}
                    />
                    <div className="min-w-0">
                      <p className="font-medium">{d.title}</p>
                      <p className="mt-0.5 text-sm capitalize text-muted">
                        {d.doc_type.replace("_", " ")} · {d.template}
                        {d.status && d.status !== "ready" ? ` · ${d.status}` : ""}
                      </p>
                      {d.target_job_title && (
                        <p className="mt-1 text-xs text-muted">Role: {d.target_job_title}</p>
                      )}
                      <p className="mt-1 text-xs text-muted">
                        {new Date(d.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <IconButton label="Open / Edit" href={`/documents/${d.id}`}>
                      <FileEdit className="h-4 w-4" />
                    </IconButton>
                    {ready && d.storage_key_pdf && (
                      <IconButton
                        label="Download PDF"
                        href={`/backend/api/documents/${d.id}/download.pdf`}
                      >
                        <FileText className="h-4 w-4" />
                      </IconButton>
                    )}
                    {ready && d.storage_key_docx && (
                      <IconButton
                        label="Download DOCX"
                        href={`/backend/api/documents/${d.id}/download.docx`}
                      >
                        <FileType className="h-4 w-4" />
                      </IconButton>
                    )}
                                        <IconButton
                      label="Delete"
                      danger
                      disabled={busy}
                      onClick={() => deleteOne(d.id, d.title)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </div>
              );
            })}
          </div>

          {data && data.pages > 1 && (
            <div className="flex items-center justify-center gap-3 py-6">
              <button
                type="button"
                className="text-action-muted"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span className="text-sm text-muted">
                Page {data.page} of {data.pages}
              </span>
              <button
                type="button"
                className="text-action-muted"
                disabled={page >= data.pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
