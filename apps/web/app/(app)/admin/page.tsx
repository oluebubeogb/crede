"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2, BadgeCheck, IdCard, Flag, Mail, CreditCard, RefreshCw, Users, Check, X, Eye, EyeOff, Loader2, Search, Download, Shield, LayoutGrid,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApi, useDebounced } from "@/lib/hooks";
import { useMe } from "@/lib/me";
import { cn, naira, timeAgo } from "@/lib/utils";
import { EmptyState, ErrorNote, PageHeader, Sheet, SkeletonList, SoftIcon, Stat, VerifiedBadge, toast } from "@/components/ui/kit";
import { ClaimPill, type OrgClaim } from "@/components/orgs";

type Tab = "overview" | "claims" | "badges" | "users" | "identity" | "reports" | "outbox" | "payments" | "teams";
type Overview = {
  claims_pending: number; badges_pending: number; identity_pending: number; reports_open: number; outbox_queued: number; users: number; orgs: number; posts: number;
  payment_provider: string; smtp: boolean; org_domain_auto_approve: boolean;
  teams: { enabled: boolean; teams_url?: string; last?: { at: string; ok: boolean; pulled: number; pushed: number; created: number; error?: string } | null; interval_minutes: number };
};
type Elig = { eligible: boolean; missing: string[] };
type BadgeReq = {
  id: number; level: string; status: string; note?: string; created_at: string; decided_at?: string;
  payment?: { reference: string; status: string; provider: string; amount_ngn: number } | null;
  profile?: { id: number; name: string; email: string; username?: string; badge_level: string; identity_verified: boolean } | null; eligibility_now?: Elig | null;
};
type User = { id: number; name: string; email: string; username?: string; badge_level: string; identity_verified: boolean; claims: { label: string }; eligibility: { gray: Elig; green: Elig }; created_at: string };
type Ident = { id: number; profile_id: number; status: string; notes?: string; created_at: string; has_document: boolean; profile?: { name: string; email: string } };
type Report = { target_type: string; target_id: number; reports: number; last_at: string; reasons: string[]; body: string; hidden: boolean; post_id?: number; author?: { name: string; email: string } };
type Mail = { id: number; to: string; subject: string; template: string; status: string; attempts: number; error?: string; created_at: string; sent_at?: string };
type Pay = { id: number; reference: string; provider: string; status: string; purpose: string; amount_ngn: number; created_at: string; paid_at?: string; profile?: { name: string; email: string } };

const TABS: { value: Tab; label: string; icon: typeof Building2; key?: keyof Overview }[] = [
  { value: "overview", label: "Overview", icon: LayoutGrid },
  { value: "claims", label: "Org claims", icon: Building2, key: "claims_pending" },
  { value: "badges", label: "Badges", icon: BadgeCheck, key: "badges_pending" },
  { value: "identity", label: "Identity", icon: IdCard, key: "identity_pending" },
  { value: "users", label: "Users", icon: Users },
  { value: "reports", label: "Reports", icon: Flag, key: "reports_open" },
  { value: "outbox", label: "Email", icon: Mail, key: "outbox_queued" },
  { value: "payments", label: "Payments", icon: CreditCard },
  { value: "teams", label: "Teams sync", icon: RefreshCw },
];

function StatusTabs({ value, onChange, items }: { value: string; onChange: (v: string) => void; items: [string, string][] }) {
  return (
    <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
      {items.map(([k, l]) => <button key={k} type="button" onClick={() => onChange(k)} className={cn("chip shrink-0", value === k && "chip-active")}>{l}</button>)}
    </div>
  );
}

function NoteActions({ onDecide, yes = "Approve", no = "Reject" }: { onDecide: (approve: boolean, note: string) => Promise<void>; yes?: string; no?: string }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<boolean | null>(null);
  const go = async (a: boolean) => { setBusy(a); try { await onDecide(a, note); } finally { setBusy(null); } };
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input className="input h-9 min-w-0 flex-1 py-1 text-sm" placeholder="Note to user (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <button type="button" className="btn btn-primary btn-sm" disabled={busy !== null} onClick={() => go(true)}>{busy === true ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{yes}</button>
      <button type="button" className="btn btn-soft btn-sm" disabled={busy !== null} onClick={() => go(false)}>{busy === false ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}{no}</button>
    </div>
  );
}

function Claims({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState("pending_admin");
  const { data, error, reload } = useApi<OrgClaim[]>(`/admin/claims?status=${status}`, [status]);
  async function decide(c: OrgClaim, approve: boolean, note: string) {
    try { await api.post(`/admin/claims/${c.id}/decide`, { approve, note: note || null }); toast(approve ? "Claim approved" : "Claim rejected"); reload(); onChange(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  }
  return (
    <>
      <StatusTabs value={status} onChange={setStatus} items={[["pending_admin", "Awaiting approval"], ["pending_email", "Email unconfirmed"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"]]} />
      {error && <ErrorNote message={error} onRetry={reload} />}
      {!data ? <SkeletonList n={2} /> : data.length === 0 ? <EmptyState icon={Building2} tint="blue" title="Nothing here" body="Organisation claims that need approval appear here." /> : (
        <div className="card divide-y divide-border">
          {data.map((c) => {
            const match = c.organization?.email_domain && c.domain === c.organization.email_domain;
            return (
              <div key={c.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium"><Link href={`/orgs/${c.organization?.id}`} className="hover:underline">{c.organization?.name}</Link> <span className="text-sm font-normal capitalize text-muted">· {c.organization?.org_type}</span></p>
                    <p className="text-sm text-muted">{c.requester?.name} · {c.work_email} · {timeAgo(c.created_at)}</p>
                  </div>
                  <ClaimPill status={c.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <span className={cn("pill", c.email_verified ? "pill-green" : "pill-gray")}>{c.email_verified ? "Email confirmed" : "Email not confirmed"}</span>
                  <span className={cn("pill", match ? "pill-green" : "pill-amber")}>{match ? `Matches @${c.domain}` : c.organization?.email_domain ? `@${c.domain} ≠ @${c.organization.email_domain}` : `No domain on file (@${c.domain})`}</span>
                </div>
                {c.evidence && <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">“{c.evidence}”</p>}
                {c.admin_note && c.status !== "pending_admin" && <p className="mt-2 text-xs text-muted">Note: {c.admin_note}</p>}
                {c.status === "pending_admin" && <NoteActions onDecide={(a, n) => decide(c, a, n)} />}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function GrantSheet({ user, onClose, onDone }: { user: { id: number; name: string; badge_level: string } | null; onClose: () => void; onDone: () => void }) {
  const [level, setLevel] = useState("gray");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(action: "grant" | "revoke") {
    if (!user) return;
    setBusy(true);
    try { await api.post(`/admin/profiles/${user.id}/badge`, { action, level: action === "grant" ? level : null, note: note || null }); toast(action === "grant" ? "Badge granted" : "Badge revoked"); onDone(); onClose(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } finally { setBusy(false); }
  }
  return (
    <Sheet open={!!user} onClose={onClose} title={user ? `Badge for ${user.name}` : ""}>
      {user && (
        <div className="space-y-3">
          <p className="text-sm text-muted">Current: <span className="font-medium capitalize text-foreground">{user.badge_level}</span></p>
          <div className="grid grid-cols-2 gap-2">
            {["gray", "green"].map((l) => (
              <button key={l} type="button" onClick={() => setLevel(l)} className={cn("flex items-center justify-center gap-2 rounded-xl border p-3 text-sm capitalize", level === l ? "border-foreground bg-surface-2" : "border-border")}>
                <BadgeCheck className="h-4 w-4" style={{ color: l === "green" ? "var(--success)" : "var(--muted)" }} />{l}
              </button>
            ))}
          </div>
          <input className="input" placeholder="Note (optional, sent to the user)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary flex-1" disabled={busy} onClick={() => go("grant")}>Grant {level}</button>
            {user.badge_level !== "none" && <button type="button" className="btn btn-soft flex-1 text-danger" disabled={busy} onClick={() => go("revoke")}>Revoke</button>}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Badges({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState("pending_review");
  const { data, error, reload } = useApi<BadgeReq[]>(`/admin/badges?status=${status}`, [status]);
  const [grant, setGrant] = useState<{ id: number; name: string; badge_level: string } | null>(null);
  async function decide(r: BadgeReq, approve: boolean, note: string) {
    try { await api.post(`/admin/badges/${r.id}/decide`, { action: approve ? "grant" : "reject", level: r.level, note: note || null }); toast(approve ? "Badge granted" : "Request rejected"); reload(); onChange(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  }
  return (
    <>
      <StatusTabs value={status} onChange={setStatus} items={[["pending_review", "To review"], ["awaiting_payment", "Awaiting payment"], ["granted", "Granted"], ["rejected", "Rejected"], ["revoked", "Revoked"], ["all", "All"]]} />
      {error && <ErrorNote message={error} onRetry={reload} />}
      {!data ? <SkeletonList n={2} /> : data.length === 0 ? <EmptyState icon={BadgeCheck} tint="emerald" title="No badge requests" body="Use the Users tab to grant or revoke a badge directly." /> : (
        <div className="card divide-y divide-border">
          {data.map((r) => (
            <div key={r.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-medium">{r.profile?.name}<VerifiedBadge level={r.profile?.badge_level} size={14} /><span className="text-sm font-normal text-muted">wants <span className="capitalize">{r.level}</span></span></p>
                  <p className="text-sm text-muted">{r.profile?.email} · {timeAgo(r.created_at)}</p>
                </div>
                <span className={cn("pill", r.status === "granted" ? "pill-green" : r.status === "pending_review" ? "pill-blue" : r.status === "rejected" || r.status === "revoked" ? "pill-red" : "pill-gray")}>{r.status.replace(/_/g, " ")}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {r.payment && <span className={cn("pill", r.payment.status === "paid" ? "pill-green" : "pill-amber")}>{naira(r.payment.amount_ngn)} · {r.payment.status === "initiated_no_provider" ? "initiated (no provider configured)" : r.payment.status} · {r.payment.reference}</span>}
                <span className={cn("pill", r.profile?.identity_verified ? "pill-green" : "pill-gray")}>{r.profile?.identity_verified ? "ID confirmed" : "ID not confirmed"}</span>
                <span className={cn("pill", r.eligibility_now?.eligible ? "pill-green" : "pill-amber")}>{r.eligibility_now?.eligible ? "Eligible now" : "Not eligible now"}</span>
              </div>
              {!r.eligibility_now?.eligible && r.eligibility_now?.missing.length ? <p className="mt-2 text-xs text-muted">Missing: {r.eligibility_now.missing.join("; ")}</p> : null}
              {r.note && <p className="mt-2 text-xs text-muted">Note: {r.note}</p>}
              {r.status === "pending_review" && <NoteActions yes="Grant" onDecide={(a, n) => decide(r, a, n)} />}
              {r.status === "granted" && r.profile && <button type="button" className="link-muted mt-2 text-sm" onClick={() => setGrant({ id: r.profile!.id, name: r.profile!.name, badge_level: r.profile!.badge_level })}>Change or revoke…</button>}
            </div>
          ))}
        </div>
      )}
      <GrantSheet user={grant} onClose={() => setGrant(null)} onDone={() => { reload(); onChange(); }} />
    </>
  );
}

function UsersTab() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const { data, reload } = useApi<User[]>(`/admin/users?limit=50&q=${encodeURIComponent(dq)}`, [dq]);
  const [grant, setGrant] = useState<User | null>(null);
  return (
    <>
      <label className="mb-3 flex h-10 items-center gap-2 rounded-full border border-border bg-surface px-3.5"><Search className="h-4 w-4 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email or username" className="w-full bg-transparent text-sm outline-none" /></label>
      {!data ? <SkeletonList n={3} lines={1} /> : (
        <div className="card divide-y divide-border">
          {data.map((u) => (
            <div key={u.id} className="flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-sm font-medium">{u.name || u.email}<VerifiedBadge level={u.badge_level} size={14} /></p>
                <p className="truncate text-xs text-muted">{u.email} · {u.claims.label}{u.identity_verified ? " · ID confirmed" : ""}</p>
              </div>
              <span className="hidden text-xs text-muted sm:block">{u.eligibility.green.eligible ? "Green-eligible" : u.eligibility.gray.eligible ? "Gray-eligible" : ""}</span>
              <button type="button" className="btn btn-soft btn-sm" onClick={() => setGrant(u)}>Badge</button>
            </div>
          ))}
        </div>
      )}
      <GrantSheet user={grant} onClose={() => setGrant(null)} onDone={reload} />
    </>
  );
}

function Identity({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState("submitted");
  const { data, reload } = useApi<Ident[]>(`/admin/identity?status=${status}`, [status]);
  async function decide(it: Ident, approve: boolean, note: string) {
    try { await api.post(`/admin/identity/${it.id}/decide`, { approve, note: note || null }); toast(approve ? "Identity confirmed" : "Identity rejected"); reload(); onChange(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  }
  return (
    <>
      <StatusTabs value={status} onChange={setStatus} items={[["submitted", "To review"], ["approved", "Approved"], ["rejected", "Rejected"], ["all", "All"]]} />
      {!data ? <SkeletonList n={2} /> : data.length === 0 ? <EmptyState icon={IdCard} tint="sky" title="No ID documents waiting" /> : (
        <div className="card divide-y divide-border">
          {data.map((it) => (
            <div key={it.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="font-medium">{it.profile?.name}</p><p className="text-sm text-muted">{it.profile?.email} · {timeAgo(it.created_at)}</p></div>
                {it.has_document && <a href={`/backend/api/admin/identity/${it.id}/document`} target="_blank" rel="noopener noreferrer" className="link flex items-center gap-1 text-sm"><Download className="h-4 w-4" />View ID</a>}
              </div>
              {it.notes && <p className="mt-1 text-xs text-muted">{it.notes}</p>}
              {it.status === "submitted" ? <NoteActions onDecide={(a, n) => decide(it, a, n)} /> : <span className={cn("pill mt-2", it.status === "approved" ? "pill-green" : "pill-red")}>{it.status}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Reports({ onChange }: { onChange: () => void }) {
  const [status, setStatus] = useState("open");
  const { data, reload } = useApi<Report[]>(`/admin/reports?status=${status}`, [status]);
  async function act(r: Report, action: "hide" | "dismiss" | "restore") {
    await api.post(`/admin/reports/${r.target_type}/${r.target_id}`, { action }).then(() => { toast(action === "hide" ? "Hidden" : action === "restore" ? "Restored" : "Dismissed"); reload(); onChange(); })
      .catch((e) => toast(e.message, "error"));
  }
  return (
    <>
      <StatusTabs value={status} onChange={setStatus} items={[["open", "Open"], ["actioned", "Actioned"], ["dismissed", "Dismissed"], ["all", "All"]]} />
      {!data ? <SkeletonList n={2} /> : data.length === 0 ? <EmptyState icon={Flag} tint="rose" title="No reports" body="Reported posts and comments land here." /> : (
        <div className="card divide-y divide-border">
          {data.map((r) => (
            <div key={`${r.target_type}${r.target_id}`} className="p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="pill pill-red">{r.reports} report{r.reports > 1 ? "s" : ""}</span>
                <span className="capitalize text-muted">{r.target_type} by {r.author?.name}</span>
                {r.reasons.map((x) => <span key={x} className="pill pill-gray">{x}</span>)}
                {r.hidden && <span className="pill pill-amber">Hidden</span>}
              </div>
              <p className="mt-2 line-clamp-4 rounded-lg bg-surface-2 px-3 py-2 text-sm">{r.body}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {r.post_id && <Link href={`/post/${r.post_id}`} className="btn btn-soft btn-sm"><Eye className="h-3.5 w-3.5" />Open</Link>}
                {!r.hidden ? <button type="button" className="btn btn-primary btn-sm" onClick={() => act(r, "hide")}><EyeOff className="h-3.5 w-3.5" />Hide</button>
                  : <button type="button" className="btn btn-soft btn-sm" onClick={() => act(r, "restore")}>Restore</button>}
                {status === "open" && <button type="button" className="btn btn-soft btn-sm" onClick={() => act(r, "dismiss")}>Dismiss</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Outbox() {
  const { data, reload } = useApi<{ smtp: boolean; items: Mail[] }>("/admin/outbox?limit=100");
  const [preview, setPreview] = useState<Mail | null>(null);
  return (
    <>
      <div className="card mb-3 flex items-center gap-3 p-4">
        <SoftIcon icon={Mail} tint={data?.smtp ? "emerald" : "amber"} size="sm" />
        <p className="flex-1 text-sm">{data?.smtp ? "SMTP is configured. Queued emails are delivered automatically with retries." : "SMTP isn't configured — emails are rendered and logged here instead of being sent."}</p>
        <button type="button" onClick={reload} className="link-muted flex items-center gap-1 text-sm"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
      </div>
      {!data ? <SkeletonList n={3} lines={1} /> : (
        <div className="card divide-y divide-border">
          {data.items.map((m) => (
            <button key={m.id} type="button" onClick={() => setPreview(m)} className="flex w-full items-center gap-3 px-4 py-3 text-left nav-hover">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{m.subject}</p><p className="truncate text-xs text-muted">{m.to} · {m.template} · {timeAgo(m.created_at)}{m.error ? ` · ${m.error}` : ""}</p></div>
              <span className={cn("pill shrink-0", m.status === "sent" ? "pill-green" : m.status === "logged" ? "pill-gray" : m.status === "failed" ? "pill-red" : "pill-amber")}>{m.status}</span>
            </button>
          ))}
          {data.items.length === 0 && <p className="p-4 text-sm text-muted">No emails yet.</p>}
        </div>
      )}
      <Sheet open={!!preview} onClose={() => setPreview(null)} title={preview?.subject} wide>
        {preview && <iframe title="Email preview" src={`/backend/api/admin/outbox/${preview.id}`} sandbox="" className="h-[65vh] w-full rounded-xl border border-border bg-white" />}
      </Sheet>
    </>
  );
}

function Payments() {
  const { data } = useApi<{ provider: string; items: Pay[] }>("/admin/payments?limit=100");
  return (
    <>
      <div className="card mb-3 flex items-center gap-3 p-4">
        <SoftIcon icon={CreditCard} tint={data?.provider && data.provider !== "none" ? "emerald" : "amber"} size="sm" />
        <p className="text-sm">{data?.provider === "none" ? "No payment provider is configured. Checkouts are recorded as “initiated (no provider configured)” and sent to you for review. Add PAYSTACK_SECRET_KEY or the MONNIFY_* keys to go live." : `Live provider: ${data?.provider}`}</p>
      </div>
      {!data ? <SkeletonList n={3} lines={1} /> : (
        <div className="card divide-y divide-border">
          {data.items.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1"><p className="text-sm font-medium">{p.profile?.name} · {p.purpose.replace("badge_", "").replace(/^\w/, (c) => c.toUpperCase())} badge</p>
                <p className="truncate text-xs text-muted">{p.reference} · {p.provider} · {timeAgo(p.created_at)}</p></div>
              <span className="tabular text-sm">{naira(p.amount_ngn)}</span>
              <span className={cn("pill", p.status === "paid" ? "pill-green" : p.status === "failed" ? "pill-red" : "pill-amber")}>{p.status === "initiated_no_provider" ? "initiated · no provider" : p.status}</span>
            </div>
          ))}
          {data.items.length === 0 && <p className="p-4 text-sm text-muted">No payments yet.</p>}
        </div>
      )}
    </>
  );
}

function Teams({ ov, onChange }: { ov: Overview | null; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Record<string, unknown> | null>(null);
  const t = ov?.teams;
  async function run() {
    setBusy(true);
    try { const r = await api.post<Record<string, unknown>>("/admin/teams-sync/run"); setRes(r); toast(r.ok === false ? "Sync finished with errors" : "Sync complete"); onChange(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } finally { setBusy(false); }
  }
  return (
    <div className="card p-5">
      <div className="flex items-start gap-3">
        <SoftIcon icon={RefreshCw} tint={t?.enabled ? "blue" : "gray"} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Collab Teams organisation sync</p>
          <p className="text-sm text-muted">{t?.enabled ? <>Two-way with <span className="font-mono text-xs">{t.teams_url}</span> every {t.interval_minutes} min and on sign-in.</> : "Disabled — set TEAMS_API_URL and SUITE_SYNC_TOKEN on both apps."}</p>
          {t?.last && <p className="mt-2 text-sm">Last run {timeAgo(t.last.at)} · <span className={t.last.ok ? "" : "text-danger"}>{t.last.ok ? "OK" : t.last.error || "failed"}</span> · pulled {t.last.pulled}, created {t.last.created}, pushed {t.last.pushed}</p>}
        </div>
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !t?.enabled} onClick={run}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Run now</button>
      </div>
      {res && <pre className="mt-4 overflow-auto rounded-xl bg-surface-2 p-3 text-xs">{JSON.stringify(res, null, 2)}</pre>}
    </div>
  );
}

function Inner() {
  const { me, loading } = useMe();
  const sp = useSearchParams();
  const router = useRouter();
  const tab = (sp.get("tab") as Tab) || "overview";
  const ov = useApi<Overview>(me?.is_admin ? "/admin/overview" : null, [me?.is_admin]);
  const setTab = (t: Tab) => router.replace(`/admin${t === "overview" ? "" : `?tab=${t}`}`, { scroll: false });

  if (loading) return <SkeletonList n={3} />;
  if (!me?.is_admin) return <EmptyState icon={Shield} tint="gray" title="Admins only" body="Platform admins are set with ADMIN_EMAILS on the server." />;
  const o = ov.data;

  return (
    <div>
      <PageHeader title="Admin" lead="Approve organisation claims, badges and IDs, moderate the community and watch the plumbing." />
      <div className="no-scrollbar -mx-4 mb-5 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
        {TABS.map((t) => {
          const n = t.key && o ? (o[t.key] as number) : 0;
          return (
            <button key={t.value} type="button" onClick={() => setTab(t.value)}
              className={cn("flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors", tab === t.value ? "bg-foreground text-background" : "text-muted nav-hover")}>
              <t.icon className="h-4 w-4" />{t.label}{n > 0 && <span className={cn("tabular rounded-full px-1.5 text-[11px]", tab === t.value ? "bg-background/20" : "bg-[color-mix(in_srgb,var(--danger)_14%,transparent)] text-danger")}>{n}</span>}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        !o ? <SkeletonList n={2} /> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat icon={Building2} tint="blue" label="Claims to approve" value={o.claims_pending} href="/admin?tab=claims" />
              <Stat icon={BadgeCheck} tint="emerald" label="Badges to review" value={o.badges_pending} href="/admin?tab=badges" />
              <Stat icon={IdCard} tint="sky" label="IDs to check" value={o.identity_pending} href="/admin?tab=identity" />
              <Stat icon={Flag} tint="rose" label="Open reports" value={o.reports_open} href="/admin?tab=reports" />
              <Stat icon={Users} tint="violet" label="Users" value={o.users} href="/admin?tab=users" />
              <Stat icon={Building2} tint="amber" label="Organisations" value={o.orgs} href="/orgs" />
              <Stat icon={LayoutGrid} tint="gray" label="Posts" value={o.posts} href="/feed" />
              <Stat icon={Mail} tint="gray" label="Emails queued" value={o.outbox_queued} href="/admin?tab=outbox" />
            </div>
            <div className="card divide-y divide-border">
              {[
                ["Payments", o.payment_provider === "none" ? "Simulated · no keys" : o.payment_provider, o.payment_provider !== "none"],
                ["Email", o.smtp ? "SMTP connected" : "Logged only · no SMTP", o.smtp],
                ["Org claims", o.org_domain_auto_approve ? "Domain auto-approves" : "Domain + admin approval", true],
                ["Teams sync", o.teams.enabled ? `On · every ${o.teams.interval_minutes} min` : "Off", o.teams.enabled],
              ].map(([k, v, ok]) => (
                <div key={k as string} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="shrink-0 text-muted">{k}</span><span className="flex min-w-0 items-center gap-2 text-right">{v}<span className="h-2 w-2 shrink-0 rounded-full" style={{ background: ok ? "var(--success)" : "var(--warning)" }} /></span>
                </div>
              ))}
            </div>
          </div>
        )
      )}
      {tab === "claims" && <Claims onChange={ov.reload} />}
      {tab === "badges" && <Badges onChange={ov.reload} />}
      {tab === "users" && <UsersTab />}
      {tab === "identity" && <Identity onChange={ov.reload} />}
      {tab === "reports" && <Reports onChange={ov.reload} />}
      {tab === "outbox" && <Outbox />}
      {tab === "payments" && <Payments />}
      {tab === "teams" && <Teams ov={o} onChange={ov.reload} />}
    </div>
  );
}

export default function AdminPage() {
  return <Suspense><Inner /></Suspense>;
}
