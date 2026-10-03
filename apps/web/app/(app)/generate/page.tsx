"use client";

import { useState } from "react";
import { api } from "@/lib/api";

type Result = {
  document_id: number;
  title: string;
  template: string;
  matching: {
    required_skills: string[];
    missing_skills: string[];
    suggested_experiences: string[];
    keywords: string[];
  };
};

export default function GeneratePage() {
  const [jd, setJd] = useState("");
  const [template, setTemplate] = useState("professional");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api<Result>("/api/generate", {
        method: "POST",
        body: JSON.stringify({ job_description: jd, template, doc_type: "cv" }),
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
      <h1 className="text-2xl font-semibold">Generate CV</h1>
      <p className="text-sm text-muted">Paste a job description. We match your timeline and produce a tailored CV.</p>
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
            {loading ? "Generating…" : "Generate CV"}
          </button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>
        <div className="card min-h-[280px]">
          <h2 className="font-semibold">Matching insights</h2>
          {!result && <p className="mt-4 text-sm text-muted">Results appear after generation.</p>}
          {result && (
            <div className="mt-4 space-y-4 text-sm">
              <p className="font-medium">{result.title}</p>
              <div>
                <p className="text-xs uppercase text-muted">Required skills</p>
                <p className="mt-1">{result.matching.required_skills.join(", ") || "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted">Missing skills</p>
                <p className="mt-1">{result.matching.missing_skills.join(", ") || "None"}</p>
              </div>
              <div>
                <p className="text-xs uppercase text-muted">Suggested experiences</p>
                <ul className="mt-1 list-disc pl-5">
                  {result.matching.suggested_experiences.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-muted">Document saved · ID {result.document_id}. PDF/DOCX export wires to storage next.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
