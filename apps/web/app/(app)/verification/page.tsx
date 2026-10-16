"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { TextAction } from "@/components/ui/TextAction";
import { CircleCheckbox } from "@/components/ui/CircleCheckbox";

type VItem = {
  id: number;
  kind: string;
  status: string;
  document_key?: string | null;
  notes?: string | null;
  points: number;
};

const LABELS: Record<string, string> = {
  email: "Email verified",
  phone: "Phone verification",
  degree: "Degree verification",
  certification: "Certification",
  employment: "Employment verification",
  organization: "Organization",
};

const ACTIONS: Record<string, string> = {
  email: "Email is verified via account",
  phone: "Verify phone",
  degree: "Upload proof",
  certification: "Add certification",
  employment: "Upload proof or request employer confirmation",
  organization: "Request organization confirmation",
};

export default function VerificationPage() {
  const [items, setItems] = useState<VItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const score = items
    .filter((i) => i.status === "approved")
    .reduce((s, i) => s + (i.points || 0), 0);

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
      <div className="space-y-4">
        <h1 className="page-title">Verification</h1>
        <p className="text-sm text-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <header>
        <h1 className="page-title">Verification</h1>
        <p className="mt-1 text-sm text-muted">
          Trust is visible. Verify claims on your timeline and credentials to raise your score.
        </p>
      </header>

      {/* Large score */}
      <div className="card flex flex-wrap items-center gap-6">
        <div className="relative h-28 w-28 shrink-0">
          <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border)" strokeWidth="8" />
            <circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${Math.min(score, 100) / 100 * 264} 264`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold">{score}</span>
            <span className="text-xs text-muted">/ 100</span>
          </div>
        </div>
        <div>
          <p className="font-medium">Verification Score</p>
          <p className="mt-1 text-sm text-muted max-w-md">
            Upload proof for employment, degree, or certifications. Reviews are handled carefully so every approved claim increases trust.
          </p>
        </div>
      </div>

      {/* Methods as circle rows */}
      <div className="space-y-2">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted">Verification methods</h2>
        {items.map((item) => {
          const approved = item.status === "approved";
          const pending = item.status === "pending";
          return (
            <div key={item.kind} className="card flex flex-wrap items-center justify-between gap-4 py-4">
              <div className="flex items-start gap-3 min-w-0">
                <span
                  className={`mt-0.5 text-base leading-none ${
                    approved ? "text-success" : pending ? "text-warning" : "text-muted"
                  }`}
                  aria-hidden
                >
                  {approved ? "●" : "○"}
                </span>
                <div>
                  <p className="text-sm font-medium">{LABELS[item.kind] || item.kind}</p>
                  <p className="text-xs text-muted capitalize">
                    {item.status}
                    {approved ? ` · +${item.points} pts` : ""}
                    {item.notes ? ` · ${item.notes}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                {item.document_key && (
                  <TextAction
                    href={`/backend/api/verification/files/${item.id}`}
                    variant="muted"
                  >
                    View document
                  </TextAction>
                )}
                {!approved && item.kind !== "email" && (
                  <>
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
                    <TextAction
                      variant="primary"
                      onClick={() => fileRefs.current[item.kind]?.click()}
                      disabled={uploading === item.kind}
                    >
                      {uploading === item.kind
                        ? "Uploading…"
                        : ACTIONS[item.kind] || "Upload proof"}
                    </TextAction>
                  </>
                )}
                {approved && <span className="text-xs text-success">Complete</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card space-y-2">
        <p className="text-sm font-medium">Portability</p>
        <p className="text-xs text-muted">
          Export a shareable verification summary. Useful for applications and external proof.
        </p>
        <TextAction
          variant="primary"
          onClick={() => {
            const summary = {
              score,
              items: items.map((i) => ({
                kind: i.kind,
                status: i.status,
                points: i.points,
              })),
              exported_at: new Date().toISOString(),
            };
            const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "crede-verification-proof.json";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export verification proof
        </TextAction>
      </div>

      <p className="text-xs text-muted">
        All verification features are available to every user. There are no limits on requests.
      </p>
    </div>
  );
}
