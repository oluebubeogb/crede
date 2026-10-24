"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Award, BadgeCheck, BriefcaseBusiness, Camera, ExternalLink, FileUp, Loader2, Lock, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { Avatar, ErrorNote, PageHeader, RowLink, Skeleton, Switch, VerifiedBadge, toast } from "@/components/ui/kit";

type Profile = {
  id: number; email: string; full_name?: string | null; username?: string | null; headline?: string | null; industry?: string | null; location?: string | null;
  phone?: string | null; years_experience?: number | null; summary?: string | null; is_public: boolean; avatar_url?: string | null; badge_level?: string | null;
  profile_completion?: number; verification_score?: number; claims?: { label?: string; total: number; verified: number; pending: number };
};
/** Managed in Collab Accounts and synced on every sign-in — shown read-only here. */
const IDENTITY: { key: keyof Profile; label: string }[] = [
  { key: "full_name", label: "Full name" }, { key: "username", label: "Username" }, { key: "phone", label: "Phone" },
];
const FIELDS: { key: keyof Profile; label: string; ph?: string; half?: boolean }[] = [
  { key: "headline", label: "Headline", ph: "e.g. Accountant · ICAN · IFRS" },
  { key: "location", label: "Location", ph: "Lagos, Nigeria", half: true }, { key: "industry", label: "Industry", ph: "Fintech, Oil & gas…", half: true },
  { key: "years_experience", label: "Years of experience", half: true },
];
const ACCOUNTS_URL = process.env.NEXT_PUBLIC_ACCOUNTS_URL || "https://accounts.collab.name.ng";

export default function ProfilePage() {
  const { data, error, loading, reload, setData } = useApi<Profile>("/profile/me");
  const [form, setForm] = useState<Partial<Profile>>({});
  const [busy, setBusy] = useState<"save" | "avatar" | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (data) setForm(data); }, [data]);
  const dirty = !!data && FIELDS.concat([{ key: "summary", label: "" }]).some((f) => (form[f.key] ?? "") !== (data[f.key] ?? ""));

  async function save(patch?: Partial<Profile>) {
    setBusy("save");
    const body = patch || Object.fromEntries([...FIELDS.map((f) => f.key), "summary" as const].map((k) => [k, k === "years_experience" ? ((form[k] as unknown) === "" || form[k] == null ? null : Number(form[k])) : (form[k] as string) || null]));
    try { const p = await api.patch<Profile>("/profile/me", body); setData(p); toast("Profile saved"); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't save", "error"); } finally { setBusy(null); }
  }
  async function upload(f?: File) {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast("Image must be under 5 MB", "error"); return; }
    setBusy("avatar");
    const fd = new FormData(); fd.append("file", f);
    try { setData(await api.postForm<Profile>("/profile/avatar", fd)); toast("Photo updated"); }
    catch (e) { toast(e instanceof Error ? e.message : "Upload failed", "error"); } finally { setBusy(null); if (file.current) file.current.value = ""; }
  }

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (loading && !data) return <div className="mx-auto max-w-3xl space-y-4"><Skeleton className="h-32 rounded-3xl" /><Skeleton className="h-80 rounded-3xl" /></div>;
  if (!data) return null;
  const pct = data.profile_completion ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Profile" title="Your profile" lead="This is what recruiters and verifiers see." />
      <section className="card mb-6 flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
        <button type="button" onClick={() => file.current?.click()} className="group relative self-start rounded-full" aria-label="Change photo">
          <Avatar name={data.full_name} src={data.avatar_url} size={84} />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100">{busy === "avatar" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}</span>
        </button>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-lg font-semibold">{data.full_name || data.email}<VerifiedBadge level={data.badge_level} size={18} /></p>
          <p className="text-sm text-muted">{data.headline || "Add a headline below"}</p>
          {data.claims?.label && <p className="mt-1 text-xs text-muted"><ShieldCheck className="mr-1 inline h-3.5 w-3.5 text-success" />{data.claims.label}</p>}
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${pct}%` }} /></div>
          <p className="mt-1 text-[11px] tabular text-muted">Profile {pct}% complete</p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex items-center gap-2 text-sm"><span className="text-muted">Public</span><Switch label="Public profile" checked={data.is_public} onChange={(v) => save({ is_public: v })} /></div>
          {data.is_public && data.username && <Link href={`/u/${data.username}`} className="link inline-flex items-center gap-1 text-sm">View public page<ExternalLink className="h-3.5 w-3.5" /></Link>}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_260px]">
        <section className="card p-5">
          <div className="mb-5 rounded-2xl bg-surface-2 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted"><Lock className="h-3.5 w-3.5" />Managed in Collab Accounts</p>
              <a href={ACCOUNTS_URL} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-xs">Edit in Collab Accounts<ExternalLink className="h-3 w-3" /></a>
            </div>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {IDENTITY.map((f) => (
                <div key={f.key} className="min-w-0">
                  <dt className="text-[11px] text-muted">{f.label}</dt>
                  <dd className="truncate text-sm font-medium" title={String(data[f.key] ?? "")}>{f.key === "username" && data.username ? `@${data.username}` : (data[f.key] as string) || <span className="font-normal text-muted">Not set</span>}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[11px] text-muted">Your name, username and phone come from your Collab account and update here automatically the next time you sign in.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className={f.half ? "" : "sm:col-span-2"}>
                <label className="label">{f.label}</label>
                <input className="input" type={f.key === "years_experience" ? "number" : "text"} min={0} value={(form[f.key] as string | number | undefined) ?? ""} placeholder={f.ph}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
              </div>
            ))}
            <div className="sm:col-span-2">
              <label className="label">Summary</label>
              <textarea className="input min-h-[120px]" value={form.summary ?? ""} onChange={(e) => setForm({ ...form, summary: e.target.value })} placeholder="Two or three sentences on what you do and your best result." />
              <p className="mt-1 text-right text-[11px] tabular text-muted">{(form.summary || "").split(/\s+/).filter(Boolean).length} words</p>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            {dirty && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(data)}>Reset</button>}
            <button type="button" className="btn btn-primary btn-sm" disabled={!dirty || busy === "save"} onClick={() => save()}>{busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}Save changes</button>
          </div>
        </section>
        <aside className="card h-fit divide-y divide-border overflow-hidden">
          <RowLink href="/timeline#import" icon={FileUp} tint="violet" title="Import from a file" sub="CV, LinkedIn export, transcript…" />
          <RowLink href="/timeline" icon={BriefcaseBusiness} tint="blue" title="Timeline" sub="Roles & education" />
          <RowLink href="/skills" icon={Sparkles} tint="sky" title="Skills" sub="What you can do" />
          <RowLink href="/certifications" icon={Award} tint="amber" title="Certifications" sub="Professional credentials" />
          <RowLink href="/verification" icon={ShieldCheck} tint="emerald" title="Verification" sub={data.claims ? `${data.claims.verified}/${data.claims.total} verified` : "Get verified"} />
          <RowLink href="/badges" icon={BadgeCheck} tint="violet" title="Badge" sub={data.badge_level === "green" ? "Green badge" : data.badge_level === "gray" ? "Gray badge" : "Not yet"} />
        </aside>
      </div>
    </div>
  );
}
