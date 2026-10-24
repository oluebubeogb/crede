"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  ShieldCheck, BadgeCheck, Briefcase, GraduationCap, Award, Upload, FileCheck2, Send, Clock, CheckCircle2, XCircle, CircleDashed, IdCard, Loader2, ChevronRight, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useMe } from "@/lib/me";
import { cn, fmtMonth } from "@/lib/utils";
import { ErrorNote, PageHeader, Sheet, SkeletonList, SoftIcon, toast, type Tint } from "@/components/ui/kit";
import { OrgPicker } from "@/components/orgs";
import { TierChecklist, TierEmblem, TierTrack, type Tier } from "@/components/VerificationTier";

type Level = "issuer_verified" | "verified" | "document_provided" | "pending" | "self_reported" | "rejected";
type Claim = {
  subject_type: "timeline" | "certification"; subject_id: number; claim_type: string; title: string; subtitle?: string | null;
  organization_id?: number | null; start?: string | null; end?: string | null; is_current?: boolean; has_document: boolean; level: Level;
  request?: { request_id: number; status: string; note?: string | null; org?: { id: number; name: string; claim_status: string } | null } | null;
};
type Summary = { total: number; verified: number; issuer_verified: number; document_provided: number; pending: number; self_reported: number; rejected: number; identity_verified: boolean; label: string; ratio: number };
type Elig = { eligible: boolean; missing: string[] };
type Overview = {
  tier: Tier;
  summary: Summary; claims: Claim[]; identity: { verified: boolean; status: string; notes?: string | null; has_document: boolean };
  badge: { level: string; granted_at?: string | null; eligibility: { gray: Elig; green: Elig; current: string }; last_request?: { id: number; level: string; status: string; created_at: string } | null };
};

const LEVEL: Record<Level, { label: string; pill: string; icon: typeof CheckCircle2 }> = {
  issuer_verified: { label: "Verified by issuer", pill: "pill-green", icon: CheckCircle2 },
  verified: { label: "Verified", pill: "pill-green", icon: CheckCircle2 },
  document_provided: { label: "Document provided", pill: "pill-blue", icon: FileCheck2 },
  pending: { label: "Awaiting issuer", pill: "pill-amber", icon: Clock },
  self_reported: { label: "Self-reported", pill: "pill-gray", icon: CircleDashed },
  rejected: { label: "Declined", pill: "pill-red", icon: XCircle },
};
const KIND: Record<string, { icon: typeof Briefcase; tint: Tint; org: "company" | "school" | "issuer" }> = {
  employment: { icon: Briefcase, tint: "blue", org: "company" },
  education: { icon: GraduationCap, tint: "violet", org: "school" },
  certification: { icon: Award, tint: "amber", org: "issuer" },
};


function RequestSheet({ claim, onClose, onDone }: { claim: Claim | null; onClose: () => void; onDone: () => void }) {
  const [org, setOrg] = useState<{ id: number | null; name: string; claim_status?: string }>({ id: null, name: "" });
  const [busy, setBusy] = useState(false);
  const kind = KIND[claim?.claim_type || "employment"] || KIND.employment!;
  async function send() {
    if (!claim) return;
    setBusy(true);
    try {
      let id = org.id;
      if (!id && org.name.trim().length > 1) {
        const o = await api.post<{ id: number }>("/organizations", { name: org.name.trim(), org_type: kind.org });
        id = o.id;
      }
      if (!id) return;
      const r = await api.post<{ message: string }>("/verification/request", { subject_type: claim.subject_type, subject_id: claim.subject_id, organization_id: id });
      toast(r.message);
      onDone();
      onClose();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } finally { setBusy(false); }
  }
  return (
    <Sheet open={!!claim} onClose={onClose} title="Request verification" footer={
      <button type="button" className="btn btn-primary w-full" disabled={busy || org.name.trim().length < 2} onClick={send}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send request</button>
    }>
      {claim && (
        <div className="space-y-3">
          <div className="rounded-xl bg-surface-2 p-3 text-sm"><p className="font-medium">{claim.title}</p><p className="text-muted">{claim.subtitle}</p></div>
          <div>
            <label className="label">{kind.org === "school" ? "School" : kind.org === "issuer" ? "Issuing organisation" : "Employer"}</label>
            <OrgPicker type={kind.org} value={claim.subtitle || ""} onPick={setOrg} placeholder="Start typing…" />
          </div>
          <p className="text-xs text-muted">
            {org.id && org.claim_status === "approved" ? "This organisation is claimed on Crede, so your request goes straight to its verifiers."
              : "If the organisation isn't claimed on Crede yet, we'll queue your request and send it once someone from there claims it."}
          </p>
        </div>
      )}
    </Sheet>
  );
}

function ClaimRow({ c, onRequest, onUploaded }: { c: Claim; onRequest: () => void; onUploaded: () => void }) {
  const k = KIND[c.claim_type] || KIND.employment!;
  const lv = LEVEL[c.level] || LEVEL.self_reported;
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function upload(f?: File) {
    if (!f) return;
    setBusy(true);
    const fd = new FormData(); fd.append("file", f);
    try { await api.postForm(`/verification/${c.subject_type}/${c.subject_id}/document`, fd); toast("Document attached"); onUploaded(); }
    catch (e) { toast(e instanceof Error ? e.message : "Upload failed", "error"); } finally { setBusy(false); }
  }
  async function cancel() {
    if (!c.request) return;
    await api.delete(`/verification/requests/${c.request.request_id}`).then(onUploaded).catch((e) => toast(e.message, "error"));
  }
  const dates = c.start ? `${fmtMonth(c.start)} – ${c.is_current || !c.end ? "Present" : fmtMonth(c.end)}` : "";
  const done = c.level === "issuer_verified" || c.level === "verified";
  const waiting = c.request && ["pending", "queued"].includes(c.request.status);
  return (
    <div className="flex gap-3 p-4">
      <SoftIcon icon={k.icon} tint={k.tint} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0"><p className="font-medium leading-snug">{c.title}</p>
            <p className="text-sm text-muted">{[c.subtitle, dates].filter(Boolean).join(" · ")}</p></div>
          <span className={cn("pill shrink-0", lv.pill)}><lv.icon className="h-3 w-3" />{c.request?.status === "queued" ? "Queued" : lv.label}</span>
        </div>
        {c.request?.org && (
          <p className="mt-1 text-xs text-muted">
            {c.request.status === "approved" ? `Confirmed by ${c.request.org.name}` : c.request.status === "rejected" ? `${c.request.org.name} declined` : c.request.status === "queued" ? `Waiting for ${c.request.org.name} to join Crede` : `Sent to ${c.request.org.name}`}
            {c.request.note ? ` — “${c.request.note}”` : ""}
          </p>
        )}
        {!done && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {!waiting && <button type="button" onClick={onRequest} className="link flex items-center gap-1"><Send className="h-3.5 w-3.5" />{c.request?.status === "rejected" ? "Ask another organisation" : "Request verification"}</button>}
            {waiting && <button type="button" onClick={cancel} className="link-muted flex items-center gap-1"><X className="h-3.5 w-3.5" />Cancel request</button>}
            <input ref={file} type="file" hidden accept=".pdf,image/*" onChange={(e) => upload(e.target.files?.[0])} />
            <button type="button" onClick={() => file.current?.click()} className="link-muted flex items-center gap-1" disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{c.has_document ? "Replace document" : "Attach proof"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function IdentityCard({ id, onDone }: { id: Overview["identity"]; onDone: () => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function upload(f?: File) {
    if (!f) return;
    setBusy(true);
    const fd = new FormData(); fd.append("file", f);
    try { await api.postForm("/verification/identity", fd); toast("ID submitted for review"); onDone(); }
    catch (e) { toast(e instanceof Error ? e.message : "Upload failed", "error"); } finally { setBusy(false); }
  }
  const st = id.verified ? ["pill-green", "Confirmed"] : id.status === "submitted" ? ["pill-amber", "In review"] : id.status === "rejected" ? ["pill-red", "Declined"] : ["pill-gray", "Not started"];
  return (
    <div id="identity" className="card flex scroll-mt-20 gap-3 p-4">
      <SoftIcon icon={IdCard} tint="sky" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2"><p className="font-medium">Identity</p><span className={`pill ${st[0]}`}>{st[1]}</span></div>
        <p className="text-sm text-muted">{id.verified ? "Your government ID has been confirmed by Crede." : id.status === "submitted" ? "We're reviewing your ID — usually within one working day." : "Upload your NIN slip, international passport, driver's licence or voter's card. Only Crede admins see it."}</p>
        {id.status === "rejected" && id.notes && <p className="mt-1 text-sm text-danger">{id.notes}</p>}
        {!id.verified && id.status !== "submitted" && (
          <>
            <input ref={file} type="file" hidden accept=".pdf,image/*" onChange={(e) => upload(e.target.files?.[0])} />
            <button type="button" className="btn btn-soft btn-sm mt-3" disabled={busy} onClick={() => file.current?.click()}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Upload ID</button>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerificationPage() {
  const { refresh } = useMe();
  const { data, error, reload } = useApi<Overview>("/verification");
  const [req, setReq] = useState<Claim | null>(null);
  const reloadAll = () => { reload(); refresh(); };

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  const s = data?.summary;
  const b = data?.badge;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Verification" lead="Every claim on your profile, and who has confirmed it. Recruiters see the same summary." />
      {!data ? <SkeletonList n={3} lines={2} /> : (
        <div className="space-y-5">
          <div className="card p-5">
            <div className="flex flex-wrap items-center gap-4">
              <TierEmblem level={data.tier.level} size={68} />
              <div className="min-w-0 flex-1">
                <p className="eyebrow">Your badge tier</p>
                <p className="text-lg font-semibold tracking-tight">{data.tier.label}</p>
                <p className="text-sm text-muted">{data.tier.status}</p>
              </div>
              <TierTrack level={data.tier.level} />
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
              <span className="pill pill-gray">{s!.label}</span>
              {s!.issuer_verified > 0 && <span className="pill pill-green">{s!.issuer_verified} by issuers</span>}
              {s!.pending > 0 && <span className="pill pill-amber">{s!.pending} pending</span>}
              {s!.document_provided > 0 && <span className="pill pill-blue">{s!.document_provided} with documents</span>}
              {s!.self_reported > 0 && <span className="pill pill-gray">{s!.self_reported} self-reported</span>}
            </div>
            <div className="mt-4 border-t border-border pt-4"><TierChecklist tier={data.tier} /></div>
            {(data.tier.eligible.gray && b!.level === "none") || (data.tier.eligible.green && b!.level !== "green") || (b!.last_request && b!.last_request.status === "pending_review") ? (
              <Link href="/badges" className="btn btn-primary btn-sm mt-4 w-full sm:w-auto">
                <BadgeCheck className="h-4 w-4" />
                {b!.last_request && b!.last_request.status === "pending_review" ? `Your ${b!.last_request.level} badge request is with our team` : `Request the ${data.tier.eligible.green ? "green" : "gray"} badge`}
              </Link>
            ) : (
              <Link href="/badges" className="link-muted mt-3 inline-flex items-center gap-1 text-xs">About badges <ChevronRight className="h-3.5 w-3.5" /></Link>
            )}
          </div>

          <IdentityCard id={data.identity} onDone={reloadAll} />

          <section>
            <h2 className="section-title mb-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-muted" />Claims</h2>
            {data.claims.length === 0 ? (
              <div className="card p-5 text-sm text-muted">Add roles and education on your <Link href="/timeline" className="link">Timeline</Link> and certificates on <Link href="/certifications" className="link">Certifications</Link> — they&apos;ll appear here to verify.</div>
            ) : (
              <div className="card stagger divide-y divide-border">
                {data.claims.map((c) => <ClaimRow key={`${c.subject_type}-${c.subject_id}`} c={c} onRequest={() => setReq(c)} onUploaded={reloadAll} />)}
              </div>
            )}
          </section>
        </div>
      )}
      <RequestSheet claim={req} onClose={() => setReq(null)} onDone={reloadAll} />
    </div>
  );
}
