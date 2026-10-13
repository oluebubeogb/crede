"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

type Accepted = {
  document_id: number;
  title: string;
  status: string;
  message: string;
  poll_url: string;
};

type DocPoll = {
  id: number;
  title: string;
  status: string;
  error_message?: string | null;
  storage_key_pdf?: string | null;
  matching_insights?: {
    required_skills?: string[];
    missing_skills?: string[];
  };
};

export default function GeneratePage() {
  const router = useRouter();
  const [jd, setJd] = useState("");
  const [template, setTemplate] = useState("professional");
  const [docType, setDocType] = useState<"cv" | "cover_letter">("cv");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [doc, setDoc] = useState<DocPoll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function pollDocument(id: number) {
    try {
      const d = await api.get<DocPoll>(`/documents/${id}`);
      setDoc(d);
      setStatus(d.status);
      if (d.status === "ready" || d.status === "failed") {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setLoading(false);
        if (d.status === "ready") {
          // navigate to edit page after short pause
          setTimeout(() => router.push(`/documents/${id}`), 600);
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Poll failed");
    }
  }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDoc(null);
    setStatus("starting…");
    try {
      const res = await api.post<Accepted>("/generate", {
        job_description: jd,
        template,
        doc_type: docType,
      });
      setStatus(res.status);
      setDoc({ id: res.document_id, title: res.title, status: res.status });
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => pollDocument(res.document_id), 2000);
      // immediate first poll
      pollDocument(res.document_id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
      setLoading(false);
      setStatus(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Generate</h1>
      <p className="text-sm text-muted">
        Paste a job description. Generation runs in the background so long AI jobs are not cut off by the browser.
      </p>

      <div className="flex rounded-btn border border-border p-1 max-w-sm">
        <button
          type="button"
          className={`flex-1 rounded-btn py-2 text-sm font-medium ${
            docType === "cv" ? "bg-accent text-white" : "text-muted"
          }`}
          onClick={() => setDocType("cv")}
        >
          CV
        </button>
        <button
          type="button"
          className={`flex-1 rounded-btn py-2 text-sm font-medium ${
            docType === "cover_letter" ? "bg-accent text-white" : "text-muted"
          }`}
          onClick={() => setDocType("cover_letter")}
        >
          Cover letter
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={generate} className="space-y-4">
          <div>
            <label className="label">Job description</label>
            <textarea
              className="input min-h-[280px] py-3"
              required
              minLength={40}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="Paste the full job description… Include Job Title: … for clearer document names."
              disabled={loading}
            />
          </div>
          <div>
            <label className="label">Template</label>
            <select
              className="input"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              disabled={loading}
            >
              <option value="professional">Professional</option>
              <option value="modern">Modern</option>
              <option value="executive">Executive</option>
              <option value="minimal">Minimal</option>
            </select>
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading
              ? status === "processing" || status === "pending"
                ? "Generating in background…"
                : "Starting…"
              : docType === "cover_letter"
                ? "Generate cover letter"
                : "Generate CV"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>

        <div className="card min-h-[280px]">
          <h2 className="font-semibold">Status</h2>
          {!doc && <p className="mt-4 text-sm text-muted">Results appear after you generate.</p>}
          {doc && (
            <div className="mt-4 space-y-3 text-sm">
              <p className="font-medium">{doc.title}</p>
              <p>
                Status:{" "}
                <span
                  className={
                    doc.status === "ready"
                      ? "text-green-600"
                      : doc.status === "failed"
                        ? "text-danger"
                        : "text-amber-600"
                  }
                >
                  {doc.status}
                </span>
              </p>
              {doc.status === "pending" || doc.status === "processing" ? (
                <p className="text-muted">
                  Waiting for the AI (this can take 1–2 minutes on cold start). You can leave this page —
                  the document will appear under Documents when ready.
                </p>
              ) : null}
              {doc.status === "failed" && (
                <p className="text-danger">{doc.error_message || "Generation failed"}</p>
              )}
              {doc.status === "ready" && (
                <div className="flex flex-wrap gap-2">
                  <Link href={`/documents/${doc.id}`} className="btn-primary text-sm">
                    Open & edit
                  </Link>
                  <Link href="/documents" className="btn-secondary text-sm">
                    All documents
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
