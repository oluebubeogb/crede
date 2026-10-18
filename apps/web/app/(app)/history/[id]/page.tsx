"use client";

import { useCallback, useEffect, useState } from "react";
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

  const load = useCallback(() => {
    if (!id || Number.isNaN(id)) return;
    setLoading(true);
    setError(null);
    api
      .get<HistoryDetail>(`/history/${id}`)
      .then((d) => {
        setData(d);
        setActive("analysis");
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load history");
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const cvDoc = data?.documents.find((d) => d.doc_type === "cv");
  const clDoc = data?.documents.find((d) => d.doc_type === "cover_letter");

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

  if (error || !data) {
    return (
      <div className="space-y-0">
        <section className="note-section">
          <h1 className="page-title">History</h1>
          <p className="mt-2 text-sm text-danger">{error || "Not found"}</p>
          <TextAction href="/history" variant="muted" className="mt-3">
            Back to history
          </TextAction>
        </section>
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
              <textarea
                className="input min-h-[320px] py-3 font-mono text-sm"
                readOnly
                value={data.job_description}
              />
              <p className="text-xs text-muted">
                Exact content that was processed. You can copy it back into{" "}
                <Link href="/generate" className="text-accent hover:underline">
                  Generate Files
                </Link>
                .
              </p>
            </div>
          )}

          {active === "analysis" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Match analysis</h2>
                {data.analysis?.score != null && (
                  <p className="text-base font-semibold text-accent">{data.analysis.score}%</p>
                )}
              </div>
              {!data.analysis && (
                <p className="text-sm text-muted">No analysis was saved for this session.</p>
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
            </div>
          )}

          {active === "cv" && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium">CV / Resume</h2>
              {!cvDoc && (
                <p className="text-sm text-muted">
                  No CV was generated for this job description yet.{" "}
                  <Link href="/generate" className="text-accent hover:underline">
                    Generate one
                  </Link>
                  .
                </p>
              )}
              {cvDoc && (
                <>
                  <p className="text-sm font-medium">{cvDoc.title}</p>
                  <p className="text-xs capitalize text-muted">
                    Status: {cvDoc.status || "ready"} · Template: {cvDoc.template}
                  </p>
                  {cvDoc.status === "ready" && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <TextAction href={`/documents/${cvDoc.id}`} variant="primary">
                        Open document
                      </TextAction>
                      <span className="text-muted">·</span>
                      <TextAction
                        href={`/backend/api/documents/${cvDoc.id}/download.pdf`}
                        variant="muted"
                      >
                        Download PDF
                      </TextAction>
                      <span className="text-muted">·</span>
                      <TextAction
                        href={`/backend/api/documents/${cvDoc.id}/download.docx`}
                        variant="muted"
                      >
                        Download DOCX
                      </TextAction>
                    </div>
                  )}
                  {cvDoc.status === "failed" && (
                    <p className="text-sm text-danger">
                      {cvDoc.error_message || "Generation failed"}
                    </p>
                  )}
                  {(cvDoc.status === "pending" || cvDoc.status === "processing") && (
                    <p className="text-sm text-muted">Still generating… refresh in a moment.</p>
                  )}
                </>
              )}
            </div>
          )}

          {active === "cover_letter" && (
            <div className="space-y-3">
              <h2 className="text-sm font-medium">Cover letter</h2>
              {!clDoc && (
                <p className="text-sm text-muted">
                  No cover letter was generated for this job description yet.{" "}
                  <Link href="/generate" className="text-accent hover:underline">
                    Generate one
                  </Link>
                  .
                </p>
              )}
              {clDoc && (
                <>
                  <p className="text-sm font-medium">{clDoc.title}</p>
                  <p className="text-xs capitalize text-muted">
                    Status: {clDoc.status || "ready"} · Template: {clDoc.template}
                  </p>
                  {clDoc.status === "ready" && (
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <TextAction href={`/documents/${clDoc.id}`} variant="primary">
                        Open document
                      </TextAction>
                      <span className="text-muted">·</span>
                      <TextAction
                        href={`/backend/api/documents/${clDoc.id}/download.pdf`}
                        variant="muted"
                      >
                        Download PDF
                      </TextAction>
                      <span className="text-muted">·</span>
                      <TextAction
                        href={`/backend/api/documents/${clDoc.id}/download.docx`}
                        variant="muted"
                      >
                        Download DOCX
                      </TextAction>
                    </div>
                  )}
                  {clDoc.status === "failed" && (
                    <p className="text-sm text-danger">
                      {clDoc.error_message || "Generation failed"}
                    </p>
                  )}
                  {(clDoc.status === "pending" || clDoc.status === "processing") && (
                    <p className="text-sm text-muted">Still generating… refresh in a moment.</p>
                  )}
                </>
              )}
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
