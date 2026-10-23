"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, CircleAlert, Download, FileText, Loader2, Palette, PenLine, Share2, Sparkles, Trash2, ListChecks } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ErrorNote, Skeleton, SoftIcon, Switch, Tabs, toast } from "@/components/ui/kit";

type Style = { template: string; color: string; font: string; density: string; ats: boolean; show_verified: boolean };
type Opt = { key: string; label: string; desc?: string; hex?: string };
type StyleOptions = { templates: Opt[]; palettes: Opt[]; fonts: Opt[]; densities: Opt[]; defaults: Record<string, Partial<Style>> };
type Exp = { id: number; title: string; org: string; bullets: string[] };
type Content = {
  headline?: string; summary?: string; skills?: string[]; experience?: Exp[];
  salutation?: string; paragraphs?: string[]; closing?: string; subject?: string;
};
type Check = { key: string; ok: boolean; label: string; hint?: string };
type Doc = {
  id: number; title: string; doc_type: string; template: string; status: string; target_job_title?: string | null; target_organization?: string | null;
  error_message?: string | null; markdown?: string | null; style?: Style; pages?: number | null; checks: Check[]; content?: Content | null; legacy: boolean;
  matching_insights?: { label?: string; score?: number; counts?: { met: number; partial: number; missing: number }; missing?: string[]; strengths?: string[] } | null;
  history_id?: number | null; created_at: string;
};
type Tab = "style" | "content" | "checks";

const A4 = 794;

function qs(s: Style) {
  const p = new URLSearchParams({ template: s.template, color: s.color, font: s.font, density: s.density, ats: s.ats ? "1" : "0", show_verified: s.show_verified ? "1" : "0", keep: "1" });
  return p.toString();
}
const words = (ps: string[]) => ps.join(" ").split(/\s+/).filter(Boolean).length;

function Preview({ id, style, version }: { id: number; style: Style; version: number }) {
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  const [h, setH] = useState(1123);
  const [loading, setLoading] = useState(true);
  const [src, setSrc] = useState("");
  useEffect(() => {
    const t = setTimeout(() => { setLoading(true); setSrc(`/backend/api/documents/${id}/preview?${qs(style)}&v=${version}`); }, 180);
    return () => clearTimeout(t);
  }, [id, style, version]);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / A4)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const onLoad = () => {
    setLoading(false);
    try { const d = frame.current?.contentDocument; if (d) setH(Math.max(1123, d.documentElement.scrollHeight)); } catch { /* cross-origin */ }
  };
  return (
    <div ref={box} className="relative w-full">
      <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,.06),0_8px_30px_rgba(0,0,0,.08)] ring-1 ring-border" style={{ height: h * scale }}>
        {src && <iframe ref={frame} title="Document preview" src={src} onLoad={onLoad} scrolling="no"
          style={{ width: A4, height: h, transform: `scale(${scale})`, transformOrigin: "0 0", border: 0 }} />}
      </div>
      {loading && <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-xs text-muted shadow-sm ring-1 ring-border"><Loader2 className="h-3 w-3 animate-spin" />Updating</div>}
    </div>
  );
}

function StylePanel({ opts, style, set, isCv }: { opts: StyleOptions; style: Style; set: (s: Style) => void; isCv: boolean }) {
  const pickTemplate = (t: string) => set({ ...style, template: t, color: opts.defaults[t]?.color || style.color, font: opts.defaults[t]?.font || style.font, density: opts.defaults[t]?.density || "standard" });
  return (
    <div className="space-y-5">
      <div>
        <p className="eyebrow mb-2">Template</p>
        <div className="grid grid-cols-2 gap-2">
          {opts.templates.map((t) => (
            <button key={t.key} type="button" onClick={() => pickTemplate(t.key)}
              className={cn("rounded-xl border p-3 text-left transition-colors", style.template === t.key ? "border-foreground bg-surface-2" : "border-border hover:bg-surface-2")}>
              <span className="flex items-center justify-between text-sm font-medium">{t.label}{style.template === t.key && <Check className="h-3.5 w-3.5" />}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={cn(style.ats && "pointer-events-none opacity-40")}>
        <p className="eyebrow mb-2">Accent colour</p>
        <div className="flex flex-wrap items-center gap-2">
          {opts.palettes.map((p) => (
            <button key={p.key} type="button" title={p.label} aria-label={p.label} onClick={() => set({ ...style, color: p.hex! })}
              className={cn("h-8 w-8 rounded-full ring-offset-2 ring-offset-[var(--surface)] transition", style.color.toLowerCase() === p.hex!.toLowerCase() ? "ring-2 ring-foreground" : "hover:scale-110")}
              style={{ background: p.hex }} />
          ))}
          <label className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full ring-1 ring-border" title="Custom colour"
            style={{ background: "conic-gradient(#f43f5e,#f59e0b,#10b981,#0ea5e9,#8b5cf6,#f43f5e)" }}>
            <input type="color" value={style.color} onChange={(e) => set({ ...style, color: e.target.value.toUpperCase() })} className="absolute inset-0 opacity-0" />
          </label>
        </div>
      </div>
      <div>
        <p className="eyebrow mb-2">Font</p>
        <div className="flex flex-wrap gap-1.5">
          {opts.fonts.map((f) => <button key={f.key} type="button" onClick={() => set({ ...style, font: f.key })} className={cn("chip", style.font === f.key && "chip-active")}>{f.label}</button>)}
        </div>
      </div>
      <div>
        <p className="eyebrow mb-2">Spacing</p>
        <div className="grid grid-cols-3 rounded-full bg-surface-2 p-1">
          {opts.densities.map((d) => (
            <button key={d.key} type="button" onClick={() => set({ ...style, density: d.key })}
              className={cn("rounded-full py-1.5 text-xs transition-colors", style.density === d.key ? "bg-surface font-medium shadow-sm" : "text-muted")}>{d.label}</button>
          ))}
        </div>
      </div>
      <div className="divide-y divide-border rounded-xl border border-border">
        {isCv && (
          <div className="flex items-center justify-between gap-3 p-3">
            <div><p className="text-sm font-medium">ATS-friendly</p><p className="text-xs text-muted">Single column, no colour or sidebars, standard headings.</p></div>
            <Switch label="ATS-friendly" checked={style.ats} onChange={(v) => set({ ...style, ats: v })} />
          </div>
        )}
        <div className="flex items-center justify-between gap-3 p-3">
          <div><p className="text-sm font-medium">Show verified ticks</p><p className="text-xs text-muted">Mark claims confirmed on Crede.</p></div>
          <Switch label="Show verified" checked={style.show_verified} onChange={(v) => set({ ...style, show_verified: v })} />
        </div>
      </div>
    </div>
  );
}

function ContentPanel({ doc, onSaved }: { doc: Doc; onSaved: (d: Doc) => void }) {
  const c = doc.content || {};
  const letter = doc.doc_type === "cover_letter";
  const [headline, setHeadline] = useState(c.headline || "");
  const [summary, setSummary] = useState(c.summary || "");
  const [skills, setSkills] = useState((c.skills || []).join(", "));
  const [exp, setExp] = useState<Exp[]>(c.experience || []);
  const [salutation, setSalutation] = useState(c.salutation || "");
  const [body, setBody] = useState((c.paragraphs || []).join("\n\n"));
  const [closing, setClosing] = useState(c.closing || "");
  const [md, setMd] = useState(doc.markdown || "");
  const [busy, setBusy] = useState(false);
  const paras = body.split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const wc = words(paras);

  async function save() {
    setBusy(true);
    try {
      const payload = doc.legacy ? { markdown: md }
        : letter ? { content: { salutation, paragraphs: paras, closing } }
          : { content: { headline, summary, skills: skills.split(",").map((s) => s.trim()).filter(Boolean), experience: exp } };
      const d = await api.patch<Doc>(`/documents/${doc.id}`, payload);
      onSaved(d); toast("Saved — PDF and DOCX updated");
    } catch (e) { toast(e instanceof Error ? e.message : "Save failed", "error"); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">Edits are re-rendered by the template — no AI call, and your design stays intact.</p>
      {doc.legacy ? (
        <textarea className="input min-h-[420px] font-mono text-xs" value={md} onChange={(e) => setMd(e.target.value)} />
      ) : letter ? (
        <>
          <div><label className="label">Greeting</label><input className="input" value={salutation} onChange={(e) => setSalutation(e.target.value)} /></div>
          <div>
            <div className="flex items-baseline justify-between"><label className="label">Letter</label>
              <span className={cn("tabular text-xs", wc >= 250 && wc <= 400 ? "text-success" : "text-warning")}>{wc} words · aim 250–400</span></div>
            <textarea className="input min-h-[380px] leading-relaxed" value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="mt-1 text-[11px] text-muted">Leave a blank line between paragraphs.</p>
          </div>
          <div><label className="label">Sign-off</label><input className="input" value={closing} onChange={(e) => setClosing(e.target.value)} /></div>
        </>
      ) : (
        <>
          <div><label className="label">Headline</label><input className="input" value={headline} onChange={(e) => setHeadline(e.target.value)} /></div>
          <div><label className="label">Summary</label><textarea className="input min-h-[110px]" value={summary} onChange={(e) => setSummary(e.target.value)} /></div>
          {exp.map((x, i) => (
            <div key={x.id}>
              <label className="label">{x.title} · {x.org}</label>
              <textarea className="input min-h-[110px] text-sm" value={x.bullets.join("\n")}
                onChange={(e) => setExp(exp.map((y, j) => j === i ? { ...y, bullets: e.target.value.split("\n") } : y))} />
            </div>
          ))}
          {exp.length > 0 && <p className="-mt-2 text-[11px] text-muted">One achievement per line. Lead with a verb and a number where you can.</p>}
          <div><label className="label">Skills</label><input className="input" value={skills} onChange={(e) => setSkills(e.target.value)} /><p className="mt-1 text-[11px] text-muted">Comma-separated, most relevant first.</p></div>
        </>
      )}
      <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={save}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Save changes</button>
    </div>
  );
}

function ChecksPanel({ doc }: { doc: Doc }) {
  const m = doc.matching_insights;
  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {doc.checks.map((c) => (
          <li key={c.key} className="flex items-start gap-2.5 text-sm">
            {c.ok ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
            <span><span className="font-medium">{c.label}</span>{!c.ok && c.hint && <span className="block text-xs text-muted">{c.hint}</span>}</span>
          </li>
        ))}
      </ul>
      {m && m.score != null && (
        <div className="rounded-xl border border-border p-4">
          <p className="flex items-center justify-between text-sm"><span className="font-medium">Match for this job</span><span className="tabular font-semibold">{m.score}%</span></p>
          {m.counts && <p className="mt-1 text-xs text-muted">{m.counts.met} met · {m.counts.partial} partial · {m.counts.missing} missing</p>}
          {!!m.missing?.length && <div className="mt-3"><p className="eyebrow mb-1">Gaps</p><ul className="space-y-1 text-sm">{m.missing.slice(0, 5).map((x) => <li key={x} className="text-muted">• {x}</li>)}</ul></div>}
          {doc.history_id && <Link href={`/history/${doc.history_id}`} className="link mt-3 inline-block text-sm">See the full analysis</Link>}
        </div>
      )}
    </div>
  );
}

export default function DocumentPage() {
  const { id: raw } = useParams<{ id: string }>();
  const id = Number(raw);
  const router = useRouter();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [opts, setOpts] = useState<StyleOptions | null>(null);
  const [style, setStyle] = useState<Style | null>(null);
  const [saved, setSaved] = useState<Style | null>(null);
  const [tab, setTab] = useState<Tab>("style");
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");

  const accept = useCallback((d: Doc) => {
    setDoc(d); setTitle(d.title);
    if (d.style) { setStyle(d.style); setSaved(d.style); }
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    let stop = false; let t: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const d = await api.get<Doc>(`/documents/${id}`);
        if (stop) return;
        accept(d);
        if (d.status === "pending" || d.status === "processing") t = setTimeout(load, 2000);
      } catch (e) { if (!stop) setError(e instanceof Error ? e.message : "Couldn't load"); }
    };
    load();
    api.get<StyleOptions>("/documents/style-options").then(setOpts).catch(() => {});
    return () => { stop = true; clearTimeout(t); };
  }, [id, accept]);

  const dirty = useMemo(() => !!style && !!saved && JSON.stringify(style) !== JSON.stringify(saved), [style, saved]);

  async function saveStyle() {
    if (!style) return;
    setBusy(true);
    try { accept(await api.post<Doc>(`/documents/${id}/style`, style)); toast("Style saved — downloads updated"); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't save", "error"); } finally { setBusy(false); }
  }
  async function saveTitle() {
    if (!doc || !title.trim() || title === doc.title) return;
    try { const d = await api.patch<Doc>(`/documents/${id}`, { title }); setDoc({ ...doc, title: d.title }); } catch { setTitle(doc.title); }
  }
  async function remove() {
    if (!confirm("Delete this document?")) return;
    await api.delete(`/documents/${id}`).then(() => router.replace("/documents")).catch((e) => toast(e.message, "error"));
  }

  if (error) return <ErrorNote message={error} />;
  const generating = !doc || doc.status === "pending" || doc.status === "processing";
  const isCv = doc?.doc_type !== "cover_letter";

  return (
    <div>
      <Link href="/documents" className="link-muted mb-3 inline-flex items-center gap-1 text-sm"><ArrowLeft className="h-4 w-4" />Documents</Link>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          {doc ? <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            aria-label="Document title" className="page-title w-full rounded-lg bg-transparent outline-none hover:bg-surface-2 focus:bg-surface-2 -mx-1.5 px-1.5" /> : <Skeleton className="h-8 w-72" />}
          {doc && <p className="page-lead">{doc.doc_type === "cover_letter" ? "Cover letter" : "CV"}{doc.target_organization ? ` · ${doc.target_organization}` : ""}{doc.pages ? ` · ${doc.pages} page${doc.pages > 1 ? "s" : ""}` : ""}</p>}
        </div>
        {doc?.status === "ready" && (
          <div className="flex flex-wrap items-center gap-1">
            <a href={`/backend/api/documents/${id}/download.pdf`} className="btn btn-primary btn-sm"><Download className="h-4 w-4" />PDF</a>
            <a href={`/backend/api/documents/${id}/download.docx`} className="btn btn-soft btn-sm"><FileText className="h-4 w-4" />DOCX</a>
            <Link href="/feed?compose=1" className="btn btn-ghost btn-sm" title="Share a card on Community"><Share2 className="h-4 w-4" /><span className="hidden sm:inline">Share</span></Link>
            <button type="button" onClick={remove} className="btn btn-ghost btn-sm text-danger" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      {doc?.status === "failed" ? (
        <ErrorNote message={doc.error_message || "Generation failed. Try again from Create documents."} />
      ) : generating ? (
        <div className="card flex flex-col items-center p-10 text-center">
          <SoftIcon icon={Sparkles} tint="violet" size="lg" className="animate-pulse" />
          <p className="mt-4 font-semibold">Writing your document…</p>
          <p className="mt-1 text-sm text-muted">Tailoring content to the job. The design is applied after — usually under a minute.</p>
          <div className="mt-6 w-full max-w-md space-y-2"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-5/6" /></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="order-2 lg:order-1">
            <div className="card p-4 lg:sticky lg:top-[calc(var(--topbar-h)+16px)]">
              <Tabs value={tab} onChange={setTab} className="mb-4" items={[{ value: "style", label: "Style" }, { value: "content", label: "Content" }, { value: "checks", label: "Checks", count: doc.checks.filter((c) => !c.ok).length }]} />
              {tab === "style" && (opts && style ? <StylePanel opts={opts} style={style} set={setStyle} isCv={isCv} /> : <Skeleton className="h-64 w-full" />)}
              {tab === "content" && <ContentPanel key={version} doc={doc} onSaved={accept} />}
              {tab === "checks" && <ChecksPanel doc={doc} />}
              {tab === "style" && (
                <div className={cn("mt-5 flex gap-2 transition-opacity", dirty ? "opacity-100" : "pointer-events-none opacity-0")}>
                  <button type="button" className="btn btn-primary flex-1" disabled={busy} onClick={saveStyle}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Palette className="h-4 w-4" />}Save style</button>
                  <button type="button" className="btn btn-soft" onClick={() => setStyle(saved)}>Reset</button>
                </div>
              )}
            </div>
          </aside>
          <section className="order-1 lg:order-2">
            {dirty && <p className="mb-2 flex items-center gap-1.5 text-xs text-muted"><PenLine className="h-3.5 w-3.5" />Previewing unsaved style</p>}
            {style && <Preview id={id} style={style} version={version} />}
            {doc.checks.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {doc.checks.map((c) => <span key={c.key} className={cn("pill", c.ok ? "pill-green" : "pill-amber")} title={c.ok ? undefined : c.hint}>{c.ok ? <Check className="h-3 w-3" /> : <ListChecks className="h-3 w-3" />}{c.label}</span>)}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
