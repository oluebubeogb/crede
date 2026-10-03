"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

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

  useEffect(() => {
    api<Dashboard>("/api/profile/dashboard")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="card">
        <p className="text-danger">{error}</p>
        <p className="mt-2 text-sm text-muted">
          Sign in via Collab Accounts and ensure the <code>crede</code> product is granted.
        </p>
        <Link href="/login" className="btn-primary mt-4 inline-flex">
          Login
        </Link>
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
          Hello{profile.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
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
            <li className="text-sm text-muted">You&apos;re in good shape.</li>
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
