"use client";

import { useState } from "react";
import { Award, ExternalLink, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fmtMonth } from "@/lib/utils";
import { EmptyState, ErrorNote, PageHeader, Sheet, SkeletonList, SoftIcon, toast } from "@/components/ui/kit";
import { OrgPicker, VerifyLine, type VInfo } from "@/components/orgs";

type Cert = { id: number; name: string; issuer?: string | null; issuer_org_id?: number | null; credential_url?: string | null; issued_at?: string | null; expires_at?: string | null; credential_id?: string | null; verification_status: string; verification?: VInfo };
type Form = Omit<Cert, "id" | "verification_status" | "verification"> & { id?: number; can_verify?: boolean };
const EMPTY: Form = { name: "", issuer: "", issuer_org_id: null, credential_url: "", issued_at: "", expires_at: "", credential_id: "" };
const toMonth = (d?: string | null) => (d ? d.slice(0, 7) : "");
const fromMonth = (m?: string | null) => (m ? `${m}-01` : null);

export default function CertificationsPage() {
  const { data, error, loading, reload, setData } = useApi<Cert[]>("/certifications");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!form?.name.trim()) return;
    setBusy(true);
    const body = { name: form.name.trim(), issuer: form.issuer || null, issuer_org_id: form.issuer_org_id || null, credential_url: form.credential_url || null,
      issued_at: fromMonth(form.issued_at), expires_at: fromMonth(form.expires_at), credential_id: form.credential_id || null };
    try {
      const c = form.id ? await api.patch<Cert>(`/certifications/${form.id}`, body) : await api.post<Cert>("/certifications", body);
      setData(form.id ? (data || []).map((x) => (x.id === c.id ? c : x)) : [...(data || []), c]);
      toast(c.verification?.status === "pending" ? `Saved — verification request sent to ${c.verification.org?.name}` : "Saved");
      setForm(null);
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save", "error"); } finally { setBusy(false); }
  }
  async function remove(c: Cert) {
    if (!confirm(`Remove ${c.name}?`)) return;
    setData((data || []).filter((x) => x.id !== c.id));
    try { await api.delete(`/certifications/${c.id}`); } catch { reload(); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Profile" title="Certifications" lead={<>Pick the issuer from the list — if they verify on Crede, they can confirm it for you. Have them in a CV? <a href="/timeline#import" className="link">Import from a file</a>.</>}
        action={<button type="button" className="btn btn-primary btn-sm" onClick={() => setForm({ ...EMPTY })}><Plus className="h-4 w-4" />Add</button>} />
      {error ? <ErrorNote message={error} onRetry={reload} /> : loading && !data ? <SkeletonList n={2} /> : !data?.length ? (
        <EmptyState icon={Award} tint="amber" title="No certifications yet" body="Professional certificates count toward education & certification matching." action={<button type="button" className="link text-sm" onClick={() => setForm({ ...EMPTY })}>Add certification</button>} />
      ) : (
        <ul className="space-y-3">
          {data.map((c) => (
            <li key={c.id} className="card group flex items-start gap-4 p-4">
              <SoftIcon icon={Award} tint="amber" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug">{c.name}</p>
                <p className="text-sm text-muted">{[c.issuer, c.issued_at && `Issued ${fmtMonth(c.issued_at)}`, c.expires_at && `expires ${fmtMonth(c.expires_at)}`].filter(Boolean).join(" · ")}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <VerifyLine status={c.verification_status} info={c.verification} orgName={c.issuer} kind="issuer" />
                  {c.credential_url && <a href={c.credential_url} target="_blank" rel="noreferrer" className="link-muted inline-flex items-center gap-1 text-xs">Credential<ExternalLink className="h-3 w-3" /></a>}
                </div>
              </div>
              <div className="flex shrink-0 gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                <button type="button" className="btn btn-ghost btn-sm px-2" aria-label="Edit" onClick={() => setForm({ ...c, issued_at: toMonth(c.issued_at), expires_at: toMonth(c.expires_at) })}><Pencil className="h-4 w-4" /></button>
                <button type="button" className="btn btn-ghost btn-sm px-2 text-danger" aria-label="Remove" onClick={() => remove(c)}><Trash2 className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? "Edit certification" : "Add certification"}
        footer={<button type="button" className="btn btn-primary w-full" disabled={busy || !form?.name.trim()} onClick={save}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Save</button>}>
        {form && (
          <div className="space-y-4">
            <div><label className="label">Certification</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. ICAN Professional, AWS Solutions Architect" /></div>
            <div>
              <label className="label">Issuer</label>
              <OrgPicker type="issuer" value={form.issuer || ""} placeholder="Start typing — e.g. ICAN, Cisco, PMI"
                onPick={(o) => setForm((f) => f && ({ ...f, issuer: o.name, issuer_org_id: o.id, can_verify: o.claim_status === "approved" }))} />
              <p className="mt-1 text-[11px] text-muted">{form.issuer_org_id ? (form.can_verify ? "This issuer verifies on Crede — we'll ask them to confirm." : "This issuer isn't verifying yet. You can upload the certificate as evidence.") : "Not listed? Type the full name."}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Issued</label><input type="month" className="input" value={form.issued_at || ""} onChange={(e) => setForm({ ...form, issued_at: e.target.value })} /></div>
              <div><label className="label">Expires</label><input type="month" className="input" value={form.expires_at || ""} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></div>
            </div>
            <div><label className="label">Credential ID</label><input className="input" value={form.credential_id || ""} onChange={(e) => setForm({ ...form, credential_id: e.target.value })} /></div>
            <div><label className="label">Credential link</label><input type="url" className="input" value={form.credential_url || ""} onChange={(e) => setForm({ ...form, credential_url: e.target.value })} placeholder="https://" /></div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
