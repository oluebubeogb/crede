"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { TextAction } from "@/components/ui/TextAction";
import { IconButton } from "@/components/ui/IconButton";
import { ScanSearch, Sparkles, Package } from "lucide-react";

type Accepted = {
  document_id: number;
  title: string;
  status: string;
  message: string;
  poll_url: string;
  history_id?: number | null;
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

const DOC_TYPES = [
  { id: "cv" as const, label: "CV / Resume" },
  { id: "cover_letter" as const, label: "Cover letter" },
];

function GenerateInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillTitle = searchParams.get("title") || "";

  const [jd, setJd] = useState(
    prefillTitle
      ? `Role: ${prefillTitle}\n\nPaste the full job description here for a tailored match analysis.`
      : ""
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

  async function analyzeJob() {
    if (!jd.trim()) {
      setError("Paste a job description or URL content first.");
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
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
      const analysisResult = { score, strengths, gaps };
      setAnalysis(analysisResult);
      await api.post("/history", {
        job_description: jd,
        analysis: analysisResult,
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save analysis");
    } finally {
      setAnalyzing(false);
    }
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
        <h1 className="page-title">Generate Files</h1>
        <p className="page-lead">
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
          <label className="label">Job description</label>
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

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="doc-type">
              Document type
            </label>
            <select
              id="doc-type"
              className="input"
              value={docType}
              onChange={(e) => setDocType(e.target.value as "cv" | "cover_letter")}
            >
              {DOC_TYPES.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="template">
              Template
            </label>
            <select
              id="template"
              className="input"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            >
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {analysis && (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Match analysis</p>
              <p className="text-base font-semibold text-accent">{analysis.score}%</p>
            </div>
            {analysis.strengths.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">
                  Strengths
                </p>
                <ul className="list-inside list-disc space-y-0.5 text-sm">
                  {analysis.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.gaps.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">
                  Suggested edits
                </p>
                <ul className="list-inside list-disc space-y-0.5 text-sm text-muted">
                  {analysis.gaps.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
                <TextAction href="/timeline" variant="muted" className="mt-2">
                  Edit timeline to close gaps
                </TextAction>
              </div>
            )}
            <p className="text-xs text-muted">
              Saved to{" "}
              <TextAction href="/history" variant="muted">
                History
              </TextAction>
              .
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1 border-t border-border pt-5">
          <IconButton
            label={analyzing ? "Analyzing…" : "Analyze job"}
            disabled={analyzing || !jd.trim()}
            onClick={analyzeJob}
          >
            <ScanSearch className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={loading ? "Generating…" : "Generate"}
            disabled={loading}
            onClick={() => generate()}
            active
          >
            <Sparkles className="h-4 w-4" />
          </IconButton>
          <IconButton
            label="Save package"
            disabled={loading}
            onClick={() => {
              setDocType("cv");
              generate();
            }}
          >
            <Package className="h-4 w-4" />
          </IconButton>
          {loading && status && (
            <span className="ml-2 text-xs text-muted">Status: {status}</span>
          )}
        </div>
      </form>

      {doc && (
        <section className="note-section space-y-2">
          <p className="text-sm font-medium">{doc.title}</p>
          <p className="text-xs capitalize text-muted">Status: {doc.status}</p>
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
            <p className="text-sm text-danger">
              {doc.error_message || "Generation failed"}
            </p>
          )}
          {doc.matching_insights?.missing_skills &&
            doc.matching_insights.missing_skills.length > 0 && (
              <p className="text-xs text-muted">
                Missing skills noted: {doc.matching_insights.missing_skills.join(", ")}
              </p>
            )}
        </section>
      )}
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
