"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

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

  const items = data?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          <p className="text-sm text-muted mt-1">
            {data ? `${data.total} document${data.total === 1 ? "" : "s"}` : "—"}
          </p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <button
              type="button"
              className="btn-secondary text-sm text-danger"
              disabled={busy}
              onClick={bulkDelete}
            >
              Delete selected ({selected.size})
            </button>
          )}
          <Link href="/generate" className="btn-primary text-sm">
            Generate
          </Link>
        </div>
      </div>

      {loading && <p className="text-muted">Loading…</p>}

      {!loading && items.length === 0 && (
        <div className="card text-center py-16">
          <p className="text-muted">Generate your first tailored CV or cover letter.</p>
          <Link href="/generate" className="btn-primary mt-4 inline-flex">
            Go to Generate
          </Link>
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.size === items.length && items.length > 0}
              onChange={toggleAll}
              id="select-all"
            />
            <label htmlFor="select-all" className="text-muted">
              Select all on this page
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((d) => (
              <div key={d.id} className="card relative">
                <div className="absolute top-4 right-4">
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={() => toggle(d.id)}
                    aria-label={`Select ${d.title}`}
                  />
                </div>
                <p className="font-medium pr-8">{d.title}</p>
                <p className="text-sm text-muted capitalize mt-0.5">
                  {d.doc_type.replace("_", " ")} · {d.template}
                  {d.status && d.status !== "ready" ? ` · ${d.status}` : ""}
                </p>
                {d.target_job_title && (
                  <p className="text-xs text-muted mt-1">Role: {d.target_job_title}</p>
                )}
                <p className="mt-2 text-xs text-muted">{new Date(d.created_at).toLocaleString()}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/documents/${d.id}`} className="btn-primary text-sm">
                    Open / Edit
                  </Link>
                  {d.status === "ready" && d.storage_key_pdf && (
                    <a
                      href={`/backend/api/documents/${d.id}/download.pdf`}
                      className="btn-secondary text-sm"
                    >
                      PDF
                    </a>
                  )}
                  {d.status === "ready" && d.storage_key_docx && (
                    <a
                      href={`/backend/api/documents/${d.id}/download.docx`}
                      className="btn-secondary text-sm"
                    >
                      DOCX
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {data && data.pages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                className="btn-secondary text-sm"
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
                className="btn-secondary text-sm"
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
