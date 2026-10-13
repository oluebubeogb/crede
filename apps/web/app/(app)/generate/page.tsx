"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Result = {
  document_id: number;
  title: string;
  template: string;
  tailored?: boolean;
  tailor_mode?: string;
  matching: {
    required_skills: string[];
    missing_skills: string[];
    suggested_experiences: string[];
    keywords: string[];
  };
  download_pdf_url?: string | null;
  download_docx_url?: string | null;
};

export default function GeneratePage() {
  const [jd, setJd] = useState("");
  const [template, setTemplate] = useState("professional");
  const [docType, setDocType] = useState<"cv" | "cover_letter">("cv");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api<Result>("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          job_description: jd,
          template,
          doc_type: docType,
        }),
      });
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Generate</h1>
      <p className="text-sm text-muted">
        Paste a job description. One AI pass produces a tailored draft; edit and download from Documents.
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
              placeholder="Paste the full job description…"
            />
          </div>
          <div>
            <label className="label">Template</label>
            <select className="input" value={template} onChange={(e) => setTemplate(e.target.value)}>
              <option value="professional">Professional</option>
              <option value="modern">Modern</option>
              <option value="executive">Executive</option>
              <option value="minimal">Minimal</option>
            </select>
          </div>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading
              ? "Generating…"
              : docType === "cover_letter"
                ? "Generate cover letter"
                : "Generate CV"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>

        <div className="card min-h-[280px]">
          <h2 className="font-semibold">Result</h2>
          {!result && <p className="mt-4 text-sm text-muted">Results appear after generation.</p>}
          {result && (
            <div className="mt-4 space-y-4 text-sm">
              <p className="font-medium">{result.title}</p>
              <p className="text-xs text-muted">
                Mode: {result.tailor_mode || "—"}
                {result.tailored ? " · AI tailored" : " · heuristic"}
              </p>
              <div>
                <p className="text-xs uppercase text-muted">Required skills</p>
                <p className="mt-1">{result.matching.required_skills.join(", ") || "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted">Missing skills</p>
                <p className="mt-1">{result.matching.missing_skills.join(", ") || "None"}</p>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Link href={`/documents?edit=${result.document_id}`} className="btn-primary text-sm">
                  Edit draft
                </Link>
                {result.download_pdf_url && (
                  <a href={`/backend${result.download_pdf_url}`} className="btn-secondary text-sm">
                    PDF
                  </a>
                )}
                {result.download_docx_url && (
                  <a href={`/backend${result.download_docx_url}`} className="btn-secondary text-sm">
                    DOCX
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
