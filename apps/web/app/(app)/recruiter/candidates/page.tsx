"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Search, ShieldCheck, UserRound, ListPlus, BadgeCheck } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { TextAction } from "@/components/ui/TextAction";
import { CircleCheckbox } from "@/components/ui/CircleCheckbox";

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

const VER_FILTERS = [
  { value: 0, label: "Any score" },
  { value: 20, label: "20+" },
  { value: 50, label: "50+" },
  { value: 70, label: "70+" },
];

export default function CandidatesPage() {
  const [q, setQ] = useState("");
  const [industry, setIndustry] = useState("");
  const [minVer, setMinVer] = useState(0);
  const [results, setResults] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [shortlist, setShortlist] = useState<Set<number>>(new Set());

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

  function toggleShortlist(id: number) {
    setShortlist((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="page-title">Candidates</h1>
        <p className="mt-1 text-sm text-muted">
          Unlimited search across verified professional identities. Filter by verification score.
        </p>
      </header>

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
        </div>
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted">
            Minimum verification score
          </p>
          <div className="flex flex-wrap gap-4">
            {VER_FILTERS.map((f) => (
              <CircleCheckbox
                key={f.value}
                checked={minVer === f.value}
                onChange={() => setMinVer(f.value)}
                label={f.label}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <TextAction type="button" variant="primary" onClick={search} disabled={loading}>
            {loading ? "Searching…" : "Search candidates"}
          </TextAction>
        </div>
      </div>

      {results.length === 0 && !loading ? (
        <div className="card flex flex-col items-start gap-2">
          <p className="text-sm text-muted">No candidates match your filters.</p>
          <TextAction variant="muted" onClick={() => { setQ(""); setIndustry(""); setMinVer(0); search(); }}>
            Clear filters
          </TextAction>
        </div>
      ) : (
        <div className="grid gap-3">
          {results.map((c) => (
            <article key={c.id} className="card flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{c.full_name || "Unnamed"}</p>
                <p className="text-sm text-muted">{c.headline}</p>
                <p className="mt-1 text-xs text-muted">
                  {[c.industry, c.location, c.years_experience != null ? `${c.years_experience} yrs` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {c.match_score != null && (
                  <p className="mt-1 text-xs text-accent">Match {Math.round(c.match_score)}%</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-1.5 text-sm">
                  <ShieldCheck className="h-4 w-4 text-success" />
                  <span className="font-medium">{c.verification_score}</span>
                  <span className="text-muted">/100</span>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-0.5">
                  {c.username ? (
                    <IconButton label="View full profile" href={`/u/${c.username}`}>
                      <UserRound className="h-4 w-4" />
                    </IconButton>
                  ) : (
                    <IconButton label="No public profile" disabled>
                      <UserRound className="h-4 w-4 opacity-40" />
                    </IconButton>
                  )}
                  <IconButton
                    label={shortlist.has(c.id) ? "On shortlist" : "Add to shortlist"}
                    active={shortlist.has(c.id)}
                    onClick={() => toggleShortlist(c.id)}
                  >
                    <ListPlus className="h-4 w-4" />
                  </IconButton>
                  <IconButton label="Request more verification" href="/verification">
                    <BadgeCheck className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
