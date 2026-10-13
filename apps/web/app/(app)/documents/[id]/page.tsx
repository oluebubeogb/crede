"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";

type DocDetail = {
  id: number;
  title: string;
  doc_type: string;
  template: string;
  status: string;
  target_job_title?: string | null;
  error_message?: string | null;
  markdown?: string | null;
  storage_key_pdf?: string | null;
  storage_key_docx?: string | null;
};

export default function DocumentEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      try {
        const d = await api.get<DocDetail>(`/documents/${id}`);
        if (cancelled) return;
        setDoc(d);
        setTitle(d.title);
        setMarkdown(d.markdown || "");
        if (d.status === "pending" || d.status === "processing") {
          timer = setInterval(async () => {
            const again = await api.get<DocDetail>(`/documents/${id}`);
            if (cancelled) return;
            setDoc(again);
            setTitle(again.title);
            if (again.markdown) setMarkdown(again.markdown);
            if (again.status === "ready" || again.status === "failed") {
              if (timer) clearInterval(timer);
            }
          }, 2000);
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      }
    }
    load();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [id]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const d = await api.patch<DocDetail>(`/documents/${id}`, { markdown, title });
      setDoc(d);
      setMsg("Saved. PDF and DOCX re-rendered from this draft (no AI call).");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this document?")) return;
    await api.delete(`/documents/${id}`);
    router.push("/documents");
  }

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-danger">{error}</p>
        <Link href="/documents" className="text-accent text-sm">
          ← Back to documents
        </Link>
      </div>
    );
  }

  if (!doc) {
    return <p className="text-muted">Loading document…</p>;
  }

  const generating = doc.status === "pending" || doc.status === "processing";

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/documents" className="text-sm text-muted hover:text-foreground">
            ← Documents
          </Link>
          <h1 className="text-2xl font-semibold mt-2">{doc.title}</h1>
          <p className="text-sm text-muted capitalize mt-1">
            {doc.doc_type.replace("_", " ")} · {doc.template} · {doc.status}
          </p>
          {doc.target_job_title && (
            <p className="text-xs text-muted mt-1">Target role: {doc.target_job_title}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {doc.status === "ready" && (
            <>
              <a href={`/backend/api/documents/${id}/download.pdf`} className="btn-secondary text-sm">
                PDF
              </a>
              <a href={`/backend/api/documents/${id}/download.docx`} className="btn-secondary text-sm">
                DOCX
              </a>
            </>
          )}
          <button type="button" className="text-sm text-danger" onClick={remove}>
            Delete
          </button>
        </div>
      </div>

      {generating && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Still generating… This page will update when the AI finishes. You can leave and come back.
        </div>
      )}

      {doc.status === "failed" && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {doc.error_message || "Generation failed"}
        </div>
      )}

      <div>
        <label className="label">Title</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={generating}
        />
      </div>

      <div>
        <label className="label">Draft (Markdown)</label>
        <textarea
          className="input min-h-[420px] font-mono text-sm py-3"
          value={markdown}
          onChange={(e) => setMarkdown(e.target.value)}
          disabled={generating}
          placeholder={generating ? "Waiting for AI…" : "Document content"}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={saving || generating || !markdown}
          onClick={save}
        >
          {saving ? "Saving…" : "Save & re-render files"}
        </button>
        <Link href="/documents" className="btn-secondary text-sm">
          Back to list
        </Link>
      </div>
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </div>
  );
}
