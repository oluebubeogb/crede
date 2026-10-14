"use client";

import { useEffect, useState } from "react";
import { API, api, getSession } from "@/lib/api";
import { TextAction } from "@/components/ui/TextAction";

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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-sm">
          <TextAction href="/login" variant="primary">
            Sign in
          </TextAction>
          <span className="text-muted">·</span>
          <TextAction href={healthHref} variant="muted">
            Open API /health
          </TextAction>
        </div>
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted">Loading dashboard…</p>;
  }

  const p = data.profile;
  const nextAction =
    data.timeline_count === 0
      ? { href: "/timeline", label: "Add your first career entry" }
      : p.verification_score < 30
        ? { href: "/verification", label: "Raise your verification score" }
        : { href: "/generate", label: "Generate a CV" };

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

      <div className="card">
        <p className="text-sm text-muted">Most important next step</p>
        <TextAction href={nextAction.href} variant="primary" className="mt-2 text-base">
          {nextAction.label} →
        </TextAction>
      </div>

      {data.recommended_actions?.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recommended actions</h2>
          <ul className="space-y-2">
            {data.recommended_actions.map((a) => (
              <li key={a} className="card text-sm flex items-center justify-between gap-3">
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <TextAction href="/timeline" variant="primary">
          Career Timeline
        </TextAction>
        <span className="text-muted">·</span>
        <TextAction href="/generate" variant="secondary">
          Generate CV
        </TextAction>
        <span className="text-muted">·</span>
        <TextAction href="/verification" variant="secondary">
          Verification
        </TextAction>
        <span className="text-muted">·</span>
        <TextAction href="/recruiter/dashboard" variant="muted">
          Recruiter portal
        </TextAction>
      </div>
    </div>
  );
}
