"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API, api, getAccountsSession } from "@/lib/api";

type Dashboard = {
  profile: {
    full_name?: string;
    headline?: string;
    verification_score: number;
    profile_completion: number;
  };
  timeline_count: number;
  verified_docs: number;
  generated_cvs: number;
  recommended_actions: string[];
};

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const session = await getAccountsSession();
        if (!session) {
          setError("No Collab session cookie found.");
          setHint(
            "Sign in again on /login. Accounts CORS must allow https://crede.collab.name.ng with credentials."
          );
          return;
        }
        const products = (session.products || []).map((p) => String(p).toLowerCase());
        if (products.length && !products.includes("crede")) {
          setError("Collab session OK, but the crede product is not on your account yet.");
          setHint(
            "On Accounts, ensure products.py has crede with default=True, then call GET /auth/me once (or log out/in) to backfill."
          );
          return;
        }

        const dash = await api<Dashboard>("/api/profile/dashboard");
        setData(dash);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setError(msg);
        if (msg.toLowerCase().includes("failed to fetch")) {
          setHint(
            "Browser could not reach the Crede API via /backend proxy. Check API is up and rebuild web with API_PROXY_TARGET=https://api-crede.collab.name.ng"
          );
        } else if (msg.toLowerCase().includes("crede access") || msg.includes("403")) {
          setHint("Grant crede product on Collab Accounts (default=True + /auth/me backfill).");
        }
      }
    })();
  }, []);

  if (error) {
    const healthHref = (API || "https://api-crede.collab.name.ng") + "/health";
    return (
      <div className="card space-y-3">
        <p className="font-medium text-danger">{error}</p>
        {hint && <p className="text-sm text-muted">{hint}</p>}
        <p className="text-xs text-muted">API base: {API || "/backend"}</p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link href="/login" className="btn-primary">
            Login
          </Link>
          <a href={healthHref} target="_blank" rel="noreferrer" className="btn-secondary">
            Open API /health
          </a>
        </div>
      </div>
    );
  }

  if (!data) {
    return <p className="text-muted">Loading…</p>;
  }

  const { profile } = data;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">
          Hello{profile.full_name ? ", " + profile.full_name.split(" ")[0] : ""}
        </h1>
        <p className="mt-1 text-muted">{profile.headline || "Complete your professional profile"}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-muted">Profile</p>
          <p className="mt-2 text-3xl font-semibold">{profile.profile_completion}%</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-muted">Verification</p>
          <p className="mt-2 text-3xl font-semibold">{profile.verification_score}/100</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-muted">Career entries</p>
          <p className="mt-2 text-3xl font-semibold">{data.timeline_count}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase tracking-wide text-muted">Generated CVs</p>
          <p className="mt-2 text-3xl font-semibold">{data.generated_cvs}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="font-semibold">Recommended actions</h2>
        <ul className="mt-4 space-y-2">
          {data.recommended_actions.length === 0 && (
            <li className="text-sm text-muted">You are in good shape.</li>
          )}
          {data.recommended_actions.map((a) => (
            <li key={a}>
              <Link
                href={
                  a.includes("CV")
                    ? "/generate"
                    : a.includes("Verify")
                      ? "/verification"
                      : a.includes("timeline") || a.includes("milestone")
                        ? "/timeline"
                        : "/profile"
                }
                className="text-sm text-accent hover:underline"
              >
                {a}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
