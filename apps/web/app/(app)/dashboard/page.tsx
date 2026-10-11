"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { API, api, getSession } from "@/lib/api";

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
        const session = await getSession();
        if (!session) {
          setError("Not signed in.");
          setHint("Create an account or sign in on /login.");
          return;
        }
        const dash = await api<Dashboard>("/api/profile/dashboard");
        setData(dash);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        setError(msg);
        if (msg.toLowerCase().includes("failed to fetch")) {
          setHint("Could not reach the Crede API via /backend. Is the API running on port 8008?");
        }
      }
    })();
  }, []);

  if (error) {
    const healthHref = (API || "http://localhost:8008") + "/health";
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
    return <p className="text-sm text-muted">Loading dashboard…</p>;
  }

  const p = data.profile;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Hello{p.full_name ? `, ${p.full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-muted">{p.headline || "Complete your profile to get started."}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <p className="text-sm text-muted">Profile completion</p>
          <p className="mt-1 text-2xl font-semibold">{p.profile_completion}%</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted">Verification score</p>
          <p className="mt-1 text-2xl font-semibold">{p.verification_score}/100</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted">Career entries</p>
          <p className="mt-1 text-2xl font-semibold">{data.timeline_count}</p>
        </div>
        <div className="card">
          <p className="text-sm text-muted">Generated CVs</p>
          <p className="mt-1 text-2xl font-semibold">{data.generated_cvs}</p>
        </div>
      </div>

      {data.recommended_actions?.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recommended actions</h2>
          <ul className="space-y-2">
            {data.recommended_actions.map((a) => (
              <li key={a} className="card text-sm">
                {a}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/timeline" className="btn-primary">
          Career Timeline
        </Link>
        <Link href="/generate" className="btn-secondary">
          Generate CV
        </Link>
        <Link href="/recruiter/dashboard" className="btn-secondary">
          Recruiter portal
        </Link>
      </div>
    </div>
  );
}
