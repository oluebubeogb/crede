"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";

type VItem = {
  id: number;
  kind: string;
  status: string;
  document_key?: string | null;
  notes?: string | null;
  points: number;
};

const LABELS: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  degree: "Degree",
  certification: "Certification",
  employment: "Employment",
  organization: "Organization",
};

export default function VerificationPage() {
  const [items, setItems] = useState<VItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const score = items.filter((i) => i.status === "approved").reduce((s, i) => s + (i.points || 0), 0);

  const load = () =>
    api
      .get<VItem[]>("/verification")
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
  }, []);

  async function handleUpload(kind: string, file: File) {
    setUploading(kind);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.postForm(`/verification/${kind}/upload`, fd);
      await load();
    } catch (e) {
      console.error(e);
      alert("Upload failed");
    } finally {
      setUploading(null);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold">Verification</h1>
        <p className="mt-4 text-slate-500">Loading…</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Verification</h1>
      <p className="mt-1 text-slate-500">Increase trust by verifying your credentials.</p>

      <div className="mt-8 flex items-center gap-6">
        <div className="relative h-28 w-28">
          <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#E2E8F0" strokeWidth="8" />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="#2563EB"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(score / 100) * 264} 264`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{score}</span>
            <span className="text-xs text-slate-400">/ 100</span>
          </div>
        </div>
        <div>
          <p className="font-medium text-slate-800 dark:text-zinc-200">Trust score</p>
          <p className="text-sm text-slate-500 mt-1">
            Upload proof for employment, degree, or certifications. An admin reviews and approves.
          </p>
        </div>
      </div>

      <div className="mt-8 space-y-3">
        {items.map((item) => (
          <div
            key={item.kind}
            className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex items-center justify-between gap-4"
          >
            <div>
              <p className="font-medium text-slate-900 dark:text-white">
                {LABELS[item.kind] || item.kind}
              </p>
              <p className="text-sm text-slate-500 capitalize">
                {item.status}
                {item.status === "approved" ? ` · +${item.points} pts` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {item.document_key && (
                <a
                  href={`/backend/api/verification/files/${item.id}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Download
                </a>
              )}
              <input
                type="file"
                className="hidden"
                ref={(el) => {
                  fileRefs.current[item.kind] = el;
                }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(item.kind, f);
                }}
              />
              <button
                type="button"
                disabled={uploading === item.kind}
                onClick={() => fileRefs.current[item.kind]?.click()}
                className="h-10 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium disabled:opacity-50"
              >
                {uploading === item.kind ? "Uploading…" : item.document_key ? "Replace" : "Upload"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
