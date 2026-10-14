"use client";

import { useEffect, useState, useMemo } from "react";
import { api } from "@/lib/api";
import { TextAction } from "@/components/ui/TextAction";
import { CircleCheckbox } from "@/components/ui/CircleCheckbox";

type Opp = {
  match_id: number | null;
  score: number;
  job: {
    id: number;
    title: string;
    location?: string;
    salary_min?: number;
    salary_max?: number;
    status: string;
    employment_type?: string;
    description?: string;
    organization?: { id?: number; name?: string };
  };
  reasons?: string[];
};

const FILTERS = [
  { key: "remote", label: "Remote" },
  { key: "senior", label: "Senior" },
  { key: "verified_req", label: "Verification preferred" },
  { key: "high_match", label: "Match ≥ 70%" },
];

export default function OpportunitiesPage() {
  const [items, setItems] = useState<Opp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<number | null>(null);
  const [interested, setInterested] = useState<Set<number>>(new Set());

  useEffect(() => {
    api
      .get<Opp[]>("/opportunities")
      .then(setItems)
      .catch((e) => setError(e.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (filters.high_match && item.score < 70) return false;
      if (filters.remote) {
        const loc = (item.job.location || "").toLowerCase();
        if (!loc.includes("remote") && !loc.includes("hybrid")) return false;
      }
      if (filters.senior) {
        const t = (item.job.title || "").toLowerCase();
        if (!t.includes("senior") && !t.includes("lead") && !t.includes("principal") && !t.includes("director"))
          return false;
      }
      return true;
    });
  }, [items, filters]);

  function toggleFilter(key: string) {
    setFilters((f) => ({ ...f, [key]: !f[key] }));
  }

  function markInterested(jobId: number) {
    setInterested((s) => new Set(s).add(jobId));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Opportunities</h1>
        <p className="text-sm text-muted">Loading matched roles…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Opportunities</h1>
        <p className="mt-1 text-sm text-muted">
          Personalized open roles based on your verified timeline and skills. Unlimited matching for every user.
        </p>
      </header>

      {/* Filters via CircleCheckboxes */}
      <div className="card">
        <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">Filters</p>
        <div className="flex flex-wrap gap-4">
          {FILTERS.map((f) => (
            <CircleCheckbox
              key={f.key}
              checked={!!filters[f.key]}
              onChange={() => toggleFilter(f.key)}
              label={f.label}
            />
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-card border border-danger bg-surface px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {!error && filtered.length === 0 && (
        <div className="card flex flex-col items-start gap-3">
          <p className="text-sm text-muted">
            {items.length === 0
              ? "No matched opportunities yet. Complete your timeline and skills — when recruiters post open roles, matches appear here."
              : "No opportunities match the current filters."}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <TextAction href="/timeline" variant="primary">
              Complete timeline
            </TextAction>
            <span className="text-muted">·</span>
            <TextAction href="/skills" variant="muted">
              Add skills
            </TextAction>
            {Object.values(filters).some(Boolean) && (
              <>
                <span className="text-muted">·</span>
                <TextAction variant="muted" onClick={() => setFilters({})}>
                  Clear filters
                </TextAction>
              </>
            )}
          </div>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((item) => {
          const isExp = expanded === item.job.id;
          const isInt = interested.has(item.job.id);
          return (
            <article key={`${item.job.id}-${item.match_id ?? "x"}`} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-medium">{item.job.title}</h2>
                  <p className="mt-0.5 text-sm text-muted">
                    {item.job.organization?.name || "Organization"}
                    {item.job.location ? ` · ${item.job.location}` : ""}
                    {item.job.employment_type ? ` · ${item.job.employment_type}` : ""}
                  </p>
                  {(item.job.salary_min || item.job.salary_max) && (
                    <p className="mt-1 text-xs text-muted">
                      {item.job.salary_min?.toLocaleString()}
                      {item.job.salary_max ? ` – ${item.job.salary_max.toLocaleString()}` : "+"}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-accent">{Math.round(item.score)}%</p>
                  <p className="text-xs text-muted">match</p>
                </div>
              </div>

              {isExp && (
                <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
                  {item.job.description && (
                    <p className="text-foreground line-clamp-6">{item.job.description}</p>
                  )}
                  {item.reasons && item.reasons.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">
                        Why you match
                      </p>
                      <ul className="list-inside list-disc space-y-0.5 text-muted">
                        {item.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <TextAction
                  variant="muted"
                  onClick={() => setExpanded(isExp ? null : item.job.id)}
                >
                  {isExp ? "Hide details" : "View details"}
                </TextAction>
                <span className="text-muted">·</span>
                <TextAction
                  href={`/generate?job=${item.job.id}&title=${encodeURIComponent(item.job.title)}`}
                  variant="primary"
                >
                  Generate tailored materials
                </TextAction>
                <span className="text-muted">·</span>
                {isInt ? (
                  <span className="text-success text-sm">● Marked interested</span>
                ) : (
                  <TextAction variant="secondary" onClick={() => markInterested(item.job.id)}>
                    Mark interested
                  </TextAction>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
