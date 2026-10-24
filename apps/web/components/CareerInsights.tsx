"use client";
/* Rich, deterministic career insights (server: GET /profile/insights).
 * Compact bars + collapsible sections; optional cached AI narrative on top. */
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Award, ChevronDown, Compass, Gauge, Lightbulb, Loader2, Sparkles, Target, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Skeleton, SoftIcon } from "@/components/ui/kit";

type StrengthRow = { key: string; label: string; value: number; tier: "strong" | "good" | "weak"; detail: string; href: string };
type SkillRow = { skill: string; demand: number; have: boolean; partial: boolean };
type Insights = {
  summary: string; overall: { value: number; tier: string };
  strength: StrengthRow[];
  trajectory: {
    years: number; roles: number; orgs: number; avg_tenure_months: number | null; current_tenure_months: number | null;
    seniority: string | null; seniority_inferred?: boolean; seniority_label: string; next_label: string | null; years_to_next: number | null;
    progression: { title: string; org: string; start: string | null; current: boolean }[]; gaps: { from: string; to: string; months: number }[];
  };
  skills: { top: { name: string; verified: boolean; evidence: number; demand: number; score: number }[]; in_demand: SkillRow[]; missing: SkillRow[]; sources: { open_roles: number; tailored_jds: number } };
  certifications: { name: string; issuer: string | null; reason: string }[];
  actions: { key: string; title: string; body: string; href: string; impact: "high" | "medium" | "low" }[];
  ai: { text: string; generated_on: string } | null; ai_available: boolean;
};

const TIER_BAR: Record<string, string> = { strong: "bg-success", good: "bg-accent", weak: "bg-warning" };
const IMPACT: Record<string, string> = { high: "pill pill-red", medium: "pill pill-amber", low: "pill pill-gray" };
const fmtMonths = (m: number | null) => (m == null ? "—" : m >= 12 ? `${(m / 12).toFixed(m % 12 ? 1 : 0)} yr` : `${m} mo`);

function Bar({ value, className }: { value: number; className: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className={cn("h-full rounded-full transition-[width] duration-700 ease-out", className)} style={{ width: `${Math.max(4, Math.round(value * 100))}%` }} />
    </div>
  );
}

function Section({ id, title, icon, tint, count, open, onToggle, children }: {
  id: string; title: string; icon: typeof Gauge; tint: "blue" | "emerald" | "amber" | "violet" | "rose" | "sky"; count?: string; open: boolean; onToggle: (id: string) => void; children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border first:border-t-0">
      <button type="button" onClick={() => onToggle(id)} aria-expanded={open}
        className="group -mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-xl px-2 py-3 text-left nav-hover">
        <SoftIcon icon={icon} tint={tint} size="sm" />
        <span className="flex-1 text-sm font-semibold">{title}</span>
        {count && <span className="text-xs text-muted tabular">{count}</span>}
        <ChevronDown className={cn("h-4 w-4 text-muted transition-transform duration-200", open && "rotate-180")} />
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden"><div className="pb-4 pt-1">{children}</div></div>
      </div>
    </div>
  );
}

export default function CareerInsights() {
  const { data: d, error } = useApi<Insights>("/profile/insights");
  const [open, setOpen] = useState<Record<string, boolean>>({ actions: true, strength: true });
  const [ai, setAi] = useState<Insights["ai"]>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const toggle = (id: string) => setOpen((o) => ({ ...o, [id]: !o[id] }));

  useEffect(() => {
    if (!d) return;
    setAi(d.ai);
    if (!d.ai && d.ai_available) {
      setAiBusy(true);
      api.post<{ ai: Insights["ai"] }>("/profile/insights/narrative").then((r) => setAi(r.ai)).catch(() => {}).finally(() => setAiBusy(false));
    }
  }, [d]);

  if (error) return null;
  if (!d) return <section className="card p-5"><Skeleton className="mb-3 h-5 w-40" /><Skeleton className="h-4 w-3/4" /><div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div></section>;

  const t = d.trajectory;
  const src = d.skills.sources;
  const maxDemand = Math.max(1, ...d.skills.in_demand.map((r) => r.demand));
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5"><SoftIcon icon={Lightbulb} tint="amber" size="sm" /><h2 className="section-title">Career insights</h2></div>
        <span className={cn("pill", d.overall.tier === "strong" ? "pill-green" : d.overall.tier === "good" ? "pill-blue" : "pill-amber")}>
          Profile {d.overall.tier}
        </span>
      </div>
      <p className="text-[15px] font-medium leading-snug">{d.summary}</p>
      {(ai || aiBusy) && (
        <div className="mt-3 flex gap-2.5 rounded-2xl p-3 text-sm" style={{ background: "color-mix(in srgb, var(--violet) 8%, transparent)" }}>
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--violet)" }} />
          {aiBusy && !ai ? <span className="flex items-center gap-2 text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" />Reading your career…</span>
            : <p className="text-muted">{ai?.text}</p>}
        </div>
      )}

      {/* Key numbers */}
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {([["Experience", t.years ? `${t.years} yr` : "—"], ["Level", t.seniority_label + (t.seniority_inferred ? "*" : "")],
          ["Avg tenure", fmtMonths(t.avg_tenure_months)], ["Roles · orgs", `${t.roles} · ${t.orgs}`]] as const).map(([k, v]) => (
          <div key={k} className="rounded-xl bg-surface-2 px-3 py-2.5"><p className="truncate text-sm font-semibold tabular">{v}</p><p className="text-[11px] text-muted">{k}</p></div>
        ))}
      </div>

      <div className="mt-3">
        <Section id="actions" title="Next steps" icon={Target} tint="blue" count={`${d.actions.length}`} open={!!open.actions} onToggle={toggle}>
          {d.actions.length ? (
            <ul className="space-y-1">
              {d.actions.map((a) => (
                <li key={a.key}>
                  <Link href={a.href} className="group -mx-2 flex items-start gap-3 rounded-xl px-2 py-2 nav-hover">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">{a.title}<span className={IMPACT[a.impact]}>{a.impact}</span></p>
                      <p className="text-xs text-muted">{a.body}</p>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">You&apos;re in great shape — keep your timeline current.</p>}
        </Section>

        <Section id="strength" title="Strength breakdown" icon={Gauge} tint="emerald" count={`${Math.round(d.overall.value * 100)}/100`} open={!!open.strength} onToggle={toggle}>
          <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {d.strength.map((r) => (
              <li key={r.key}>
                <Link href={r.href} className="group block">
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium group-hover:underline">{r.label}</span>
                    <span className="text-[11px] capitalize text-muted">{r.tier}</span>
                  </div>
                  <Bar value={r.value} className={TIER_BAR[r.tier] || "bg-accent"} />
                  <p className="mt-1 truncate text-[11px] text-muted">{r.detail}</p>
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="skills" title="Skills vs demand" icon={TrendingUp} tint="violet" count={d.skills.missing.length ? `${d.skills.missing.length} gap${d.skills.missing.length === 1 ? "" : "s"}` : undefined} open={!!open.skills} onToggle={toggle}>
          {d.skills.top.length > 0 && (
            <div className="mb-4">
              <p className="eyebrow mb-2">Your strongest skills</p>
              <div className="flex flex-wrap gap-1.5">
                {d.skills.top.map((s) => <span key={s.name} className={cn("pill", s.verified ? "pill-green" : "pill-blue")}>{s.name}{s.demand > 0 && <span className="opacity-70">· {s.demand}</span>}</span>)}
              </div>
            </div>
          )}
          {d.skills.in_demand.length > 0 ? (
            <>
              <p className="eyebrow mb-2">In demand · from {src.open_roles} open role{src.open_roles === 1 ? "" : "s"}{src.tailored_jds ? ` and ${src.tailored_jds} tailored JD${src.tailored_jds === 1 ? "" : "s"}` : ""}</p>
              <ul className="space-y-2">
                {d.skills.in_demand.slice(0, 8).map((r) => (
                  <li key={r.skill} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
                    <span className="truncate">{r.skill}</span>
                    <Bar value={r.demand / maxDemand} className={r.have ? "bg-success" : r.partial ? "bg-warning" : "bg-danger opacity-70"} />
                    <span className={cn("text-[11px]", r.have ? "text-success" : "text-muted")}>{r.have ? "You have it" : r.partial ? "Partial" : "Missing"}</span>
                  </li>
                ))}
              </ul>
              {d.skills.missing.length > 0 && <Link href="/skills" className="link mt-3 inline-flex items-center gap-1 text-xs">Add missing skills<ArrowRight className="h-3 w-3" /></Link>}
            </>
          ) : <p className="text-sm text-muted">When roles open or you tailor a CV to a job, we&apos;ll compare what employers ask for with your skills.</p>}
        </Section>

        <Section id="trajectory" title="Trajectory" icon={Compass} tint="sky" count={t.next_label ? `next: ${t.next_label}` : undefined} open={!!open.trajectory} onToggle={toggle}>
          {t.progression.length ? (
            <>
              <ol className="relative ml-1.5 space-y-3 border-l border-border pl-4">
                {t.progression.map((r, i) => (
                  <li key={i} className="relative">
                    <span className={cn("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-surface", r.current ? "bg-accent" : "bg-border-strong")} />
                    <p className="text-sm font-medium">{r.title} <span className="font-normal text-muted">· {r.org}</span></p>
                    <p className="text-[11px] text-muted">{r.start ? new Date(r.start).getFullYear() : ""}{r.current ? " – now" : ""}</p>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-xs text-muted">
                {t.current_tenure_months != null && <>In your current role for {fmtMonths(t.current_tenure_months)}. </>}
                {t.next_label && (t.years_to_next ? <>Typical move to <b className="text-foreground">{t.next_label}</b> comes {t.years_to_next < 1 ? "within the next year" : `with around ${Math.ceil(t.years_to_next)} more years`} of experience.</>
                  : <>Your experience already fits <b className="text-foreground">{t.next_label}</b>-level roles — leadership evidence (team size, budgets) helps.</>)}
                {t.gaps.length > 0 && <> {t.gaps.length} gap{t.gaps.length === 1 ? "" : "s"} of 6+ months — a line on what you did helps.</>}
                {t.seniority_inferred && <> *Level inferred from years, as your titles don&apos;t state one.</>}
              </p>
            </>
          ) : <p className="text-sm text-muted">Add roles to your <Link href="/timeline" className="link">Career Timeline</Link> — or upload a CV — to see your trajectory.</p>}
        </Section>

        <Section id="certs" title="Certifications to consider" icon={Award} tint="amber" count={d.certifications.length ? `${d.certifications.length}` : undefined} open={!!open.certs} onToggle={toggle}>
          {d.certifications.length ? (
            <ul className="space-y-2">
              {d.certifications.map((c) => (
                <li key={c.name} className="flex items-start gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
                  <Award className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--amber)" }} />
                  <div className="min-w-0"><p className="text-sm font-medium">{c.name}</p><p className="text-[11px] text-muted">{c.issuer ? `${c.issuer} · ` : ""}{c.reason}</p></div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">Add skills to get certification ideas that build on them.</p>}
          <Link href="/certifications" className="link mt-3 inline-flex items-center gap-1 text-xs">Add a certification<ArrowRight className="h-3 w-3" /></Link>
        </Section>
      </div>
    </section>
  );
}
