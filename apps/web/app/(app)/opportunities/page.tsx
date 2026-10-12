"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

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
    organization?: { id?: number; name?: string };
  };
};

export default function OpportunitiesPage() {
  const [items, setItems] = useState<Opp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Opp[]>("/opportunities")
      .then(setItems)
      .catch((e) => setError(e.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Opportunities</h1>
        <p className="mt-4 text-slate-500">Loading matched roles…</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Opportunities</h1>
      <p className="mt-1 text-slate-500">Open roles matched to your career timeline and skills.</p>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!error && items.length === 0 && (
        <div className="mt-10 rounded-2xl border border-dashed border-slate-200 dark:border-zinc-700 p-12 text-center">
          <p className="text-slate-600 dark:text-zinc-400 text-lg">No matched opportunities yet.</p>
          <p className="mt-2 text-sm text-slate-400">
            Complete your timeline and skills — when recruiters post open roles, matches will appear here.
          </p>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {items.map((item) => (
          <div
            key={`${item.job.id}-${item.match_id ?? "x"}`}
            className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 flex items-start justify-between gap-4"
          >
            <div>
              <h2 className="font-semibold text-slate-900 dark:text-white">{item.job.title}</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {item.job.organization?.name || "Company"}
                {item.job.location ? ` · ${item.job.location}` : ""}
              </p>
              {(item.job.salary_min || item.job.salary_max) && (
                <p className="text-sm text-slate-400 mt-1">
                  {item.job.salary_min ? `₦${item.job.salary_min.toLocaleString()}` : ""}
                  {item.job.salary_min && item.job.salary_max ? " – " : ""}
                  {item.job.salary_max ? `₦${item.job.salary_max.toLocaleString()}` : ""}
                </p>
              )}
            </div>
            <div className="text-right shrink-0">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 font-semibold text-sm">
                {Math.round(item.score)}%
              </div>
              <p className="text-xs text-slate-400 mt-1">match</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
