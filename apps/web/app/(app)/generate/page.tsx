"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { TextAction } from "@/components/ui/TextAction";
import { CircleCheckbox } from "@/components/ui/CircleCheckbox";
import { InlineFormActions } from "@/components/ui/InlineFormActions";

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
    match_score?: number;
  };
};

const TEMPLATES = [
  { id: "professional", label: "Professional" },
  { id: "modern", label: "Modern" },
  { id: "compact", label: "Compact" },
];

function GenerateInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillTitle = searchParams.get("title") || "";

  const [jd, setJd] = useState(
    prefillTitle ? `Role: ${prefillTitle}\n\nPaste the full job description here for a tailored match analysis.` : ""
  );
  const [template, setTemplate] = useState("professional");
  const [docType, setDocType] = useState<"cv" | "cover_letter">("cv");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [doc, setDoc] = useState<DocPoll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<{
    score: number;
    strengths: string[];
    gaps: string[];
  } | null>(null);
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
          setTimeout(() => router.push(`/documents/${id}`), 600);
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Poll failed");
    }
  }

  function analyzeJob() {
    if (!jd.trim()) {
      setError("Paste a job description or URL content first.");
      return;
    }
    setAnalyzing(true);
    setError(null);
    // Client-side lightweight analysis until dedicated endpoint exists
    setTimeout(() => {
      const words = jd.toLowerCase();
      const strengths: string[] = [];
      const gaps: string[] = [];
      if (words.includes("lead") || words.includes("senior") || words.includes("manage")) {
        strengths.push("Leadership language detected — highlight management achievements.");
      }
      if (words.includes("remote") || words.includes("hybrid")) {
        strengths.push("Remote/hybrid role — emphasize async collaboration.");
      }
      const skillHints = ["python", "react", "sql", "aws", "communication", "stakeholder", "analytics"];
      skillHints.forEach((s) => {
        if (words.includes(s)) strengths.push(`Mentions ${s} — surface related timeline evidence.`);
      });
      if (!words.includes("metric") && !words.includes("%") && !words.includes("increased")) {
        gaps.push("Job emphasizes impact — add quantified achievements to timeline entries.");
      }
      if (strengths.length === 0) strengths.push("General professional fit based on your verified timeline.");
      const score = Math.min(92, 55 + strengths.length * 8 - gaps.length * 5);
      setAnalysis({ score, strengths, gaps });
      setAnalyzing(false);
    }, 600);
  }

  async function generate(e?: React.FormEvent) {
    if (e) e.preventDefault();
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
      pollDocument(res.document_id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-0">
      <section className="note-section">
        <h1 className="text-2xl font-semibold tracking-tight">Generate Files</h1>
        <p className="mt-1.5 text-sm text-muted">
          Turn a job description into a tailored CV or cover letter from your verified timeline.
        </p>
      </section>

      {error && (
        <section className="note-section">
          <p className="text-sm text-danger">{error}</p>
        </section>
      )}

      <form onSubmit={generate} className="note-section space-y-6">
        <div>
          <label className="label">Job description or pasted role text</label>
          <textarea
            className="input min-h-[260px] py-3"
            placeholder="Paste the full job description here…"
            value={jd}
            onChange={(e) => {
              setJd(e.target.value);
              setAnalysis(null);
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <TextAction type="button" variant="primary" onClick={analyzeJob} disabled={analyzing || !jd.trim()}>
            {analyzing ? "Analyzing…" : "Analyze job"}
          </TextAction>
          <span className="text-muted">·</span>
          <span className="text-xs text-muted">Optional — improves tailored output</span>
        </div>

        {analysis && (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Match analysis</p>
              <p className="text-lg font-semibold text-accent">{analysis.score}%</p>
            </div>
            {analysis.strengths.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted mb-1">Strengths</p>
                <ul className="list-inside list-disc text-sm space-y-0.5">
                  {analysis.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.gaps.length > 0 && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted mb-1">Suggested edits</p>
                <ul className="list-inside list-disc text-sm space-y-0.5 text-muted">
                  {analysis.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
                <TextAction href="/timeline" variant="muted" className="mt-2">
                  Edit timeline to close gaps
                </TextAction>
              </div>
            )}
          </div>
        )}

        <div>
          <p className="label">Document type</p>
          <div className="mt-1 flex flex-wrap gap-4">
            <CircleCheckbox
              checked={docType === "cv"}
              onChange={() => setDocType("cv")}
              label="CV / Resume"
            />
            <CircleCheckbox
              checked={docType === "cover_letter"}
              onChange={() => setDocType("cover_letter")}
              label="Cover letter"
            />
          </div>
        </div>

        <div>
          <p className="label">Template</p>
          <div className="mt-1 flex flex-wrap gap-4">
            {TEMPLATES.map((t) => (
              <CircleCheckbox
                key={t.id}
                checked={template === t.id}
                onChange={() => setTemplate(t.id)}
                label={t.label}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-5 text-sm">
          <TextAction type="submit" variant="primary" disabled={loading}>
            {loading ? "Generating…" : docType === "cv" ? "Generate tailored CV" : "Generate cover letter"}
          </TextAction>
          <span className="text-muted">·</span>
          <TextAction
            type="button"
            variant="secondary"
            disabled={loading}
            onClick={() => {
              setDocType("cv");
              generate();
            }}
          >
            Save package
          </TextAction>
          {loading && status && <span className="text-xs text-muted">Status: {status}</span>}
        </div>
      </form>

      {doc && (
        <section className="note-section space-y-2">
          <p className="text-sm font-medium">{doc.title}</p>
          <p className="text-xs text-muted capitalize">Status: {doc.status}</p>
          {doc.status === "ready" && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <TextAction href={`/documents/${doc.id}`} variant="primary">
                Open document
              </TextAction>
              <span className="text-muted">·</span>
              <TextAction href={`/backend/api/documents/${doc.id}/download.pdf`} variant="muted">
                Download PDF
              </TextAction>
              <span className="text-muted">·</span>
              <TextAction href={`/backend/api/documents/${doc.id}/download.docx`} variant="muted">
                Download DOCX
              </TextAction>
            </div>
          )}
          {doc.status === "failed" && (
            <p className="text-sm text-danger">{doc.error_message || "Generation failed"}</p>
          )}
          {doc.matching_insights?.missing_skills && doc.matching_insights.missing_skills.length > 0 && (
            <p className="text-xs text-muted">
              Missing skills noted: {doc.matching_insights.missing_skills.join(", ")}
            </p>
          )}
        </section>
      )}

      <p className="text-xs text-muted">
        All generation is unlimited. No quotas, no Pro gates.
      </p>
    </div>
  );
}

export default function GeneratePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <GenerateInner />
    </Suspense>
  );
}
