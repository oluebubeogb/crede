"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";

type Profile = {
  full_name?: string;
  headline?: string;
  verification_score: number;
  summary?: string;
  location?: string;
};

export default function PublicProfilePage() {
  const params = useParams();
  const username = params.username as string;
  const [p, setP] = useState<Profile | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    api<Profile>(`/api/profile/public/${username}`)
      .then(setP)
      .catch(() => setErr(true));
  }, [username]);

  if (err) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">Profile not found</div>
    );
  }
  if (!p) return <div className="flex min-h-screen items-center justify-center text-muted">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="card">
        <h1 className="text-3xl font-semibold">{p.full_name || username}</h1>
        <p className="mt-2 text-lg text-muted">{p.headline}</p>
        <p className="mt-4 text-sm">
          Verification score <span className="font-semibold text-accent">{p.verification_score}/100</span>
        </p>
        {p.location && <p className="mt-1 text-sm text-muted">{p.location}</p>}
        {p.summary && <p className="mt-6 text-sm leading-relaxed">{p.summary}</p>}
      </div>
    </div>
  );
}
