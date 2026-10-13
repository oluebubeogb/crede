"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

type Doc = {
  id: number;
  title: string;
  doc_type: string;
  template: string;
  created_at: string;
  storage_key_pdf?: string | null;
  storage_key_docx?: string | null;
};

type DocDetail = Doc & {
  markdown?: string | null;
};

function DocumentsInner() {
  const search = useSearchParams();
  const editId = search.get("edit");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DocDetail | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<Doc[]>("/documents")
      .then(setDocs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!editId) return;
    api
      .get<DocDetail>(`/documents/${editId}`)
      .then((d) => {
        setEditing(d);
        setMarkdown(d.markdown || "");
      })
      .catch(console.error);
  }, [editId]);

  async function openEdit(id: number) {
    const d = await api.get<DocDetail>(`/documents/${id}`);
    setEditing(d);
    setMarkdown(d.markdown || "");
    setMsg(null);
  }

  async function saveDraft() {
    if (!editing) return;
    setSaving(true);
    setMsg(null);
    try {
      const d = await api.patch<DocDetail>(`/documents/${editing.id}`, {
        markdown,
      });
      setEditing(d);
      setMsg("Saved. PDF and DOCX re-rendered from this draft (no AI call).");
      load();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this document?")) return;
    await api.delete(`/documents/${id}`);
    if (editing?.id === id) setEditing(null);
    setDocs((d) => d.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Documents</h1>
          <p className="text-sm text-muted mt-1">
            Edit drafts in the browser, then download PDF or DOCX.
          </p>
        </div>
        <Link href="/generate" className="btn-primary text-sm">
          Generate
        </Link>
      </div>

      {loading && <p className="text-muted">Loading…</p>}

      {!loading && docs.length === 0 && !editing && (
        <div className="card text-center py-16">
          <p className="text-muted">Generate your first tailored CV or cover letter.</p>
          <Link href="/generate" className="btn-primary mt-4 inline-flex">
            Go to Generate
          </Link>
        </div>
      )}

      {editing && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">{editing.title}</h2>
              <p className="text-xs text-muted capitalize">
                {editing.doc_type} · {editing.template}
              </p>
            </div>
            <button type="button" className="text-sm text-muted" onClick={() => setEditing(null)}>
              Close
            </button>
          </div>
          <textarea
            className="input min-h-[360px] font-mono text-sm py-3"
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" disabled={saving} onClick={saveDraft}>
              {saving ? "Saving…" : "Save & re-render files"}
            </button>
            <a
              href={`/backend/api/documents/${editing.id}/download.pdf`}
              className="btn-secondary text-sm"
            >
              Download PDF
            </a>
            <a
              href={`/backend/api/documents/${editing.id}/download.docx`}
              className="btn-secondary text-sm"
            >
              Download DOCX
            </a>
          </div>
          {msg && <p className="text-sm text-muted">{msg}</p>}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {docs.map((d) => (
          <div key={d.id} className="card">
            <p className="font-medium">{d.title}</p>
            <p className="text-sm text-muted capitalize mt-0.5">
              {d.doc_type} · {d.template}
            </p>
            <p className="mt-2 text-xs text-muted">{new Date(d.created_at).toLocaleString()}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary text-sm" onClick={() => openEdit(d.id)}>
                Edit
              </button>
              <a
                href={`/backend/api/documents/${d.id}/download.pdf`}
                className="btn-secondary text-sm"
              >
                PDF
              </a>
              <a
                href={`/backend/api/documents/${d.id}/download.docx`}
                className="btn-secondary text-sm"
              >
                DOCX
              </a>
              <button type="button" className="text-sm text-danger" onClick={() => remove(d.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


export default function DocumentsPage() {
  return (
    <Suspense fallback={<p className="text-muted p-6">Loading…</p>}>
      <DocumentsInner />
    </Suspense>
  );
}
