"use client";

import { useEffect, useState } from "react";
import { BriefcaseBusiness, ChevronDown, GraduationCap, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { cn, fmtMonth } from "@/lib/utils";
import { EmptyState, ErrorNote, PageHeader, Sheet, SkeletonList, SoftIcon, Switch, toast } from "@/components/ui/kit";
import { OrgPicker, VerifyLine, type VInfo } from "@/components/orgs";

type Entry = {
  id: number; entry_type: "work" | "education"; job_title: string; organization: string; organization_id?: number | null; field_of_study?: string | null; grade?: string | null;
  location?: string | null; industry?: string | null; employment_type?: string | null; start_date: string; end_date?: string | null; is_current: boolean;
  description?: string | null; responsibilities?: string[] | null; achievements?: string[] | null; verification_status?: string; verification?: VInfo;
};
type Form = {
  id?: number; entry_type: "work" | "education"; job_title: string; organization: string; organization_id: number | null; can_verify?: boolean; field_of_study: string; grade: string;
  location: string; employment_type: string; start: string; end: string; is_current: boolean; description: string; responsibilities: string; achievements: string;
};
const EMP = [["full_time", "Full-time"], ["part_time", "Part-time"], ["contract", "Contract"], ["internship", "Internship"], ["nysc", "NYSC"], ["volunteer", "Volunteer"], ["freelance", "Freelance"]] as const;
const blank = (t: "work" | "education"): Form => ({ entry_type: t, job_title: "", organization: "", organization_id: null, field_of_study: "", grade: "", location: "", employment_type: "full_time", start: "", end: "", is_current: false, description: "", responsibilities: "", achievements: "" });
const lines = (s: string) => s.split("\n").map((x) => x.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);

function period(e: Entry) { return `${fmtMonth(e.start_date)} – ${e.is_current ? "Present" : e.end_date ? fmtMonth(e.end_date) : "—"}`; }

function EntryCard({ e, onEdit, onDelete }: { e: Entry; onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const edu = e.entry_type === "education";
  const more = !!(e.description || e.achievements?.length || e.responsibilities?.length);
  return (
    <li className="relative pl-12">
      <span className="absolute left-0 top-4"><SoftIcon icon={edu ? GraduationCap : BriefcaseBusiness} tint={edu ? "violet" : "blue"} size="sm" /></span>
      <div className="card group p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-snug">{e.job_title}{edu && e.field_of_study ? `, ${e.field_of_study}` : ""}</p>
            <p className="text-sm text-muted">{[e.organization, e.location, !edu && EMP.find((x) => x[0] === e.employment_type)?.[1], edu && e.grade].filter(Boolean).join(" · ")}</p>
            <p className="mt-0.5 text-xs tabular text-muted">{period(e)}</p>
          </div>
          <div className="flex shrink-0 gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
            <button type="button" className="btn btn-ghost btn-sm px-2" aria-label="Edit" onClick={onEdit}><Pencil className="h-4 w-4" /></button>
            <button type="button" className="btn btn-ghost btn-sm px-2 text-danger" aria-label="Delete" onClick={onDelete}><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <VerifyLine status={e.verification_status} info={e.verification} orgName={e.organization} kind={edu ? "school" : "company"} />
          {more && <button type="button" onClick={() => setOpen(!open)} className="link-muted inline-flex items-center gap-0.5 text-xs">{open ? "Less" : "Details"}<ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} /></button>}
        </div>
        {open && (
          <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm">
            {e.description && <p className="text-muted">{e.description}</p>}
            {!!e.achievements?.length && <ul className="list-disc space-y-1 pl-5">{e.achievements.map((a) => <li key={a}>{a}</li>)}</ul>}
            {!!e.responsibilities?.length && <ul className="list-disc space-y-1 pl-5 text-muted">{e.responsibilities.map((a) => <li key={a}>{a}</li>)}</ul>}
          </div>
        )}
      </div>
    </li>
  );
}

export default function TimelinePage() {
  const { data, error, loading, reload, setData } = useApi<Entry[]>("/timeline");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const add = new URLSearchParams(window.location.search).get("add");
    if (add === "education" || add === "work") setForm(blank(add));
  }, []);

  const sorted = [...(data || [])].sort((a, b) => (b.is_current ? 1 : 0) - (a.is_current ? 1 : 0) || b.start_date.localeCompare(a.start_date));
  const work = sorted.filter((e) => e.entry_type !== "education");
  const edu = sorted.filter((e) => e.entry_type === "education");

  function edit(e: Entry) {
    setForm({ id: e.id, entry_type: e.entry_type === "education" ? "education" : "work", job_title: e.job_title, organization: e.organization, organization_id: e.organization_id || null,
      field_of_study: e.field_of_study || "", grade: e.grade || "", location: e.location || "", employment_type: e.employment_type || "full_time",
      start: e.start_date.slice(0, 7), end: (e.end_date || "").slice(0, 7), is_current: e.is_current, description: e.description || "",
      responsibilities: (e.responsibilities || []).join("\n"), achievements: (e.achievements || []).join("\n") });
  }
  async function save() {
    if (!form) return;
    if (!form.job_title.trim() || !form.organization.trim() || !form.start) { toast("Title, organisation and start date are required", "error"); return; }
    setBusy(true);
    const edu = form.entry_type === "education";
    const body = {
      entry_type: form.entry_type, job_title: form.job_title.trim(), organization: form.organization.trim(), organization_id: form.organization_id,
      field_of_study: edu ? form.field_of_study || null : null, grade: edu ? form.grade || null : null, location: form.location || null,
      employment_type: edu ? null : form.employment_type, start_date: `${form.start}-01`, end_date: form.is_current || !form.end ? null : `${form.end}-01`,
      is_current: form.is_current, description: form.description || null,
      responsibilities: edu ? null : lines(form.responsibilities), achievements: lines(form.achievements),
    };
    try {
      const e = form.id ? await api.patch<Entry>(`/timeline/${form.id}`, body) : await api.post<Entry>("/timeline", body);
      setData(form.id ? (data || []).map((x) => (x.id === e.id ? e : x)) : [...(data || []), e]);
      toast(e.verification?.status === "pending" ? `Saved — ${e.verification.org?.name} has been asked to confirm` : "Saved");
      setForm(null);
    } catch (err) { toast(err instanceof Error ? err.message : "Couldn't save", "error"); } finally { setBusy(false); }
  }
  async function remove(e: Entry) {
    if (!confirm(`Delete ${e.job_title}?`)) return;
    setData((data || []).filter((x) => x.id !== e.id));
    try { await api.delete(`/timeline/${e.id}`); } catch { reload(); }
  }

  const isEdu = form?.entry_type === "education";
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Profile" title="Career timeline" lead="Your roles and education. Pick organisations from the list so they can verify you."
        action={<div className="flex gap-1.5"><button type="button" className="btn btn-soft btn-sm" onClick={() => setForm(blank("education"))}><GraduationCap className="h-4 w-4" /><span className="hidden sm:inline">Education</span></button><button type="button" className="btn btn-primary btn-sm" onClick={() => setForm(blank("work"))}><Plus className="h-4 w-4" />Role</button></div>} />

      {error ? <ErrorNote message={error} onRetry={reload} /> : loading && !data ? <SkeletonList n={3} /> : !sorted.length ? (
        <EmptyState icon={BriefcaseBusiness} title="Start your timeline" body="Add your current or most recent role — NYSC and internships count." action={<button type="button" className="link text-sm" onClick={() => setForm(blank("work"))}>Add a role</button>} />
      ) : (
        <div className="space-y-8">
          {[["Experience", work], ["Education", edu]].map(([label, items]) => (items as Entry[]).length > 0 && (
            <section key={label as string}>
              <p className="eyebrow mb-3">{label as string}</p>
              <ul className="relative space-y-3 before:absolute before:bottom-4 before:left-4 before:top-4 before:w-px before:bg-border">
                {(items as Entry[]).map((e) => <EntryCard key={e.id} e={e} onEdit={() => edit(e)} onDelete={() => remove(e)} />)}
              </ul>
            </section>
          ))}
          {edu.length === 0 && <button type="button" onClick={() => setForm(blank("education"))} className="link text-sm">Add education</button>}
        </div>
      )}

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit" : isEdu ? "Add education" : "Add role"}
        footer={<button type="button" className="btn btn-primary w-full" disabled={busy} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save</button>}>
        {form && (
          <div className="space-y-4">
            {!form.id && (
              <div className="grid grid-cols-2 rounded-full bg-surface-2 p-1">
                {(["work", "education"] as const).map((t) => <button key={t} type="button" onClick={() => setForm({ ...form, entry_type: t, organization: "", organization_id: null })} className={cn("rounded-full py-1.5 text-sm", form.entry_type === t ? "bg-surface font-medium shadow-sm" : "text-muted")}>{t === "work" ? "Work" : "Education"}</button>)}
              </div>
            )}
            <div><label className="label">{isEdu ? "Degree or qualification" : "Job title"}</label><input className="input" value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} placeholder={isEdu ? "B.Sc., HND, OND, WAEC…" : "e.g. Customer Success Lead"} /></div>
            <div>
              <label className="label">{isEdu ? "School" : "Organisation"}</label>
              <OrgPicker key={`${form.entry_type}${form.id ?? ""}`} type={isEdu ? "school" : "company"} value={form.organization} placeholder={isEdu ? "e.g. University of Lagos" : "e.g. Dangote Group"}
                onPick={(o) => setForm((f) => f && ({ ...f, organization: o.name, organization_id: o.id, can_verify: o.claim_status === "approved" }))} />
              <p className="mt-1 text-[11px] text-muted">{form.organization_id ? (form.can_verify ? `${form.organization} verifies on Crede — we'll ask them to confirm this.` : `${form.organization} isn't verifying yet — you can add evidence later.`) : "Choose from the list to enable verification. Not listed? Type the full name."}</p>
            </div>
            {isEdu ? (
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Field of study</label><input className="input" value={form.field_of_study} onChange={(e) => setForm({ ...form, field_of_study: e.target.value })} /></div>
                <div><label className="label">Grade</label><input className="input" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} placeholder="Second Class Upper" /></div>
              </div>
            ) : (
              <>
                <div><label className="label">Location</label><input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Lagos, Remote…" /></div>
                <div className="flex flex-wrap gap-1.5">{EMP.map(([k, l]) => <button key={k} type="button" onClick={() => setForm({ ...form, employment_type: k })} className={cn("chip", form.employment_type === k && "chip-active")}>{l}</button>)}</div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Start</label><input type="month" className="input" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></div>
              <div><label className="label">End</label><input type="month" className="input" disabled={form.is_current} value={form.is_current ? "" : form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></div>
            </div>
            <div className="flex items-center justify-between"><span className="text-sm">{isEdu ? "I'm studying here now" : "I currently work here"}</span><Switch label="Current" checked={form.is_current} onChange={(v) => setForm({ ...form, is_current: v })} /></div>
            <div><label className="label">{isEdu ? "Achievements & activities" : "Achievements"} <span className="font-normal text-muted">· one per line</span></label><textarea className="input min-h-[96px]" value={form.achievements} onChange={(e) => setForm({ ...form, achievements: e.target.value })} placeholder={isEdu ? "Best graduating student, Dept. of Economics" : "Grew monthly sales 30% in 6 months"} /></div>
            {!isEdu && <div><label className="label">Responsibilities <span className="font-normal text-muted">· one per line</span></label><textarea className="input min-h-[80px]" value={form.responsibilities} onChange={(e) => setForm({ ...form, responsibilities: e.target.value })} /></div>}
            <div><label className="label">Description <span className="font-normal text-muted">· optional</span></label><textarea className="input min-h-[64px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
