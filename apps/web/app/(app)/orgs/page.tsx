"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Search, Building2, Inbox, Loader2, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useApi, useDebounced } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorNote, OrgMark, PageHeader, Sheet, SkeletonList, SoftIcon, Tabs, VerifiedBadge, toast } from "@/components/ui/kit";
import { ClaimPill, ORG_TYPE, RequestRow, type Org, type OrgClaim, type VR } from "@/components/orgs";

type Tab = "directory" | "mine" | "claims" | "inbox";

function OrgRow({ o }: { o: Org }) {
  const t = ORG_TYPE[o.org_type] || ORG_TYPE.company!;
  return (
    <Link href={`/orgs/${o.id}`} className="flex items-center gap-3 rounded-xl px-3 py-3 nav-hover">
      <OrgMark name={o.name} src={o.logo_url} size={42} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 font-medium">{o.name}{o.can_verify && <VerifiedBadge level="green" size={14} />}</span>
        <span className="block truncate text-xs text-muted">{t.label}{o.location ? ` · ${o.location}` : ""}{o.email_domain ? ` · @${o.email_domain}` : ""}{o.source === "teams" ? " · via Teams" : ""}</span>
      </span>
      <span className="hidden sm:block"><ClaimPill status={o.claim_status} /></span>
    </Link>
  );
}

function CreateSheet({ open, onClose, initialName }: { open: boolean; onClose: () => void; initialName: string }) {
  const [f, setF] = useState({ name: initialName, org_type: "company", website: "", email_domain: "", location: "", description: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => setF((x) => ({ ...x, name: initialName })), [initialName]);
  async function submit() {
    setBusy(true);
    try {
      const o = await api.post<Org>("/organizations", { ...f, website: f.website || null, email_domain: f.email_domain || null });
      toast("Organisation created — claim it to start verifying");
      window.location.href = `/orgs/${o.id}`;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Add an organisation" footer={
      <button type="button" className="btn btn-primary w-full" disabled={busy || f.name.trim().length < 2} onClick={submit}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Create</button>
    }>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(ORG_TYPE).map(([k, t]) => (
            <button key={k} type="button" onClick={() => setF({ ...f, org_type: k })}
              className={cn("flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs transition-colors", f.org_type === k ? "border-foreground bg-surface-2" : "border-border hover:border-border-strong")}>
              <SoftIcon icon={t.icon} tint={t.tint} size="sm" />{t.label.replace("Certification ", "")}
            </button>
          ))}
        </div>
        <div><label className="label">Name</label><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="label">Website</label><input className="input" placeholder="https://" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} /></div>
          <div><label className="label">Official email domain</label><input className="input" placeholder="unilag.edu.ng" value={f.email_domain} onChange={(e) => setF({ ...f, email_domain: e.target.value })} /></div>
        </div>
        <div><label className="label">Location</label><input className="input" placeholder="Lagos" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></div>
        <p className="text-xs text-muted">Anyone can add an organisation. Only people with an official email who are approved by a Crede admin can manage it or verify claims.</p>
      </div>
    </Sheet>
  );
}

function Inner() {
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>((sp.get("tab") as Tab) || "directory");
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("");
  const dq = useDebounced(q.trim(), 250);
  const [create, setCreate] = useState(false);
  const dir = useApi<Org[]>(tab === "directory" ? `/organizations?limit=50&q=${encodeURIComponent(dq)}${type ? `&type=${type}` : ""}` : null, [tab, dq, type]);
  const mine = useApi<Org[]>("/organizations/mine");
  const claims = useApi<OrgClaim[]>("/organizations/claims/mine");
  const inbox = useApi<VR[]>("/organizations/requests/inbox");

  const manages = (mine.data || []).some((o) => o.i_manage);
  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: "directory", label: "Directory" },
    { value: "mine", label: "Mine", count: mine.data?.length },
    { value: "claims", label: "Claims", count: claims.data?.length },
  ];
  if (manages || (inbox.data?.length || 0) > 0) tabs.push({ value: "inbox", label: "Requests", count: inbox.data?.filter((v) => v.status === "pending").length });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Organisations" lead="Companies, schools and certification issuers. Claimed organisations can verify their people's claims."
        action={<button type="button" className="btn btn-primary btn-sm" onClick={() => setCreate(true)}><Plus className="h-4 w-4" />Add</button>} />
      <Tabs value={tab} onChange={setTab} items={tabs} className="mb-4" />

      {tab === "directory" && (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex h-10 flex-1 items-center gap-2 rounded-full border border-border bg-surface px-3.5 focus-within:border-border-strong">
              <Search className="h-4 w-4 text-muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or email domain" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
            </label>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {[["", "All"], ["company", "Companies"], ["school", "Schools"], ["issuer", "Issuers"]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => setType(k!)} className={cn("chip shrink-0", type === k && "chip-active")}>{l}</button>
              ))}
            </div>
          </div>
          <div className="mt-3">
            {dir.error && <ErrorNote message={dir.error} onRetry={dir.reload} />}
            {dir.loading && !dir.data && <SkeletonList n={4} avatar lines={1} />}
            {dir.data?.length === 0 && (
              <EmptyState icon={Building2} title="No match" body={dq ? <>Can&apos;t find “{dq}”? <button type="button" className="link" onClick={() => setCreate(true)}>Add it</button>.</> : "No organisations yet."} />
            )}
            {!!dir.data?.length && <div className="card stagger divide-y divide-border p-1">{dir.data.map((o) => <OrgRow key={o.id} o={o} />)}</div>}
          </div>
        </>
      )}

      {tab === "mine" && (
        mine.data?.length ? <div className="card divide-y divide-border p-1">{mine.data.map((o) => <OrgRow key={o.id} o={o} />)}</div>
          : mine.data ? <EmptyState icon={Building2} tint="violet" title="You're not part of an organisation" body="Find your employer, school or issuer in the directory and claim it with your official email." />
            : <SkeletonList n={2} avatar lines={1} />
      )}

      {tab === "claims" && (
        claims.data?.length ? (
          <div className="card divide-y divide-border p-1">
            {claims.data.map((c) => (
              <Link key={c.id} href={`/orgs/${c.organization?.id}`} className="flex items-center gap-3 rounded-xl px-3 py-3 nav-hover">
                <OrgMark name={c.organization?.name} size={40} />
                <span className="min-w-0 flex-1"><span className="block font-medium">{c.organization?.name}</span>
                  <span className="block truncate text-xs text-muted">{c.work_email}{c.admin_note ? ` · ${c.admin_note}` : ""}</span></span>
                <ClaimPill status={c.status} />
              </Link>
            ))}
          </div>
        ) : claims.data ? <EmptyState icon={Building2} tint="amber" title="No claims yet" body="Claiming an organisation lets you manage it and verify your team's credentials." /> : <SkeletonList n={2} lines={1} />
      )}

      {tab === "inbox" && (
        <>
          <div className="mb-2 flex items-center justify-between"><p className="text-sm text-muted">Verification requests for organisations you manage</p>
            <button type="button" onClick={inbox.reload} className="link-muted flex items-center gap-1 text-sm"><RefreshCw className="h-3.5 w-3.5" />Refresh</button></div>
          {inbox.data?.length ? (
            <div className="card divide-y divide-border">{inbox.data.map((v) => <RequestRow key={v.id} vr={v} showOrg onDone={(r) => inbox.setData((xs) => xs?.map((x) => (x.id === r.id ? r : x)) || null)} />)}</div>
          ) : inbox.data ? <EmptyState icon={Inbox} tint="sky" title="Inbox zero" body="New requests to confirm someone's role, degree or certificate appear here." /> : <SkeletonList n={2} avatar />}
        </>
      )}

      <CreateSheet open={create} onClose={() => setCreate(false)} initialName={q} />
    </div>
  );
}

export default function OrgsPage() {
  return <Suspense><Inner /></Suspense>;
}
