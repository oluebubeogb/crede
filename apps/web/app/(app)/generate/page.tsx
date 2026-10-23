"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, FileText, Loader2, Mail, ScanSearch, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { SoftIcon, toast } from "@/components/ui/kit";

type Opt = { key: string; label: string; desc?: string };
type JobDetail = { job: { title: string; description?: string; requirements?: string; location?: string; organization?: { name?: string } } };
type Recent = { items: { id: number; title: string; organization?: string | null; analysis?: { score?: number | null } | null }[] };

function GenerateInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const jobId = sp.get("job");
  const [jd, setJd] = useState("");
  const [docType, setDocType] = useState<"cv" | "cover_letter">(sp.get("type") === "cover_letter" ? "cover_letter" : "cv");
  const [template, setTemplate] = useState("modern");
  const [busy, setBusy] = useState<"analyze" | "generate" | null>(null);
  const { data: opts } = useApi<{ templates: Opt[] }>("/documents/style-options");
  const { data: recent } = useApi<Recent>("/history?page_size=4");

  useEffect(() => {
    if (!jobId) return;
    api.get<JobDetail>(`/opportunities/${jobId}/match`).then(({ job }) => {
      setJd([`${job.title}${job.organization?.name ? ` at ${job.organization.name}` : ""}${job.location ? `, ${job.location}` : ""}.`, job.description, job.requirements ? `Requirements:\n${job.requirements}` : ""].filter(Boolean).join("\n\n"));
    }).catch(() => {});
  }, [jobId]);

  const ok = jd.trim().length >= 40;
  async function analyze() {
    setBusy("analyze");
    try { const h = await api.post<{ id: number }>("/history", { job_description: jd }); router.push(`/history/${h.id}`); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't analyse", "error"); setBusy(null); }
  }
  async function generate() {
    setBusy("generate");
    try { const r = await api.post<{ document_id: number }>("/generate", { job_description: jd, template, doc_type: docType }); router.push(`/documents/${r.document_id}`); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't start", "error"); setBusy(null); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <p className="eyebrow mb-1">Create</p>
        <h1 className="page-title">Tailor a document to a job</h1>
        <p className="page-lead">Paste the job description. We check your match first, then write from your verified timeline — never invented facts.</p>
      </header>

      <div className="card p-4 sm:p-5">
        <textarea className="input min-h-[240px] resize-y leading-relaxed" placeholder={"Senior Product Designer at Kuda, Lagos.\n\nRequirements:\n- 4+ years designing consumer apps\n- Figma and prototyping\n…"}
          value={jd} onChange={(e) => setJd(e.target.value)} aria-label="Job description" />
        <p className="mt-1.5 text-[11px] text-muted">Include the title, company and requirements for the best match.</p>

        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-[200px_minmax(0,1fr)]">
          <div>
            <p className="eyebrow mb-2">Document</p>
            <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1 sm:grid-cols-1 sm:rounded-2xl">
              {([["cv", "CV", FileText], ["cover_letter", "Cover letter", Mail]] as const).map(([k, l, I]) => (
                <button key={k} type="button" onClick={() => setDocType(k)} className={cn("flex items-center justify-center gap-1.5 rounded-full py-2 text-sm transition-colors sm:justify-start sm:rounded-xl sm:px-3", docType === k ? "bg-surface font-medium shadow-sm" : "text-muted")}>
                  <I className="h-4 w-4" />{l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="eyebrow mb-2">Starting template <span className="normal-case tracking-normal text-muted">· change anytime</span></p>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {(opts?.templates || []).map((t) => (
                <button key={t.key} type="button" onClick={() => setTemplate(t.key)} title={t.desc}
                  className={cn("chip shrink-0", template === t.key && "chip-active")}>{template === t.key && <Check className="h-3 w-3" />}{t.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn btn-soft" disabled={!ok || !!busy} onClick={analyze}>{busy === "analyze" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}Check my match</button>
          <button type="button" className="btn btn-primary" disabled={!ok || !!busy} onClick={generate}>{busy === "generate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Create {docType === "cv" ? "CV" : "cover letter"}</button>
        </div>
      </div>

      {!!recent?.items?.length && (
        <section className="mt-8">
          <div className="mb-2 flex items-center justify-between"><h2 className="section-title">Recent jobs</h2><Link href="/history" className="link-muted text-xs">All</Link></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {recent.items.slice(0, 4).map((h) => (
              <Link key={h.id} href={`/history/${h.id}`} className="card group flex items-center gap-3 p-3">
                <SoftIcon icon={ScanSearch} tint="sky" size="sm" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{h.title}</p><p className="truncate text-xs text-muted">{h.organization || "—"}</p></div>
                {h.analysis?.score != null && <span className="tabular text-sm font-semibold">{h.analysis.score}%</span>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function GeneratePage() {
  return <Suspense><GenerateInner /></Suspense>;
}
