"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Search, ShieldCheck } from "lucide-react";

type Candidate = {
  id: number;
  full_name?: string;
  headline?: string;
  industry?: string;
  location?: string;
  years_experience?: number;
  verification_score: number;
  username?: string;
  match_score?: number;
};

export default function CandidatesPage() {
  const [q, setQ] = useState("");
  const [industry, setIndustry] = useState("");
  const [minVer, setMinVer] = useState(0);
  const [results, setResults] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);

  async function search() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (industry) params.set("industry", industry);
      if (minVer) params.set("min_verification", String(minVer));
      const data = await api<Candidate[]>(`/api/candidates/search?${params}`);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-content space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Candidates</h1>
        <p className="mt-1 text-muted">Search verified professional identities.</p>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input pl-9"
              placeholder="Name, headline…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
          </div>
          <input
            className="input w-40"
            placeholder="Industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
          />
          <select
            className="input w-44"
            value={minVer}
            onChange={(e) => setMinVer(Number(e.target.value))}
          >
            <option value={0}>Any verification</option>
            <option value={20}>20+ score</option>
            <option value={50}>50+ score</option>
            <option value={70}>70+ score</option>
          </select>
          <button type="button" className="btn-primary" onClick={search} disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </div>
      </div>

      {results.length === 0 && !loading ? (
        <div className="card text-center text-muted">No candidates match your filters.</div>
      ) : (
        <div className="grid gap-3">
          {results.map((c) => (
            <div key={c.id} className="card flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-medium">{c.full_name || "Unnamed"}</p>
                <p className="text-sm text-muted">{c.headline}</p>
                <p className="mt-1 text-xs text-muted">
                  {[c.industry, c.location, c.years_experience != null ? `${c.years_experience} yrs` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-sm">
                  <ShieldCheck className="h-4 w-4 text-success" />
                  <span className="font-medium">{c.verification_score}</span>
                  <span className="text-muted">/100</span>
                </div>
                {c.username ? (
                  <Link href={`/u/${c.username}`} className="btn-secondary text-sm">
                    View profile
                  </Link>
                ) : (
                  <span className="text-xs text-muted">No public URL</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
