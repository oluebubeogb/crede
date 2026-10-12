"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Doc[]>("/documents")
      .then(setDocs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function remove(id: number) {
    if (!confirm("Delete this document?")) return;
    await api.delete(`/documents/${id}`);
    setDocs((d) => d.filter((x) => x.id !== id));
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Documents</h1>
          <p className="text-sm text-slate-500 mt-1">Generated CVs, cover letters, and bios.</p>
        </div>
        <Link
          href="/generate"
          className="h-11 px-5 rounded-xl bg-blue-600 text-white text-sm font-medium inline-flex items-center"
        >
          Generate CV
        </Link>
      </div>

      {loading && <p className="text-slate-500">Loading…</p>}

      {!loading && docs.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-zinc-700 py-16 text-center">
          <p className="text-slate-600 dark:text-zinc-400 text-lg">Generate your first tailored CV.</p>
          <Link href="/generate" className="mt-4 inline-block text-blue-600 text-sm font-medium">
            Go to Generate →
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {docs.map((d) => (
          <div
            key={d.id}
            className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5"
          >
            <p className="font-medium text-slate-900 dark:text-white">{d.title}</p>
            <p className="text-sm text-slate-500 capitalize mt-0.5">
              {d.doc_type} · {d.template}
            </p>
            <p className="mt-2 text-xs text-slate-400">{new Date(d.created_at).toLocaleString()}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={`/backend/api/documents/${d.id}/download.pdf`}
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 text-sm inline-flex items-center"
              >
                PDF
              </a>
              <a
                href={`/backend/api/documents/${d.id}/download.docx`}
                className="h-9 px-3 rounded-lg border border-slate-200 dark:border-zinc-700 text-sm inline-flex items-center"
              >
                DOCX
              </a>
              <button
                type="button"
                onClick={() => remove(d.id)}
                className="h-9 px-3 rounded-lg text-sm text-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
