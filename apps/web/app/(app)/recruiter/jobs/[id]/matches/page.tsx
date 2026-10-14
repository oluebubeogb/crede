"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { ShieldCheck } from "lucide-react";

type Match = {
  id: number;
  overall_score: number;
  experience_score: number;
  skill_score: number;
  verification_bonus: number;
  profile?: {
    id: number;
    full_name?: string;
    headline?: string;
    verification_score: number;
    username?: string;
  };
};

export default function JobMatchesPage() {
  const params = useParams();
  const jobId = params.id as string;
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Match[]>(`/api/candidates/jobs/${jobId}/matches`)
      .then(setMatches)
      .catch(() => setMatches([]))
      .finally(() => setLoading(false));
  }, [jobId]);

  return (
    <div className="mx-auto max-w-content space-y-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Top matches</h1>
          <p className="mt-1 text-muted">Ranked by experience, skills, location & verification.</p>
        </div>
        <Link href="/recruiter/jobs" className="text-sm text-accent hover:underline">
          ← Jobs
        </Link>
      </div>

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : matches.length === 0 ? (
        <div className="card text-center text-muted">
          No matches yet. Run matching from the Jobs page.
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((m) => (
            <div key={m.id} className="card flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-medium">{m.profile?.full_name || `Profile #${m.profile?.id ?? m.id}`}</p>
                <p className="text-sm text-muted">{m.profile?.headline}</p>
                <p className="mt-1 text-xs text-muted">
                  Exp {m.experience_score}% · Skills {m.skill_score}% · Ver bonus {m.verification_bonus}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-2xl font-semibold text-accent">{m.overall_score}%</p>
                  <p className="text-xs text-muted">match</p>
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <ShieldCheck className="h-4 w-4 text-success" />
                  {m.profile?.verification_score ?? "—"}
                </div>
                {m.profile?.username && (
                  <Link href={`/u/${m.profile.username}`} className="text-action-muted">
                    Profile
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
