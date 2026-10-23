"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, Search, UsersRound } from "lucide-react";
import { useApi, useDebounced } from "@/lib/hooks";
import { Avatar, EmptyState, ErrorNote, PageHeader, SkeletonList, VerifiedBadge } from "@/components/ui/kit";
import type { Candidate } from "@/components/recruiter";

export default function CandidatesPage() {
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState("");
  const dq = useDebounced(q, 300), dl = useDebounced(loc, 300);
  const params = new URLSearchParams(); if (dq) params.set("q", dq); if (dl) params.set("location", dl);
  const { data, error, loading, reload } = useApi<Candidate[]>(`/candidates/search?${params}`, [dq, dl]);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Recruiter" title="Find candidates" lead="Public Crede profiles. Badges and verification counts come from the organisations themselves." />
      <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_220px]">
        <label className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input className="input pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, title or skill" /></label>
        <label className="relative"><MapPin className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input className="input pl-10" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Location" /></label>
      </div>
      {error ? <ErrorNote message={error} onRetry={reload} /> : loading && !data ? <SkeletonList n={4} avatar /> : !data?.length ? (
        <EmptyState icon={UsersRound} title="No candidates found" body="Try a broader search." />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {data.map((c) => (
            <li key={c.id}>
              <Link href={c.username ? `/u/${c.username}` : "#"} className="card flex gap-3 p-4">
                <Avatar name={c.full_name} src={c.avatar_url} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 font-semibold">{c.full_name || "Professional"}<VerifiedBadge level={c.badge_level} /></p>
                  <p className="line-clamp-1 text-sm text-muted">{c.headline}</p>
                  <p className="mt-1 text-xs text-muted">{[c.location, c.claims?.label].filter(Boolean).join(" · ")}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
