"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, Copy, FileText, Loader2, Mail, Minus, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";
import { EmptyState, ErrorNote, RowLink, Skeleton, SoftIcon, Tabs, toast } from "@/components/ui/kit";
import { MatchBreakdown, MatchScore, type MatchResult } from "@/components/MatchScore";

type Evidence = { id?: number; label: string; detail?: string; source: string; status?: string; level?: string };
type Req = { id: string; kind: string; text: string; status: "met" | "partial" | "missing"; priority: "must" | "nice"; evidence: Evidence[]; missing_terms: string[]; suggestion?: string };
type Analysis = MatchResult & { requirements?: Req[]; gaps?: string[]; strengths?: string[]; years?: number; years_needed?: number; parsed?: { title?: string; seniority?: string } };
type Doc = { id: number; title: string; doc_type: string; status: string; template: string; created_at: string };
type History = { id: number; title: string; organization?: string | null; job_description: string; analysis?: Analysis | null; documents: Doc[]; created_at: string };
type Filter = "all" | "met" | "partial" | "missing";

const STATUS = {
  met: { icon: Check, cls: "text-success", bg: "bg-[color-mix(in_srgb,var(--success)_12%,transparent)]", label: "Met" },
  partial: { icon: Minus, cls: "text-warning", bg: "bg-[color-mix(in_srgb,var(--warning)_14%,transparent)]", label: "Partial" },
  missing: { icon: X, cls: "text-danger", bg: "bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]", label: "Missing" },
} as const;

const SOURCE_HREF: Record<string, string> = { skill: "/skills", timeline: "/timeline", education: "/timeline", certification: "/certifications" };

function ReqRow({ r }: { r: Req }) {
  const [open, setOpen] = useState(r.status !== "met");
  const s = STATUS[r.status];
  const Icon = s.icon;
  return (
    <li className="border-b border-border last:border-0">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 py-3 text-left">
        <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full", s.bg, s.cls)}><Icon className="h-3.5 w-3.5" strokeWidth={2.5} /></span>
        <span className="min-w-0 flex-1">
          <span className="text-sm leading-snug">{r.text}</span>
          <span className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-muted">
            <span>{r.priority === "must" ? "Must-have" : "Nice to have"}</span>·<span className="capitalize">{r.kind}</span>
            {r.missing_terms.length > 0 && r.status !== "met" && <>·<span>missing {r.missing_terms.join(", ")}</span></>}
          </span>
        </span>
        <ChevronDown className={cn("mt-1 h-4 w-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mb-3 ml-9 space-y-2">
          {r.evidence.length > 0 ? (
            <ul className="space-y-1">
              {r.evidence.map((e, i) => (
                <li key={i} className="flex items-baseline gap-2 text-sm">
                  <span className="text-muted">↳</span>
                  <span><span className="font-medium">{e.label}</span>{e.detail && <span className="text-muted"> — {e.detail}</span>}
                    {e.level && e.level !== "self" && <span className="pill pill-green ml-1.5">verified</span>}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">Nothing in your profile backs this yet.</p>}
          {r.suggestion && (
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="eyebrow mb-1">Suggested bullet</p>
              <p className="text-sm">{r.suggestion}</p>
              <div className="mt-2 flex gap-3 text-xs">
                <button type="button" className="link" onClick={() => navigator.clipboard?.writeText(r.suggestion!).then(() => toast("Copied"))}><Copy className="mr-1 inline h-3 w-3" />Copy</button>
                <Link className="link" href={r.kind === "skill" ? "/skills" : "/timeline"}>{r.kind === "skill" ? "Add skill" : "Add to timeline"}</Link>
              </div>
            </div>
          )}
          {!r.suggestion && r.status !== "met" && SOURCE_HREF[r.kind === "skill" ? "skill" : "timeline"] && (
            <Link className="link text-xs" href={r.kind === "skill" ? "/skills" : r.kind === "education" ? "/timeline" : "/timeline"}>Update your profile</Link>
          )}
        </div>
      )}
    </li>
  );
}

export default function HistoryDetailPage() {
  const { id: raw } = useParams<{ id: string }>();
  const id = Number(raw);
  const router = useRouter();
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [showJd, setShowJd] = useState(false);
  const alive = useRef(true);

  const load = useCallback(() => api.get<History>(`/history/${id}`).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, [load]);

  async function reanalyze() {
    setBusy("analysis");
    try { setData(await api.post<History>(`/history/${id}/analyze`)); toast("Analysis refreshed"); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } finally { setBusy(null); }
  }
  async function generate(doc_type: "cv" | "cover_letter") {
    if (!data) return;
    setBusy(doc_type);
    try {
      const r = await api.post<{ document_id: number }>("/generate", { history_id: id, job_description: data.job_description, doc_type, template: "modern" });
      router.push(`/documents/${r.document_id}`);
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't start", "error"); setBusy(null); }
  }
  async function remove() {
    if (!confirm("Delete this job and its documents? Download anything you need first.")) return;
    try { await api.delete(`/history/${id}`); router.replace("/history"); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  }

  if (error) return <ErrorNote message={error} />;
  if (!data) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>;

  const a = data.analysis;
  const reqs = a?.requirements || [];
  const shown = filter === "all" ? reqs : reqs.filter((r) => r.status === filter);
  const counts = { met: reqs.filter((r) => r.status === "met").length, partial: reqs.filter((r) => r.status === "partial").length, missing: reqs.filter((r) => r.status === "missing").length };

  return (
    <div>
      <Link href="/history" className="link-muted mb-3 inline-flex items-center gap-1 text-sm"><ArrowLeft className="h-4 w-4" />Applications</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="page-title">{data.title}</h1>
          <p className="page-lead">{data.organization || "Organisation not detected"} · added {timeAgo(data.created_at)}</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-soft btn-sm" onClick={reanalyze} disabled={!!busy}>{busy === "analysis" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Re-check</button>
          <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={remove} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="card p-5">
            <div className="flex items-center gap-4">
              <MatchScore match={a} size={64} align="left" />
              <div className="min-w-0">
                <p className="font-semibold">{a?.insufficient ? "Not enough profile data yet" : a?.label || "Match"}</p>
                <p className="text-sm text-muted">{counts.met} met · {counts.partial} partial · {counts.missing} missing{a?.years != null && a?.years_needed ? ` · ${a.years} yrs vs ${a.years_needed}+ needed` : ""}</p>
              </div>
            </div>
            {a && <div className="mt-4"><MatchBreakdown match={a} compact /></div>}
          </section>

          <section className="card p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="section-title">Requirements</h2>
              <Tabs value={filter} onChange={setFilter} items={[{ value: "all", label: "All", count: reqs.length }, { value: "met", label: "Met", count: counts.met }, { value: "partial", label: "Partial", count: counts.partial }, { value: "missing", label: "Missing", count: counts.missing }]} />
            </div>
            {reqs.length === 0 ? <EmptyState icon={Sparkles} title="No requirements found" body="We couldn't pick out requirements from this description. Try Re-check, or paste a fuller job description." />
              : shown.length === 0 ? <p className="py-6 text-center text-sm text-muted">Nothing here.</p>
                : <ul>{shown.map((r) => <ReqRow key={r.id + filter} r={r} />)}</ul>}
          </section>

          <section className="card p-5">
            <button type="button" className="flex w-full items-center justify-between" onClick={() => setShowJd(!showJd)}>
              <h2 className="section-title">Job description</h2><ChevronDown className={cn("h-4 w-4 text-muted transition-transform", showJd && "rotate-180")} />
            </button>
            {showJd && <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-muted">{data.job_description}</pre>}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="section-title mb-3">Tailored documents</h2>
            {data.documents.length > 0 && (
              <div className="-mx-2 mb-3">
                {data.documents.map((d) => (
                  <RowLink key={d.id} href={`/documents/${d.id}`} icon={d.doc_type === "cv" ? FileText : Mail} tint={d.doc_type === "cv" ? "blue" : "violet"}
                    title={d.title} sub={`${d.status === "ready" ? d.template : d.status} · ${timeAgo(d.created_at)}`} />
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => generate("cv")}>{busy === "cv" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}New CV</button>
              <button type="button" className="btn btn-soft btn-sm" disabled={!!busy} onClick={() => generate("cover_letter")}>{busy === "cover_letter" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Cover letter</button>
            </div>
          </section>
          {!!a?.strengths?.length && (
            <section className="card p-5">
              <div className="mb-2 flex items-center gap-2"><SoftIcon icon={Check} tint="emerald" size="sm" /><h2 className="section-title">Lead with these</h2></div>
              <ul className="space-y-1.5 text-sm text-muted">{a.strengths.slice(0, 5).map((s) => <li key={s}>{s}</li>)}</ul>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
