"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { TextAction } from "@/components/ui/TextAction";
import {
  PanelLeft,
  FileText,
  ScanSearch,
  FileType,
  Download,
  Trash2,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Doc = {
  id: number;
  title: string;
  doc_type: string;
  template: string;
  created_at: string;
  status?: string;
  target_job_title?: string | null;
  storage_key_pdf?: string | null;
  storage_key_docx?: string | null;
  error_message?: string | null;
};

type HistoryDetail = {
  id: number;
  title: string;
  organization?: string | null;
  job_description: string;
  analysis?: {
    score?: number;
    strengths?: string[];
    gaps?: string[];
  } | null;
  created_at: string;
  updated_at: string;
  documents: Doc[];
};

type Section =
  | "job_description"
  | "analysis"
  | "cv"
  | "cover_letter"
  | "downloads"
  | "danger";

const SECTIONS: { id: Section; label: string; icon: typeof FileText }[] = [
  { id: "job_description", label: "Job description", icon: FileText },
  { id: "analysis", label: "Analysis", icon: ScanSearch },
  { id: "cv", label: "CV / Resume", icon: FileType },
  { id: "cover_letter", label: "Cover letter", icon: FileText },
  { id: "downloads", label: "Downloads", icon: Download },
  { id: "danger", label: "Danger zone", icon: Trash2 },
];

const TEMPLATES = [
  { id: "professional", label: "Professional" },
  { id: "modern", label: "Modern" },
  { id: "compact", label: "Compact" },
];

/** Lightweight JD renderer: headings, bullets, emphasis — without raw # / * noise. */
function JdRendered({ text }: { text: string }) {
  const lines = (text || "").split("\n");
  const blocks: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList(key: string) {
    if (listItems.length === 0) return;
    blocks.push(
      <ul key={key} className="my-2 list-inside list-disc space-y-0.5 text-sm text-foreground">
        {listItems.map((item, i) => (
          <li key={i}>{inlineMd(item)}</li>
        ))}
      </ul>
    );
    listItems = [];
  }

  function inlineMd(s: string): React.ReactNode {
    const parts: React.ReactNode[] = [];
    let rest = s;
    let k = 0;
    const re = /(\*\*(.+?)\*\*|\*(.+?)\*|__(.+?)__|_(.+?)_)/;
    while (rest.length) {
      const m = re.exec(rest);
      if (!m || m.index === undefined) {
        parts.push(rest);
        break;
      }
      if (m.index > 0) parts.push(rest.slice(0, m.index));
      const bold = m[2] || m[4];
      const ital = m[3] || m[5];
      if (bold) {
        parts.push(
          <strong key={k++} className="font-semibold">
            {bold}
          </strong>
        );
      } else if (ital) {
        parts.push(
          <em key={k++} className="italic">
            {ital}
          </em>
        );
      }
      rest = rest.slice(m.index + m[0].length);
    }
    return parts.length === 1 ? parts[0] : <>{parts}</>;
  }

  lines.forEach((raw, idx) => {
    const line = raw.replace(/\r$/, "");
    const trimmed = line.trim();

    const isList =
      /^([*•\-])\s+/.test(trimmed) || /^\d+[\.\)]\s+/.test(trimmed);

    if (isList) {
      const content = trimmed.replace(/^([*•\-])\s+/, "").replace(/^\d+[\.\)]\s+/, "");
      listItems.push(content);
      return;
    }
    flushList(`ul-${idx}`);

    if (!trimmed) {
      blocks.push(<div key={`br-${idx}`} className="h-2" />);
      return;
    }

    const h = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      const level = h[1].length;
      const content = h[2].replace(/[#*]+$/, "").trim();
      const cls =
        level <= 1
          ? "mt-3 text-base font-semibold text-foreground"
          : level === 2
            ? "mt-2.5 text-sm font-semibold text-foreground"
            : "mt-2 text-sm font-medium text-foreground";
      blocks.push(
        <p key={`h-${idx}`} className={cls}>
          {inlineMd(content)}
        </p>
      );
      return;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${idx}`} className="my-3 border-border" />);
      return;
    }

    blocks.push(
      <p key={`p-${idx}`} className="text-sm leading-relaxed text-foreground">
        {inlineMd(trimmed)}
      </p>
    );
  });
  flushList("ul-end");

  return <div className="space-y-0.5">{blocks}</div>;
}

export default function HistoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [data, setData] = useState<HistoryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Section>("analysis");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null);
  const [generating, setGenerating] = useState<"cv" | "cover_letter" | "analysis" | null>(null);
  const [genStatus, setGenStatus] = useState<string | null>(null);
  const [template, setTemplate] = useState("professional");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(() => {
    if (!id || Number.isNaN(id)) return;
    setLoading(true);
    setError(null);
    api
      .get<HistoryDetail>(`/history/${id}`)
      .then((d) => {
        setData(d);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load history");
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  const cvDoc = data?.documents.find((d) => d.doc_type === "cv");
  const clDoc = data?.documents.find((d) => d.doc_type === "cover_letter");

  async function pollUntilReady(docId: number) {
    const maxAttempts = 60;
    let attempts = 0;
    return new Promise<void>((resolve, reject) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const d = await api.get<Doc>(`/documents/${docId}`);
          setGenStatus(d.status || "processing");
          if (d.status === "ready" || d.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            if (d.status === "failed") {
              reject(new Error(d.error_message || "Generation failed"));
            } else {
              resolve();
            }
          } else if (attempts >= maxAttempts) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            reject(new Error("Generation timed out — refresh to check status"));
          }
        } catch (e) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          reject(e instanceof Error ? e : new Error("Poll failed"));
        }
      }, 2000);
    });
  }

  async function generateDoc(docType: "cv" | "cover_letter") {
    if (!data) return;
    setGenerating(docType);
    setGenStatus("starting…");
    setError(null);
    try {
      const res = await api.post<{
        document_id: number;
        status: string;
        history_id?: number;
      }>("/generate", {
        history_id: data.id,
        job_description: data.job_description,
        doc_type: docType,
        template,
      });
      setGenStatus(res.status || "pending");
      await pollUntilReady(res.document_id);
      load();
      setActive(docType === "cv" ? "cv" : "cover_letter");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(null);
      setGenStatus(null);
    }
  }

  async function runAnalysis() {
    if (!data) return;
    setGenerating("analysis");
    setError(null);
    try {
      const updated = await api.post<HistoryDetail>(`/history/${data.id}/analyze`);
      setData(updated);
      setActive("analysis");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setGenerating(null);
    }
  }

  async function handleDelete() {
    if (!data) return;
    setDeleting(true);
    setDeleteMsg("Preparing downloads…");
    try {
      const toDownload: { url: string; name: string }[] = [];
      for (const doc of data.documents) {
        if (doc.storage_key_pdf) {
          toDownload.push({
            url: `/backend/api/documents/${doc.id}/download.pdf`,
            name: `${doc.title || doc.doc_type}.pdf`,
          });
        }
        if (doc.storage_key_docx) {
          toDownload.push({
            url: `/backend/api/documents/${doc.id}/download.docx`,
            name: `${doc.title || doc.doc_type}.docx`,
          });
        }
      }
      for (const f of toDownload) {
        setDeleteMsg(`Downloading ${f.name}…`);
        const a = document.createElement("a");
        a.href = f.url;
        a.download = f.name;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        await new Promise((r) => setTimeout(r, 400));
      }
      setDeleteMsg("Deleting history and associated files…");
      await api.delete(`/history/${data.id}`);
      setDeleteMsg("Deleted. Redirecting…");
      setTimeout(() => router.push("/history"), 600);
    } catch (e: unknown) {
      setDeleteMsg(null);
      setError(e instanceof Error ? e.message : "Delete failed");
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="note-section py-8 text-sm text-muted">Loading history…</div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-0">
        <section className="note-section">
          <h1 className="page-title">History</h1>
          <p className="mt-2 text-sm text-danger">{error}</p>
          <TextAction href="/history" variant="muted" className="mt-3">
            Back to history
          </TextAction>
        </section>
      </div>
    );
  }

  if (!data) return null;

  function DocActions({ doc }: { doc: Doc }) {
    return (
      <>
        <p className="text-sm font-medium">{doc.title}</p>
        <p className="text-xs capitalize text-muted">
          Status: {doc.status || "ready"} · Template: {doc.template}
        </p>
        {(doc.status === "ready" || !doc.status) && (
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
        {(doc.status === "pending" || doc.status === "processing") && (
          <p className="text-sm text-muted">Still generating… refresh in a moment.</p>
        )}
      </>
    );
  }

  function GenerateControls({ docType }: { docType: "cv" | "cover_letter" }) {
    const busy = generating === docType;
    return (
      <div className="mt-3 space-y-3 rounded-card border border-border p-3">
        <p className="text-sm text-muted">
          No {docType === "cv" ? "CV" : "cover letter"} linked to this job description yet.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor={`tpl-${docType}`}>
              Template
            </label>
            <select
              id={`tpl-${docType}`}
              className="input"
              value={template}
              disabled={!!generating}
              onChange={(e) => setTemplate(e.target.value)}
            >
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={!!generating}
            onClick={() => generateDoc(docType)}
            className="inline-flex items-center gap-1.5 rounded-card bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {busy ? "Generating…" : `Generate ${docType === "cv" ? "CV" : "cover letter"}`}
          </button>
        </div>
        {busy && genStatus && (
          <p className="text-xs text-muted">Status: {genStatus}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-0">
      <section className="note-section flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="page-title">{data.title}</h1>
          <p className="page-lead">
            {data.organization ? `${data.organization} · ` : ""}
            Saved {new Date(data.created_at).toLocaleDateString()}
          </p>
        </div>
        <TextAction href="/history" variant="muted">
          ← All history
        </TextAction>
      </section>

      {error && (
        <section className="note-section">
          <p className="text-sm text-danger">{error}</p>
        </section>
      )}

      <div className="flex min-h-[60vh] border-b border-border">
        <aside
          className={cn(
            "shrink-0 border-r border-border transition-all duration-300 ease-in-out",
            sidebarCollapsed ? "w-12" : "w-[30%] min-w-[200px] max-w-[320px]"
          )}
        >
          <div className="flex items-center justify-between border-b border-border px-2 py-2">
            {!sidebarCollapsed && (
              <span className="px-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Sections
              </span>
            )}
            <button
              type="button"
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setSidebarCollapsed((c) => !c)}
              className="flex h-8 w-8 items-center justify-center rounded-card text-muted transition hover:bg-border/50 hover:text-foreground"
            >
              <PanelLeft className="h-4 w-4" />
            </button>
          </div>
          <nav className="py-1">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const isActive = active === s.id;
              const isDanger = s.id === "danger";
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setActive(s.id)}
                  title={s.label}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition",
                    isActive
                      ? isDanger
                        ? "bg-danger/10 text-danger"
                        : "bg-accent/10 text-accent"
                      : isDanger
                        ? "text-muted hover:bg-danger/5 hover:text-danger"
                        : "text-muted hover:bg-border/40 hover:text-foreground",
                    sidebarCollapsed && "justify-center px-0"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && <span className="truncate">{s.label}</span>}
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 px-4 py-5 sm:px-6">
          {active === "job_description" && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium">Job description</h2>
              <div className="rounded-card border border-border bg-background p-4">
                <JdRendered text={data.job_description} />
              </div>
              <details className="text-xs text-muted">
                <summary className="cursor-pointer hover:text-foreground">View raw text</summary>
                <textarea
                  className="input mt-2 min-h-[160px] py-3 font-mono text-sm"
                  readOnly
                  value={data.job_description}
                />
              </details>
              <p className="text-xs text-muted">
                Exact content that was processed. Headings and bullets are cleaned for display;
                raw text is available above if you need to copy it into{" "}
                <Link href="/generate" className="text-accent hover:underline">
                  Generate Files
                </Link>
                .
              </p>
            </div>
          )}

          {active === "analysis" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium">Match analysis</h2>
                {data.analysis?.score != null && (
                  <p className="text-base font-semibold text-accent">{data.analysis.score}%</p>
                )}
              </div>
              {!data.analysis && (
                <div className="space-y-3">
                  <p className="text-sm text-muted">No analysis was saved for this session.</p>
                  <button
                    type="button"
                    disabled={generating === "analysis"}
                    onClick={runAnalysis}
                    className="inline-flex items-center gap-1.5 rounded-card bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    <ScanSearch className="h-4 w-4" />
                    {generating === "analysis" ? "Analyzing…" : "Run analysis"}
                  </button>
                </div>
              )}
              {data.analysis?.strengths && data.analysis.strengths.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">
                    Strengths
                  </p>
                  <ul className="list-inside list-disc space-y-0.5 text-sm">
                    {data.analysis.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {data.analysis?.gaps && data.analysis.gaps.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">
                    Suggested edits
                  </p>
                  <ul className="list-inside list-disc space-y-0.5 text-sm text-muted">
                    {data.analysis.gaps.map((g, i) => (
                      <li key={i}>{g}</li>
                    ))}
                  </ul>
                  <TextAction href="/timeline" variant="muted" className="mt-2">
                    Edit timeline to close gaps
                  </TextAction>
                </div>
              )}
              {data.analysis && (
                <button
                  type="button"
                  disabled={generating === "analysis"}
                  onClick={runAnalysis}
                  className="text-xs text-muted hover:text-foreground"
                >
                  {generating === "analysis" ? "Re-analyzing…" : "Re-run analysis"}
                </button>
              )}
            </div>
          )}

          {active === "cv" && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium">CV / Resume</h2>
              {!cvDoc && <GenerateControls docType="cv" />}
              {cvDoc && <DocActions doc={cvDoc} />}
            </div>
          )}

          {active === "cover_letter" && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium">Cover letter</h2>
              {!clDoc && <GenerateControls docType="cover_letter" />}
              {clDoc && <DocActions doc={clDoc} />}
            </div>
          )}

          {active === "downloads" && (
            <div className="space-y-4">
              <h2 className="text-sm font-medium">Downloads</h2>
              {data.documents.length === 0 && (
                <p className="text-sm text-muted">No generated files available for download.</p>
              )}
              {data.documents.map((doc) => (
                <div key={doc.id} className="rounded-card border border-border p-3">
                  <p className="text-sm font-medium">{doc.title}</p>
                  <p className="text-xs capitalize text-muted">
                    {doc.doc_type.replace("_", " ")} · {doc.template}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                    {doc.storage_key_pdf ? (
                      <TextAction
                        href={`/backend/api/documents/${doc.id}/download.pdf`}
                        variant="primary"
                      >
                        PDF
                      </TextAction>
                    ) : (
                      <span className="text-xs text-muted">PDF not ready</span>
                    )}
                    {doc.storage_key_docx ? (
                      <TextAction
                        href={`/backend/api/documents/${doc.id}/download.docx`}
                        variant="muted"
                      >
                        DOCX
                      </TextAction>
                    ) : (
                      <span className="text-xs text-muted">DOCX not ready</span>
                    )}
                    <TextAction href={`/documents/${doc.id}`} variant="muted">
                      Open
                    </TextAction>
                  </div>
                </div>
              ))}
            </div>
          )}

          {active === "danger" && (
            <div className="space-y-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
                <div>
                  <h2 className="text-sm font-medium text-danger">Danger zone</h2>
                  <p className="mt-1 text-sm text-muted">
                    Delete this history entry and all associated generated files (CV, cover letter,
                    PDFs, DOCX). Before deleting, available files will be downloaded automatically
                    so you don&apos;t lose them.
                  </p>
                </div>
              </div>

              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-card border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-medium text-danger transition hover:bg-danger/20"
                >
                  Delete this history…
                </button>
              ) : (
                <div className="space-y-3 rounded-card border border-danger/30 bg-danger/5 p-4">
                  <p className="text-sm font-medium text-danger">
                    Are you sure? This cannot be undone.
                  </p>
                  <p className="text-xs text-muted">
                    We will first trigger downloads for any available PDF/DOCX files, then permanently
                    remove the history and linked documents.
                  </p>
                  {deleteMsg && <p className="text-sm text-muted">{deleteMsg}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={handleDelete}
                      className="rounded-card bg-danger px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      {deleting ? "Working…" : "Yes, download then delete"}
                    </button>
                    <button
                      type="button"
                      disabled={deleting}
                      onClick={() => {
                        setConfirmDelete(false);
                        setDeleteMsg(null);
                      }}
                      className="rounded-card border border-border px-4 py-2 text-sm text-muted transition hover:bg-border/40"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
