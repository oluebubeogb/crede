"use client";

import { useRef, useState } from "react";
import { Check, X, Building2, GraduationCap, Award, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import { Avatar, toast, type Tint } from "@/components/ui/kit";

export type Org = {
  id: number; name: string; slug?: string; org_type: "company" | "school" | "issuer"; website?: string | null; industry?: string | null;
  location?: string | null; description?: string | null; logo_url?: string | null; email_domain?: string | null;
  claim_status: "unclaimed" | "pending" | "approved"; verification_status?: string | null; can_verify: boolean;
  source: string; teams_slug?: string | null; teams_url?: string | null; my_role?: string | null; i_manage?: boolean; member_count?: number;
  pending_requests?: number | null; my_claim?: OrgClaim | null; created_at?: string;
};
export type OrgClaim = {
  id: number; status: "pending_email" | "pending_admin" | "approved" | "rejected"; method?: string; work_email: string; domain?: string;
  email_verified: boolean; evidence?: string | null; admin_note?: string | null; created_at?: string; decided_at?: string | null;
  organization?: Org | null; requester?: { id: number; name: string; email: string; username?: string } | null;
  dev_code?: string | null; message?: string;
};
export type VR = {
  id: number; subject_type: string; subject_id: number; summary: string; status: string; note?: string | null; created_at?: string;
  decided_at?: string | null; organization?: { id: number; name: string; org_type: string; claim_status: string } | null;
  requester?: { id: number; name: string; username?: string; headline?: string } | null;
};

export const ORG_TYPE: Record<string, { label: string; icon: typeof Building2; tint: Tint }> = {
  company: { label: "Company", icon: Building2, tint: "blue" },
  school: { label: "School", icon: GraduationCap, tint: "violet" },
  issuer: { label: "Certification issuer", icon: Award, tint: "amber" },
};

export function ClaimPill({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    approved: ["pill-green", "Claimed"], pending: ["pill-amber", "Claim pending"], unclaimed: ["pill-gray", "Unclaimed"],
    pending_email: ["pill-amber", "Confirm email"], pending_admin: ["pill-blue", "Awaiting admin"], rejected: ["pill-red", "Rejected"],
  };
  const [cls, label] = map[status] || ["pill-gray", status];
  return <span className={`pill ${cls}`}>{label}</span>;
}

export function RequestRow({ vr, onDone, showOrg }: { vr: VR; onDone: (v: VR) => void; showOrg?: boolean }) {
  const [busy, setBusy] = useState<"y" | "n" | null>(null);
  const [note, setNote] = useState("");
  async function decide(approve: boolean) {
    setBusy(approve ? "y" : "n");
    try {
      const r = await api.post<VR>(`/organizations/requests/${vr.id}/decide`, { approve, note: note || null });
      toast(approve ? "Verified" : "Declined");
      onDone(r);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="flex gap-3 p-4">
      <Avatar name={vr.requester?.name} size={38} />
      <div className="min-w-0 flex-1">
        <p className="text-sm"><span className="font-semibold">{vr.requester?.name}</span> <span className="text-muted">asks you to confirm</span></p>
        <p className="mt-0.5 text-sm">{vr.summary}</p>
        <p className="mt-0.5 text-xs text-muted">{vr.subject_type === "certification" ? "Certification" : "Timeline"}{showOrg && vr.organization ? ` · ${vr.organization.name}` : ""} · {timeAgo(vr.created_at)}</p>
        {vr.status === "pending" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="input h-9 min-w-0 flex-1 py-1 text-sm" />
            <button type="button" className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => decide(true)}>{busy === "y" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Confirm</button>
            <button type="button" className="btn btn-soft btn-sm" disabled={!!busy} onClick={() => decide(false)}>{busy === "n" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}Decline</button>
          </div>
        ) : (
          <p className="mt-2"><span className={`pill ${vr.status === "approved" ? "pill-green" : "pill-red"}`}>{vr.status}</span>{vr.note && <span className="ml-2 text-xs text-muted">{vr.note}</span>}</p>
        )}
      </div>
    </div>
  );
}

/** Typeahead over /organizations/suggest. Used for schools on education and issuers on certifications. */
export function OrgPicker({ type, value, onPick, placeholder }: {
  type?: "company" | "school" | "issuer"; value: string; onPick: (v: { id: number | null; name: string; claim_status?: string }) => void; placeholder?: string;
}) {
  const [q, setQ] = useState(value);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<{ id: number; name: string; claim_status: string; location?: string }[]>([]);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  function change(v: string) {
    setQ(v);
    onPick({ id: null, name: v });
    if (t.current) clearTimeout(t.current);
    t.current = setTimeout(() => {
      api.get<typeof items>(`/organizations/suggest?q=${encodeURIComponent(v)}${type ? `&type=${type}` : ""}`).then((r) => { setItems(r); setOpen(true); }).catch(() => {});
    }, 200);
  }
  return (
    <div className="relative">
      <input className="input" value={q} onChange={(e) => change(e.target.value)} onFocus={() => q && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder={placeholder} />
      {open && items.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-xl border border-border bg-surface p-1" style={{ boxShadow: "var(--shadow-hover)" }}>
          {items.map((o) => (
            <button key={o.id} type="button" onMouseDown={(e) => { e.preventDefault(); setQ(o.name); setOpen(false); onPick({ id: o.id, name: o.name, claim_status: o.claim_status }); }}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm nav-hover">
              <span className="min-w-0 truncate">{o.name}{o.location && <span className="text-muted"> · {o.location}</span>}</span>
              {o.claim_status === "approved" ? <span className="pill pill-green shrink-0">Can verify</span> : <span className="shrink-0 text-xs text-muted">Not on Crede yet</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export type VInfo = { request_id: number; status: string; note?: string | null; org?: { id: number; name: string; claim_status: string } | null } | null | undefined;

/** One-line verification state for a timeline entry or certification. */
export function VerifyLine({ status, info, orgName, kind }: { status?: string | null; info?: VInfo; orgName?: string | null; kind: "company" | "school" | "issuer" }) {
  const verified = ["verified", "approved"].includes((status || "").toLowerCase()) || info?.status === "approved";
  const who = info?.org?.name || orgName;
  if (verified) return <span className="pill pill-green">Verified{who ? ` by ${who}` : ""}</span>;
  if (info?.status === "pending") return <span className="pill pill-blue">Awaiting {who || "issuer"}</span>;
  if (info?.status === "rejected") return <span className="pill pill-red">Declined{info.note ? ` · ${info.note}` : ""}</span>;
  if (info?.org && info.org.claim_status !== "approved") return <span className="text-xs text-muted">{who} isn&apos;t verifying on Crede yet · <a href="/verification" className="link">add evidence</a></span>;
  return <span className="text-xs text-muted">Self-reported · <a href="/verification" className="link">{kind === "issuer" ? "upload certificate" : "get verified"}</a></span>;
}
