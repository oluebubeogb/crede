"use client";

import { useEffect, useRef, useState } from "react";
import { Lightbulb, Loader2, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { useApi, useDebounced } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorNote, PageHeader, SkeletonList, SoftIcon, toast } from "@/components/ui/kit";

type Skill = { id: number; name: string; category: string; proficiency?: string | null; verified: boolean };
type Cat = { id: number; name: string; category?: string | null };
type Coverage = { skill_coverage: { skill: string; demand: number; met: number; missing: number }[] };

const CATS = [
  { key: "technical", label: "Technical" }, { key: "tool", label: "Tools" }, { key: "soft", label: "Soft skills" },
  { key: "language", label: "Languages" }, { key: "domain", label: "Domain" },
];
const LEVELS = ["beginner", "intermediate", "advanced", "expert"];

export default function SkillsPage() {
  const { data, error, loading, reload, setData } = useApi<Skill[]>("/skills");
  const { data: stats } = useApi<Coverage>("/profile/dashboard/stats");
  const [name, setName] = useState("");
  const [cat, setCat] = useState("technical");
  const [level, setLevel] = useState<string>("");
  const [sugg, setSugg] = useState<Cat[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const dq = useDebounced(name, 180);

  useEffect(() => {
    if (dq.trim().length < 2) { setSugg([]); return; }
    api.get<Cat[]>(`/skills/catalog/search?q=${encodeURIComponent(dq)}&limit=8`).then(setSugg).catch(() => setSugg([]));
  }, [dq]);

  const have = new Set((data || []).map((s) => s.name.toLowerCase()));
  const gaps = (stats?.skill_coverage || []).filter((r) => r.met === 0 && r.missing > 0 && !have.has(r.skill.toLowerCase())).slice(0, 6);

  async function add(n = name, c = cat) {
    const v = n.trim();
    if (!v) return;
    if (have.has(v.toLowerCase())) { toast("Already on your profile"); return; }
    setBusy(true);
    try {
      const s = await api.post<Skill>("/skills", { name: v, category: c, proficiency: level || null });
      setData([...(data || []), s]); setName(""); setLevel(""); setOpen(false); input.current?.focus();
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't add", "error"); } finally { setBusy(false); }
  }
  async function remove(s: Skill) {
    setData((data || []).filter((x) => x.id !== s.id));
    try { await api.delete(`/skills/${s.id}`); } catch { reload(); toast("Couldn't remove", "error"); }
  }

  const groups = CATS.map((c) => ({ ...c, items: (data || []).filter((s) => (s.category || "technical") === c.key) }))
    .concat([{ key: "other", label: "Other", items: (data || []).filter((s) => !CATS.some((c) => c.key === (s.category || "technical"))) }])
    .filter((g) => g.items.length);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Profile" title="Skills" lead="Skills feed your match score and CVs. Add the ones you can back up with your timeline." />

      <form className="card p-4 sm:p-5" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label className="label" htmlFor="skill">Add skill</label>
        <div className="relative">
          <input id="skill" ref={input} className="input" autoComplete="off" placeholder="e.g. SQL, Customer service, Figma" value={name}
            onChange={(e) => { setName(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
          {open && sugg.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-xl border border-border bg-surface p-1" style={{ boxShadow: "var(--shadow-hover)" }}>
              {sugg.map((s) => (
                <button key={s.id} type="button" onMouseDown={(e) => { e.preventDefault(); setName(s.name); setOpen(false); if (s.category && CATS.some((c) => c.key === s.category)) setCat(s.category); }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm nav-hover">
                  <span>{s.name}</span>{s.category && <span className="text-xs capitalize text-muted">{s.category}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {CATS.map((c) => <button key={c.key} type="button" onClick={() => setCat(c.key)} className={cn("chip", cat === c.key && "chip-active")}>{c.label}</button>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <select className="input h-9 w-auto py-0 text-sm" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Proficiency">
            <option value="">Proficiency (optional)</option>
            {LEVELS.map((l) => <option key={l} value={l} className="capitalize">{l[0].toUpperCase() + l.slice(1)}</option>)}
          </select>
          <button type="submit" className="btn btn-primary btn-sm" disabled={!name.trim() || busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add skill</button>
        </div>
      </form>

      {gaps.length > 0 && (
        <section className="mt-6 flex items-start gap-3 rounded-2xl bg-surface-2 p-4">
          <SoftIcon icon={Lightbulb} tint="amber" size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-medium">In demand in roles you could fit</p>
            <p className="text-xs text-muted">Only add what you genuinely have.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {gaps.map((g) => <button key={g.skill} type="button" onClick={() => add(g.skill, "technical")} className="chip capitalize"><Plus className="h-3 w-3" />{g.skill}<span className="text-muted">· {g.demand}</span></button>)}
            </div>
          </div>
        </section>
      )}

      <div className="mt-6">
        {error ? <ErrorNote message={error} onRetry={reload} /> : loading && !data ? <SkeletonList n={2} /> : !groups.length ? (
          <EmptyState icon={Lightbulb} title="No skills yet" body="Start with three to five you use every week." />
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.key}>
                <p className="eyebrow mb-2">{g.label} · {g.items.length}</p>
                <div className="flex flex-wrap gap-2">
                  {g.items.map((s) => (
                    <span key={s.id} className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-surface py-1.5 pl-3 pr-1.5 text-sm transition-colors hover:border-border-strong">
                      {s.name}{s.proficiency && <span className="text-[11px] capitalize text-muted">{s.proficiency}</span>}
                      <button type="button" onClick={() => remove(s)} aria-label={`Remove ${s.name}`} className="rounded-full p-0.5 text-muted opacity-60 transition hover:bg-surface-2 hover:text-foreground group-hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
                    </span>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
