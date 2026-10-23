"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BriefcaseBusiness, Loader2, Plus, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { cn, timeAgo } from "@/lib/utils";
import { EmptyState, ErrorNote, OrgMark, PageHeader, Sheet, SkeletonList, toast } from "@/components/ui/kit";
import type { Org } from "@/components/orgs";
import { canPost, type Job } from "@/components/recruiter";

const EMP = [["full_time", "Full-time"], ["contract", "Contract"], ["part_time", "Part-time"], ["internship", "Internship"], ["remote", "Remote"]];
type F = { title: string; location: string; employment_type: string; experience_years_min: string; salary_min: string; salary_max: string; description: string; requirements: string; status: string };
const blank: F = { title: "", location: "", employment_type: "full_time", experience_years_min: "", salary_min: "", salary_max: "", description: "", requirements: "", status: "open" };

export default function RecruiterJobs() {
  const { data: orgs, error: oerr } = useApi<Org[]>("/organizations/mine");
  const posting = (orgs || []).filter(canPost);
  const [orgId, setOrgId] = useState<number | null>(null);
  useEffect(() => { if (!orgId && posting.length) setOrgId(posting[0].id); }, [posting, orgId]);
  const { data: jobs, error, loading, reload, setData } = useApi<Job[]>(orgId ? `/jobs/org/${orgId}` : null, [orgId]);
  const [form, setForm] = useState<F | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function create() {
    if (!form || !orgId || form.title.trim().length < 2) return;
    setBusy("save");
    const n = (v: string) => (v.trim() ? Number(v.replace(/[^\d]/g, "")) : null);
    try {
      const j = await api.post<Job>("/jobs", { organization_id: orgId, title: form.title.trim(), location: form.location || null, employment_type: form.employment_type,
        experience_years_min: n(form.experience_years_min), salary_min: n(form.salary_min), salary_max: n(form.salary_max), description: form.description || null,
        requirements: form.requirements.split("\n").map((s) => s.replace(/^[-•*]\s*/, "").trim()).filter(Boolean), status: form.status });
      setData([j, ...(jobs || [])]); setForm(null); toast("Job created");
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't create", "error"); } finally { setBusy(null); }
  }
  async function toggle(j: Job) {
    const status = j.status === "open" ? "closed" : "open";
    try { const u = await api.patch<Job>(`/jobs/${j.id}`, { status }); setData((jobs || []).map((x) => (x.id === u.id ? u : x))); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Recruiter" title="Jobs" lead="Open roles appear on Opportunities for every candidate, with their personal match."
        action={posting.length > 0 && <button type="button" className="btn btn-primary btn-sm" onClick={() => setForm({ ...blank })}><Plus className="h-4 w-4" />New job</button>} />
      {oerr ? <ErrorNote message={oerr} /> : orgs && !posting.length ? (
        <EmptyState icon={BriefcaseBusiness} title="You can't post jobs yet" body="You need to be an owner, admin or recruiter of an organisation." action={<Link href="/orgs" className="link text-sm">Claim or join your organisation</Link>} />
      ) : (
        <>
          {posting.length > 1 && <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">{posting.map((o) => <button key={o.id} type="button" onClick={() => setOrgId(o.id)} className={cn("chip shrink-0", orgId === o.id && "chip-active")}><OrgMark name={o.name} src={o.logo_url} size={18} />{o.name}</button>)}</div>}
          {error ? <ErrorNote message={error} onRetry={reload} /> : loading || !jobs ? <SkeletonList n={3} /> : !jobs.length ? (
            <EmptyState icon={BriefcaseBusiness} title="No jobs yet" body="Post your first role — list must-have requirements one per line for the sharpest matching." action={<button type="button" className="link text-sm" onClick={() => setForm({ ...blank })}>Post a job</button>} />
          ) : (
            <ul className="card divide-y divide-border overflow-hidden">
              {jobs.map((j) => (
                <li key={j.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{j.title}</p>
                    <p className="text-sm text-muted">{[j.location || "Location not set", EMP.find((e) => e[0] === j.employment_type)?.[1], `${(j.requirements || []).length} requirements`, timeAgo(j.created_at)].filter(Boolean).join(" · ")}</p>
                  </div>
                  <button type="button" onClick={() => toggle(j)} className={cn("pill", j.status === "open" ? "pill-green" : "pill-gray")} title="Toggle open/closed">{j.status}</button>
                  <Link href={`/recruiter/jobs/${j.id}/matches`} className="btn btn-soft btn-sm"><Sparkles className="h-4 w-4" />Matches</Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Sheet open={!!form} onClose={() => setForm(null)} title="New job" wide
        footer={<button type="button" className="btn btn-primary w-full" disabled={busy === "save" || !form || form.title.trim().length < 2} onClick={create}>{busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}{form?.status === "open" ? "Publish" : "Save draft"}</button>}>
        {form && (
          <div className="space-y-4">
            <div><label className="label">Title</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Senior Accountant" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Location</label><input className="input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Lagos" /></div>
              <div><label className="label">Min. years</label><input className="input" inputMode="numeric" value={form.experience_years_min} onChange={(e) => setForm({ ...form, experience_years_min: e.target.value })} /></div>
              <div><label className="label">Salary from (₦/month)</label><input className="input" inputMode="numeric" value={form.salary_min} onChange={(e) => setForm({ ...form, salary_min: e.target.value })} /></div>
              <div><label className="label">to</label><input className="input" inputMode="numeric" value={form.salary_max} onChange={(e) => setForm({ ...form, salary_max: e.target.value })} /></div>
            </div>
            <div className="flex flex-wrap gap-1.5">{EMP.map(([k, l]) => <button key={k} type="button" onClick={() => setForm({ ...form, employment_type: k })} className={cn("chip", form.employment_type === k && "chip-active")}>{l}</button>)}</div>
            <div><label className="label">Requirements <span className="font-normal text-muted">· one per line</span></label><textarea className="input min-h-[120px]" value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} placeholder={"3+ years in audit\nICAN or ACCA\nIFRS reporting"} /></div>
            <div><label className="label">Description</label><textarea className="input min-h-[120px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 rounded-full bg-surface-2 p-1">{[["open", "Publish now"], ["draft", "Draft"]].map(([k, l]) => <button key={k} type="button" onClick={() => setForm({ ...form, status: k })} className={cn("rounded-full py-1.5 text-sm", form.status === k ? "bg-surface font-medium shadow-sm" : "text-muted")}>{l}</button>)}</div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
