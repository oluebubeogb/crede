"use client";

import Link from "next/link";
import { useState } from "react";
import { BadgeCheck, Check, Circle, Loader2, Lock, ShieldCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { cn, naira } from "@/lib/utils";
import { ErrorNote, PageHeader, SkeletonList, toast } from "@/components/ui/kit";

type Elig = { eligible: boolean; missing: string[] };
type Info = {
  level: "none" | "gray" | "green"; eligibility: { gray: Elig; green: Elig; current: string }; provider: string;
  prices: { gray: number; green: number }; currency: string; levels: { key: "gray" | "green"; name: string; desc: string }[];
};
type Ver = { badge: { last_request?: { level: string; status: string } | null } };

const PERKS: Record<string, string[]> = {
  gray: ["Gray tick next to your name everywhere on Crede", "Recruiters see “identity confirmed”", "Shown on shared CVs and posts"],
  green: ["Green tick — the strongest trust signal on Crede", "Identity plus employer, school or issuer confirmations", "Ranked higher in recruiter searches"],
};
const RANK = { none: 0, gray: 1, green: 2 };

export default function BadgesPage() {
  const { data, error, reload } = useApi<Info>("/badges");
  const ver = useApi<Ver>("/verification");
  const [busy, setBusy] = useState<string | null>(null);
  const pending = ver.data?.badge.last_request?.status === "pending_review" ? ver.data.badge.last_request : null;

  async function buy(level: "gray" | "green") {
    setBusy(level);
    try {
      const r = await api.post<{ checkout_url: string; simulated: boolean; reference: string }>("/badges/checkout", { level });
      window.location.href = r.simulated ? `/badges/checkout/${r.reference}` : r.checkout_url;
    } catch (e) {
      toast(e instanceof ApiError || e instanceof Error ? e.message : "Couldn't start checkout", "error");
      setBusy(null);
    }
  }

  if (error) return <ErrorNote message={error} onRetry={reload} />;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader eyebrow="Verification" title="Verified badges" lead="A badge tells recruiters and the community that Crede has checked who you are — and, for green, that organisations have confirmed your record." />
      {!data ? <SkeletonList n={2} lines={4} /> : (
        <>
          {pending && (
            <div className="card mb-4 flex items-center gap-3 p-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted motion-reduce:animate-none" />
              <p className="text-sm">Your <span className="font-medium">{pending.level}</span> badge request is with our team. We&apos;ll notify you as soon as it&apos;s decided.</p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {data.levels.map((l) => {
              const el = data.eligibility[l.key];
              const owned = RANK[data.level] >= RANK[l.key];
              const color = l.key === "green" ? "var(--success)" : "var(--muted)";
              return (
                <div key={l.key} className={cn("card relative flex flex-col p-5", l.key === "green" && "ring-1 ring-[color-mix(in_srgb,var(--success)_30%,transparent)]")}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
                      <BadgeCheck className="h-7 w-7" style={{ color }} />
                    </span>
                    <div><p className="font-semibold">{l.name}</p><p className="tabular text-sm text-muted">{naira(data.prices[l.key])} · one-off</p></div>
                  </div>
                  <p className="mt-3 text-sm text-muted">{l.desc}</p>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {PERKS[l.key]!.map((p) => <li key={p} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--success)" }} />{p}</li>)}
                  </ul>
                  <div className="mt-4 rounded-xl bg-surface-2 p-3">
                    <p className="eyebrow mb-1.5">Requirements</p>
                    {el.eligible ? <p className="flex items-center gap-2 text-sm"><Check className="h-4 w-4" style={{ color: "var(--success)" }} />You meet every requirement</p> : (
                      <ul className="space-y-1 text-sm">{el.missing.map((m) => <li key={m} className="flex gap-2 text-muted"><Circle className="mt-1 h-3 w-3 shrink-0" />{m}</li>)}</ul>
                    )}
                  </div>
                  <div className="mt-4 flex-1" />
                  {owned ? <p className="flex items-center justify-center gap-2 py-2 text-sm font-medium" style={{ color }}><BadgeCheck className="h-4 w-4" />{data.level === l.key ? "Your current badge" : "Included in your badge"}</p>
                    : el.eligible ? (
                      <button type="button" className="btn btn-primary w-full" disabled={!!busy || pending?.level === l.key} onClick={() => buy(l.key)}>
                        {busy === l.key && <Loader2 className="h-4 w-4 animate-spin" />}{pending?.level === l.key ? "In review" : `Get ${l.key} badge · ${naira(data.prices[l.key])}`}
                      </button>
                    ) : <Link href="/verification" className="btn btn-soft w-full"><Lock className="h-4 w-4" />Complete requirements</Link>}
                </div>
              );
            })}
          </div>
          <p className="mt-5 flex items-start gap-2 text-xs text-muted"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Payments are processed securely{data.provider !== "none" ? ` by ${data.provider === "paystack" ? "Paystack" : "Monnify"}` : ""}. Every badge is reviewed by a person before it goes live; if we can&apos;t approve it, we&apos;ll refund you.</p>
        </>
      )}
    </div>
  );
}
