"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";

type Pay = { status: string; request?: { level: string; status: string } | null };

function Inner() {
  const sp = useSearchParams();
  const ref = sp.get("reference") || sp.get("trxref") || sp.get("paymentReference") || "";
  const { refresh } = useMe();
  const [pay, setPay] = useState<Pay | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!ref) return;
    let t: ReturnType<typeof setTimeout>;
    api.get<Pay>(`/badges/payments/${encodeURIComponent(ref)}`).then((p) => {
      setPay(p);
      if (p.status === "initiated" && tries < 10) t = setTimeout(() => setTries((n) => n + 1), 3000);
      if (p.status === "paid") refresh();
    }).catch(() => setPay({ status: "unknown" }));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, tries]);

  const ok = pay?.status === "paid" || pay?.status === "initiated_no_provider";
  const bad = pay && ["failed", "abandoned", "unknown"].includes(pay.status);
  return (
    <div className="mx-auto max-w-md">
      <div className="card animate-in p-6 text-center">
        {!pay || (!ok && !bad) ? (
          <><Loader2 className="mx-auto h-10 w-10 animate-spin text-muted" /><h1 className="mt-3 font-semibold">Confirming your payment…</h1>
            <p className="mt-1 text-sm text-muted">{tries >= 10 ? "This is taking longer than usual. We'll notify you once it's confirmed." : "This usually takes a few seconds."}</p></>
        ) : ok ? (
          <><CheckCircle2 className="mx-auto h-12 w-12 animate-pop" style={{ color: "var(--success)" }} /><h1 className="mt-3 text-lg font-semibold">{pay.status === "paid" ? "Payment received" : "Request received"}</h1>
            <p className="mt-1 text-sm text-muted">Your {pay.request?.level} badge request is now with our team for a final check.</p></>
        ) : (
          <><XCircle className="mx-auto h-12 w-12" style={{ color: "var(--danger)" }} /><h1 className="mt-3 text-lg font-semibold">Payment not completed</h1>
            <p className="mt-1 text-sm text-muted">No money was taken. You can try again from the badges page.</p></>
        )}
        <Link href={ok ? "/verification" : "/badges"} className="btn btn-primary mt-5 w-full">{ok ? "Back to verification" : "Back to badges"}</Link>
      </div>
    </div>
  );
}

export default function BadgeReturn() {
  return <Suspense><Inner /></Suspense>;
}
