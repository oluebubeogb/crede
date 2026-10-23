"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, CheckCircle2, Loader2, Info } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useMe } from "@/lib/me";
import { naira } from "@/lib/utils";
import { ErrorNote, SkeletonCard, toast } from "@/components/ui/kit";

type Pay = { reference: string; status: string; provider: string; amount_ngn: number; purpose: string; request?: { level: string; status: string } | null };

/** Shown only when no payment provider keys are configured. Records the initiation and alerts admins. */
export default function SimulatedCheckout({ params }: { params: { ref: string } }) {
  const { data, error, reload } = useApi<Pay>(`/badges/payments/${params.ref}`);
  const { refresh } = useMe();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const level = data?.request?.level || data?.purpose?.replace("badge_", "") || "";

  async function confirm() {
    setBusy(true);
    try {
      const r = await api.post<{ message: string }>(`/badges/payments/${params.ref}/simulate`);
      setDone(r.message); refresh();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } finally { setBusy(false); }
  }

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <div className="mx-auto max-w-md"><SkeletonCard lines={4} /></div>;
  const already = data.request?.status === "pending_review" || data.request?.status === "granted";

  return (
    <div className="mx-auto max-w-md">
      <div className="card animate-in p-6 text-center">
        {done || already ? (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 animate-pop" style={{ color: "var(--success)" }} />
            <h1 className="mt-3 text-lg font-semibold">Request received</h1>
            <p className="mt-1 text-sm text-muted">{done || "Your badge request is with our team for review."}</p>
            <Link href="/verification" className="btn btn-primary mt-5 w-full">Back to verification</Link>
          </>
        ) : (
          <>
            <BadgeCheck className="mx-auto h-12 w-12" style={{ color: level === "green" ? "var(--success)" : "var(--muted)" }} />
            <h1 className="mt-3 text-lg font-semibold capitalize">{level} verification badge</h1>
            <p className="tabular mt-1 text-3xl font-semibold tracking-tight">{naira(data.amount_ngn)}</p>
            <p className="mt-1 text-xs text-muted">Reference {data.reference}</p>
            <div className="mt-5 flex gap-2 rounded-xl bg-surface-2 p-3 text-left text-xs text-muted">
              <Info className="h-4 w-4 shrink-0" />
              <span>Online payment isn&apos;t switched on yet. Confirm to submit your request — our team is notified and will complete your badge and arrange payment with you.</span>
            </div>
            <button type="button" className="btn btn-primary mt-5 w-full" disabled={busy} onClick={confirm}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Confirm request</button>
            <Link href="/badges" className="link-muted mt-3 inline-block text-sm">Cancel</Link>
          </>
        )}
      </div>
    </div>
  );
}
