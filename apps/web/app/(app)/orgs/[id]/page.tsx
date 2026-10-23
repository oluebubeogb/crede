"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Globe, MapPin, Mail, ShieldCheck, Users, Inbox, ExternalLink, Loader2, UserPlus, Trash2, Info } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useMe } from "@/lib/me";
import { EmptyState, ErrorNote, OrgMark, SkeletonCard, SoftIcon, Tabs, VerifiedBadge, toast } from "@/components/ui/kit";
import { ClaimPill, ORG_TYPE, RequestRow, type Org, type OrgClaim, type VR } from "@/components/orgs";

type Member = { id: number; role: string; source?: string; profile?: { id: number; name: string; email: string; username?: string } | null };

function ClaimCard({ org, onChange }: { org: Org; onChange: () => void }) {
  const { config } = useMe();
  const [claim, setClaim] = useState<OrgClaim | null>(org.my_claim || null);
  const [email, setEmail] = useState("");
  const [evidence, setEvidence] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    try {
      const c = await api.post<OrgClaim>(`/organizations/${org.id}/claim`, { work_email: email, evidence: evidence || null });
      setClaim(c);
      setDevCode(c.dev_code || null);
      toast(c.message || "Code sent");
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } finally { setBusy(false); }
  }
  async function confirm() {
    if (!claim) return;
    setBusy(true);
    try {
      const c = await api.post<OrgClaim>(`/organizations/claims/${claim.id}/confirm`, { code: code.trim() });
      setClaim(c);
      toast(c.status === "approved" ? "Claim approved" : "Email confirmed — waiting for admin approval");
      onChange();
    } catch (e) { toast(e instanceof Error ? e.message : "Invalid code", "error"); } finally { setBusy(false); }
  }

  if (claim && claim.status === "pending_admin") {
    return (
      <div className="card flex gap-3 p-4">
        <SoftIcon icon={ShieldCheck} tint="sky" />
        <div><p className="font-medium">Waiting for a Crede admin</p>
          <p className="text-sm text-muted">You confirmed {claim.work_email}. An admin will review the claim — we&apos;ll notify you when it&apos;s decided.</p></div>
      </div>
    );
  }
  if (claim && claim.status === "pending_email") {
    return (
      <div className="card p-4">
        <p className="font-medium">Enter the 6-digit code</p>
        <p className="text-sm text-muted">We sent it to {claim.work_email}. It expires in 30 minutes.</p>
        {devCode && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted"><Info className="mr-1 inline h-3.5 w-3.5" />Email isn&apos;t configured on this server, so here is your code: <span className="font-mono font-semibold text-foreground">{devCode}</span></p>}
        <div className="mt-3 flex gap-2">
          <input className="input tabular max-w-[160px] text-center tracking-[0.3em]" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" />
          <button type="button" className="btn btn-primary" disabled={code.length !== 6 || busy} onClick={confirm}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Confirm</button>
        </div>
        <button type="button" className="link-muted mt-3 text-xs" onClick={() => setClaim(null)}>Use a different email</button>
      </div>
    );
  }
  return (
    <div className="card p-4">
      <div className="flex gap-3">
        <SoftIcon icon={ShieldCheck} tint="emerald" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Work here? Claim {org.name}</p>
          <p className="text-sm text-muted">
            Confirm an official {org.email_domain ? <span className="font-medium text-foreground">@{org.email_domain}</span> : "organisation"} email
            {config?.org_domain_auto_approve ? "." : ", then a Crede admin approves the claim."} Claimed organisations can verify staff, alumni and certificate holders.
          </p>
          {claim?.status === "rejected" && <p className="mt-2 text-sm text-danger">Your last claim was declined{claim.admin_note ? `: ${claim.admin_note}` : "."}</p>}
        </div>
      </div>
      <div className="mt-3 space-y-2">
        <input className="input" type="email" placeholder={org.email_domain ? `you@${org.email_domain}` : "you@organisation.com"} value={email} onChange={(e) => setEmail(e.target.value)} />
        <textarea className="input resize-none" rows={2} placeholder="Your role and anything that helps the admin (optional)" value={evidence} onChange={(e) => setEvidence(e.target.value)} />
        <button type="button" className="btn btn-primary" disabled={!email.includes("@") || busy} onClick={start}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Send code</button>
      </div>
    </div>
  );
}

function Members({ org }: { org: Org }) {
  const { data, error, reload } = useApi<Member[]>(`/organizations/${org.id}/members`);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    try { await api.post(`/organizations/${org.id}/members`, { email, role }); setEmail(""); toast("Member added"); reload(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } finally { setBusy(false); }
  }
  async function remove(m: Member) {
    if (!confirm(`Remove ${m.profile?.name || "member"}?`)) return;
    await api.delete(`/organizations/${org.id}/members/${m.id}`).then(reload).catch((e) => toast(e.message, "error"));
  }
  if (error) return <ErrorNote message={error} />;
  return (
    <div className="space-y-3">
      {org.i_manage && (
        <div className="card flex flex-col gap-2 p-3 sm:flex-row">
          <input className="input flex-1" type="email" placeholder="Colleague's Crede email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <select className="input sm:w-36" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="member">Member</option><option value="recruiter">Recruiter</option><option value="admin">Admin</option>
          </select>
          <button type="button" className="btn btn-primary" disabled={!email.includes("@") || busy} onClick={add}><UserPlus className="h-4 w-4" />Add</button>
        </div>
      )}
      <div className="card divide-y divide-border p-1">
        {data?.map((m) => (
          <div key={m.id} className="flex items-center gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{m.profile?.name || "Pending user"}</span>
              <span className="block truncate text-xs text-muted">{m.profile?.email}{m.source === "teams" ? " · synced from Teams" : ""}</span></span>
            <span className="pill pill-gray capitalize">{m.role}</span>
            {org.i_manage && m.role !== "owner" && <button type="button" aria-label="Remove" onClick={() => remove(m)} className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>}
          </div>
        ))}
        {data?.length === 0 && <p className="p-4 text-sm text-muted">No members yet.</p>}
      </div>
    </div>
  );
}

function Requests({ org }: { org: Org }) {
  const [status, setStatus] = useState<"pending" | "all">("pending");
  const { data, setData } = useApi<VR[]>(`/organizations/${org.id}/requests?status=${status}`, [status]);
  return (
    <div>
      <Tabs className="mb-3" value={status} onChange={setStatus} items={[{ value: "pending", label: "Pending" }, { value: "all", label: "All" }]} />
      {data?.length ? <div className="card divide-y divide-border">{data.map((v) => <RequestRow key={v.id} vr={v} onDone={(r) => setData((xs) => xs?.map((x) => (x.id === r.id ? r : x)) || null)} />)}</div>
        : <EmptyState icon={Inbox} tint="sky" title="No requests" body="When someone lists this organisation on their timeline or certificate and asks for verification, it shows here." />}
    </div>
  );
}

export default function OrgPage({ params }: { params: { id: string } }) {
  const { data: org, error, reload } = useApi<Org>(`/organizations/${params.id}`);
  const [tab, setTab] = useState<"about" | "members" | "requests">("about");
  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!org) return <div className="mx-auto max-w-3xl"><SkeletonCard avatar lines={4} /></div>;
  const t = ORG_TYPE[org.org_type] || ORG_TYPE.company!;
  const tabs: { value: "about" | "members" | "requests"; label: string; count?: number }[] = [{ value: "about", label: "About" }];
  if (org.my_role) tabs.push({ value: "members", label: "Members", count: org.member_count });
  if (org.i_manage) tabs.push({ value: "requests", label: "Verification requests", count: org.pending_requests ?? undefined });

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/orgs" className="link-muted mb-4 inline-flex items-center gap-1.5 text-sm"><ArrowLeft className="h-4 w-4" />Organisations</Link>
      <div className="card p-5">
        <div className="flex items-start gap-4">
          <OrgMark name={org.name} src={org.logo_url} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-1.5 text-xl font-semibold tracking-tight">{org.name}{org.can_verify && <VerifiedBadge level="green" size={18} />}</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted"><t.icon className="h-3.5 w-3.5" />{t.label}{org.industry ? ` · ${org.industry}` : ""}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2"><ClaimPill status={org.claim_status} />{org.my_role && <span className="pill pill-blue capitalize">You: {org.my_role}</span>}
              {org.source === "teams" && <span className="pill pill-gray">Synced from Teams</span>}</div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted">
          {org.website && <a href={org.website} target="_blank" rel="noopener noreferrer" className="link-muted flex items-center gap-1.5"><Globe className="h-4 w-4" />{org.website.replace(/^https?:\/\//, "")}</a>}
          {org.location && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{org.location}</span>}
          {org.email_domain && <span className="flex items-center gap-1.5"><Mail className="h-4 w-4" />@{org.email_domain}</span>}
          {org.member_count != null && <span className="flex items-center gap-1.5"><Users className="h-4 w-4" />{org.member_count} on Crede</span>}
          {org.teams_url && <a href={org.teams_url} target="_blank" rel="noopener noreferrer" className="link flex items-center gap-1.5"><ExternalLink className="h-4 w-4" />Open in Teams</a>}
        </div>
      </div>

      {tabs.length > 1 && <Tabs className="mt-5" value={tab} onChange={setTab} items={tabs} />}
      <div className="mt-4 space-y-4">
        {tab === "about" && (
          <>
            {org.description && <p className="card whitespace-pre-line p-4 text-sm leading-relaxed">{org.description}</p>}
            {!org.i_manage && org.claim_status !== "approved" && <ClaimCard org={org} onChange={reload} />}
            {org.claim_status === "approved" && !org.my_role && (
              <p className="card p-4 text-sm text-muted">This organisation is claimed on Crede. Add it to your timeline or certifications and request verification from the <Link href="/verification" className="link">Verification</Link> page.</p>
            )}
          </>
        )}
        {tab === "members" && <Members org={org} />}
        {tab === "requests" && <Requests org={org} />}
      </div>
    </div>
  );
}
