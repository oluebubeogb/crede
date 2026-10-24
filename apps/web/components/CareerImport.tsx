"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Award, BriefcaseBusiness, Check, FileUp, GraduationCap, Loader2, Sparkles, Type, UploadCloud, Wrench, X } from "lucide-react";
import { api } from "@/lib/api";
import { cn, fmtMonth } from "@/lib/utils";
import { SoftIcon, toast, type Tint } from "@/components/ui/kit";

type Status = "new" | "update" | "duplicate";
type Entry = {
  key: string; job_title: string; organization: string; start_date: string; end_date: string | null; is_current: boolean; date_guessed?: boolean;
  location?: string | null; description?: string | null; responsibilities?: string[]; achievements?: string[]; field_of_study?: string | null; grade?: string | null;
  status: Status; match_id: number | null; changes: string[];
};
type Cert = { key: string; name: string; issuer: string | null; issued_at: string | null; credential_id?: string | null; credential_url?: string | null; status: Status; match_id: number | null };
type Text = { value: string; current: string | null; replace: boolean } | null;
type Proposal = {
  headline: Text; summary: Text; work: Entry[]; education: Entry[]; skills: { name: string; status: Status }[]; certifications: Cert[];
  counts: Record<string, number>; source: { filename: string; type: string; chars: number; parser: "ai" | "heuristic" | "structured" }; empty?: boolean;
};
type Result = { work: number; education: number; skills: number; certifications: number; updated: number; headline: boolean; summary: boolean };

const ACCEPT = ".pdf,.docx,.doc,.odt,.rtf,.txt,.md,.markdown,.csv,.tsv,.xlsx,.json,.html,.htm";
const FORMATS = ["PDF", "DOCX", "DOC", "TXT", "MD", "CSV", "XLSX", "RTF", "JSON"];
const STEPS = ["Reading your file", "Finding roles and education", "Spotting skills and certifications", "Checking against your profile"];
const PARSER: Record<string, string> = { ai: "AI parsed", heuristic: "Smart parse", structured: "Structured export" };

const range = (e: Entry) => `${e.date_guessed ? "Date unknown" : fmtMonth(e.start_date)} – ${e.is_current ? "Present" : e.end_date ? fmtMonth(e.end_date) : "—"}`;

function Check_({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={on} aria-label={label} disabled={disabled} onClick={onChange}
      className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-all",
        on ? "border-transparent bg-foreground text-background" : "border-border-strong bg-surface hover:border-foreground", disabled && "opacity-40")}>
      {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
    </button>
  );
}

function Badge({ s, changes }: { s: Status; changes?: string[] }) {
  if (s === "new") return <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">New</span>;
  if (s === "update") return <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-400" title={changes?.join(", ")}>Adds {changes?.join(", ") || "details"}</span>;
  return <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-muted">Already on profile</span>;
}

function Group({ icon, tint, title, n, total, onAll, children }: { icon: typeof Award; tint: Tint; title: string; n: number; total: number; onAll: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
      <div className="mb-2 flex items-center gap-2.5">
        <SoftIcon icon={icon} tint={tint} size="sm" />
        <p className="flex-1 text-sm font-semibold">{title} <span className="font-normal text-muted">· {n}/{total} selected</span></p>
        {total > 0 && <button type="button" className="link-muted text-xs" onClick={() => onAll(n < total)}>{n < total ? "Select all" : "None"}</button>}
      </div>
      {children}
    </section>
  );
}

export default function CareerImport({ onApplied, compact = false }: { onApplied?: () => void; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [file, setFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prop, setProp] = useState<Proposal | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const go = () => {
      if (window.location.hash === "#import" && ref.current) {
        ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
        setFlash(true); setTimeout(() => setFlash(false), 1600);
      }
    };
    go(); window.addEventListener("hashchange", go);
    return () => window.removeEventListener("hashchange", go);
  }, []);

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 900);
    return () => clearInterval(t);
  }, [busy]);

  const upload = useCallback(async (f: File) => {
    setError(null); setResult(null); setProp(null); setFile(f.name); setBusy(true);
    const fd = new FormData(); fd.append("file", f);
    try {
      const p = await api.postForm<Proposal>("/import/parse", fd);
      const s = new Set<string>();
      (["work", "education", "certifications"] as const).forEach((k) => p[k].forEach((x) => x.status !== "duplicate" && s.add(`${k}:${x.key}`)));
      p.skills.forEach((x) => x.status !== "duplicate" && s.add(`skills:${x.name}`));
      if (p.headline && !p.headline.replace) s.add("headline");
      if (p.summary && !p.summary.replace) s.add("summary");
      setSel(s); setProp(p);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't read that file"); } finally { setBusy(false); }
  }, []);

  const toggle = (k: string) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const setMany = (keys: string[], v: boolean) => setSel((s) => { const n = new Set(s); keys.forEach((k) => (v ? n.add(k) : n.delete(k))); return n; });

  const picked = useMemo(() => {
    if (!prop) return null;
    return {
      work: prop.work.filter((x) => sel.has(`work:${x.key}`)), education: prop.education.filter((x) => sel.has(`education:${x.key}`)),
      certifications: prop.certifications.filter((x) => sel.has(`certifications:${x.key}`)), skills: prop.skills.filter((x) => sel.has(`skills:${x.name}`)).map((x) => x.name),
      headline: sel.has("headline") ? prop.headline?.value ?? null : null, summary: sel.has("summary") ? prop.summary?.value ?? null : null,
    };
  }, [prop, sel]);
  const nPicked = picked ? picked.work.length + picked.education.length + picked.certifications.length + picked.skills.length + (picked.headline ? 1 : 0) + (picked.summary ? 1 : 0) : 0;

  async function apply() {
    if (!picked || !nPicked) return;
    setApplying(true);
    try {
      const r = await api.post<Result>("/import/apply", picked);
      setResult(r); setProp(null);
      toast("Imported — your profile is up to date");
      onApplied?.();
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't import", "error"); } finally { setApplying(false); }
  }
  const reset = () => { setProp(null); setResult(null); setError(null); setFile(null); };

  const keysOf = (k: "work" | "education" | "certifications") => (prop?.[k] || []).filter((x) => x.status !== "duplicate").map((x) => `${k}:${x.key}`);
  const nSel = (prefix: string) => [...sel].filter((k) => k.startsWith(prefix)).length;

  const entryRow = (k: "work" | "education", e: Entry) => {
    const key = `${k}:${e.key}`; const dup = e.status === "duplicate";
    return (
      <li key={key} className={cn("flex gap-3 rounded-xl px-2 py-2.5 transition-colors", !dup && "hover:bg-surface-2", dup && "opacity-60")}>
        <Check_ on={sel.has(key)} disabled={dup} onChange={() => toggle(key)} label={e.job_title} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-medium leading-snug">{e.job_title}{k === "education" && e.field_of_study && !e.job_title.includes(e.field_of_study) ? `, ${e.field_of_study}` : ""}</p>
            <Badge s={e.status} changes={e.changes} />
          </div>
          <p className="text-[13px] text-muted">{[e.organization, e.location].filter(Boolean).join(" · ")} <span className="tabular">· {range(e)}</span></p>
          {e.date_guessed && !dup && <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">No start date found — we&apos;ll add it as a placeholder you can edit.</p>}
          {!dup && !!(e.achievements?.length || e.responsibilities?.length) && (
            <ul className="mt-1 space-y-0.5 text-[12.5px] text-muted">
              {[...(e.achievements || []), ...(e.responsibilities || [])].slice(0, 3).map((a) => <li key={a} className="line-clamp-1">• {a}</li>)}
              {(e.achievements?.length || 0) + (e.responsibilities?.length || 0) > 3 && <li className="text-[11px]">+{(e.achievements?.length || 0) + (e.responsibilities?.length || 0) - 3} more</li>}
            </ul>
          )}
        </div>
      </li>
    );
  };

  return (
    <div id="import" ref={ref} className={cn("scroll-mt-20 rounded-[var(--radius)] transition-shadow duration-700", flash && "ring-2 ring-accent ring-offset-2 ring-offset-background")}>
      {!prop && !result && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f && !busy) upload(f); }}
          className={cn("card relative overflow-hidden border-dashed p-4 transition-all sm:p-5", drag ? "border-violet-400 bg-violet-500/5 scale-[1.01]" : "hover:border-border-strong")}>
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-violet-500/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 left-10 h-40 w-40 rounded-full bg-sky-500/10 blur-2xl" />
          {busy ? (
            <div className="relative flex items-center gap-4 py-2" aria-live="polite">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-surface-2"><Loader2 className="h-6 w-6 animate-spin text-accent" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{file}</p>
                <ul className="mt-1.5 space-y-1">
                  {STEPS.map((s, i) => (
                    <li key={s} className={cn("flex items-center gap-2 text-[13px] transition-colors", i < step ? "text-foreground" : i === step ? "text-foreground" : "text-muted opacity-50")}>
                      {i < step ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : i === step ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-3.5 w-3.5 rounded-full border border-border" />}{s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className={cn("relative flex gap-4", compact ? "items-center" : "flex-col sm:flex-row sm:items-center")}>
              <SoftIcon icon={UploadCloud} tint="violet" size="lg" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Import from a file</p>
                <p className="text-sm text-muted">Drop your CV, LinkedIn export or notes — we&apos;ll fill your timeline, education, skills and certifications. You review everything first.</p>
                {!compact && <div className="mt-2 flex flex-wrap gap-1">{FORMATS.map((f) => <span key={f} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] font-medium tracking-wide text-muted">{f}</span>)}</div>}
              </div>
              <button type="button" className="btn btn-primary shrink-0" onClick={() => input.current?.click()}><FileUp className="h-4 w-4" />Choose file</button>
              <input ref={input} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
            </div>
          )}
          {error && !busy && <p className="relative mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
          {!busy && !error && <p className="relative mt-3 text-[11px] text-muted">Files are read once to extract details and never stored.</p>}
        </div>
      )}

      {result && (
        <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
          <SoftIcon icon={Check} tint="emerald" size="lg" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Import complete</p>
            <p className="text-sm text-muted">{[
              result.work && `${result.work} role${result.work > 1 ? "s" : ""}`, result.education && `${result.education} education`,
              result.skills && `${result.skills} skill${result.skills > 1 ? "s" : ""}`, result.certifications && `${result.certifications} certification${result.certifications > 1 ? "s" : ""}`,
              result.updated && `${result.updated} updated`, result.headline && "headline", result.summary && "summary",
            ].filter(Boolean).join(" · ") || "Nothing new to add"}. Request verification anytime from <Link href="/verification" className="link">Verification</Link>.</p>
          </div>
          <div className="flex gap-2"><Link href="/skills" className="btn btn-soft btn-sm">Skills</Link><button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Import another</button></div>
        </div>
      )}

      {prop && (
        <div className="card overflow-hidden p-0">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
            <SoftIcon icon={Sparkles} tint="violet" size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">Review what we found</p>
              <p className="truncate text-xs text-muted">{prop.source.filename} · {PARSER[prop.source.parser] || "Parsed"}</p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm px-2" aria-label="Cancel" onClick={reset}><X className="h-4 w-4" /></button>
          </div>

          {prop.empty ? (
            <div className="p-5 text-sm text-muted">We couldn&apos;t find career details in this file. Try a CV, a LinkedIn export (Positions.csv, Education.csv, Skills.csv) or a text file with headings like Experience and Education. <button type="button" className="link" onClick={reset}>Try another file</button></div>
          ) : (
            <div className="space-y-3 bg-surface-2 p-3 sm:p-4">
              {(prop.headline || prop.summary) && (
                <Group icon={Type} tint="sky" title="Headline & summary" n={(sel.has("headline") ? 1 : 0) + (sel.has("summary") ? 1 : 0)} total={(prop.headline ? 1 : 0) + (prop.summary ? 1 : 0)}
                  onAll={(v) => setMany([prop.headline && "headline", prop.summary && "summary"].filter(Boolean) as string[], v)}>
                  <ul>
                    {(["headline", "summary"] as const).map((k) => prop[k] && (
                      <li key={k} className="flex gap-3 rounded-xl px-2 py-2.5 hover:bg-surface-2">
                        <Check_ on={sel.has(k)} onChange={() => toggle(k)} label={k} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{k}{prop[k]!.replace ? " · replaces current" : ""}</p>
                          <p className={cn("text-sm", k === "summary" && "line-clamp-3")}>{prop[k]!.value}</p>
                          {prop[k]!.replace && <p className="mt-0.5 line-clamp-1 text-xs text-muted line-through">{prop[k]!.current}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Group>
              )}
              {prop.work.length > 0 && <Group icon={BriefcaseBusiness} tint="blue" title="Experience" n={nSel("work:")} total={keysOf("work").length} onAll={(v) => setMany(keysOf("work"), v)}><ul>{prop.work.map((e) => entryRow("work", e))}</ul></Group>}
              {prop.education.length > 0 && <Group icon={GraduationCap} tint="violet" title="Education" n={nSel("education:")} total={keysOf("education").length} onAll={(v) => setMany(keysOf("education"), v)}><ul>{prop.education.map((e) => entryRow("education", e))}</ul></Group>}
              {prop.skills.length > 0 && (
                <Group icon={Wrench} tint="emerald" title="Skills" n={nSel("skills:")} total={prop.skills.filter((s) => s.status !== "duplicate").length}
                  onAll={(v) => setMany(prop.skills.filter((s) => s.status !== "duplicate").map((s) => `skills:${s.name}`), v)}>
                  <div className="flex flex-wrap gap-1.5 px-1 pb-1">
                    {prop.skills.map((s) => {
                      const k = `skills:${s.name}`; const dup = s.status === "duplicate"; const on = sel.has(k);
                      return (
                        <button key={k} type="button" disabled={dup} onClick={() => toggle(k)} title={dup ? "Already on your profile" : undefined}
                          className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px] transition-all",
                            dup ? "border-border text-muted opacity-60" : on ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" : "border-border text-muted hover:border-border-strong hover:text-foreground")}>
                          {(on || dup) && <Check className="h-3 w-3" />}{s.name}
                        </button>
                      );
                    })}
                  </div>
                </Group>
              )}
              {prop.certifications.length > 0 && (
                <Group icon={Award} tint="amber" title="Certifications" n={nSel("certifications:")} total={keysOf("certifications").length} onAll={(v) => setMany(keysOf("certifications"), v)}>
                  <ul>
                    {prop.certifications.map((c) => {
                      const key = `certifications:${c.key}`; const dup = c.status === "duplicate";
                      return (
                        <li key={key} className={cn("flex gap-3 rounded-xl px-2 py-2.5", !dup && "hover:bg-surface-2", dup && "opacity-60")}>
                          <Check_ on={sel.has(key)} disabled={dup} onChange={() => toggle(key)} label={c.name} />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><p className="text-sm font-medium">{c.name}</p><Badge s={c.status} /></div>
                            <p className="text-[13px] text-muted">{[c.issuer, c.issued_at && fmtMonth(c.issued_at)].filter(Boolean).join(" · ") || "Issuer not found"}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Group>
              )}
            </div>
          )}

          {!prop.empty && (
            <div className="sticky bottom-0 flex items-center gap-3 border-t border-border bg-surface px-4 py-3 backdrop-blur sm:px-5" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
              <p className="flex-1 text-xs text-muted">{nPicked ? `${nPicked} item${nPicked > 1 ? "s" : ""} will be added to your profile` : "Nothing selected"}</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>Cancel</button>
              <button type="button" className="btn btn-primary btn-sm" disabled={!nPicked || applying} onClick={apply}>
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Add {nPicked || ""} to profile
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
