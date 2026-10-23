"use client";

import Link from "next/link";
import { Building2, BriefcaseBusiness, Plus, Search, UsersRound } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { EmptyState, ErrorNote, OrgMark, PageHeader, RowLink, SkeletonList } from "@/components/ui/kit";
import { ClaimPill, ORG_TYPE, type Org } from "@/components/orgs";

export default function RecruiterDashboard() {
  const { data: orgs, error, loading, reload } = useApi<Org[]>("/organizations/mine");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader eyebrow="Recruiter" title="Hiring" lead="Post roles from your organisations and rank candidates against every requirement." />
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <RowLink href="/recruiter/jobs" icon={BriefcaseBusiness} tint="blue" title="Jobs" sub="Post & manage roles" />
        <RowLink href="/recruiter/candidates" icon={Search} tint="sky" title="Find candidates" sub="Search verified talent" />
        <RowLink href="/orgs" icon={UsersRound} tint="violet" title="Organisations" sub="Claim, verify, members" />
      </div>
      <p className="section-title mb-3">Your organisations</p>
      {error ? <ErrorNote message={error} onRetry={reload} /> : loading && !orgs ? <SkeletonList n={2} avatar /> : !orgs?.length ? (
        <EmptyState icon={Building2} title="No organisation yet" body="Find your company and claim it with your official work email, or add it if it's not listed." action={<Link href="/orgs" className="link text-sm">Find or add your organisation</Link>} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {orgs.map((o) => (
            <li key={o.id}>
              <Link href={`/orgs/${o.id}`} className="card flex items-center gap-3 p-4">
                <OrgMark name={o.name} src={o.logo_url} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 font-semibold">{o.name}</p>
                  <p className="text-xs text-muted">{ORG_TYPE[o.org_type]?.label} · {o.my_role || "member"}</p>
                </div>
                <ClaimPill status={o.claim_status} />
              </Link>
            </li>
          ))}
          <li><Link href="/recruiter/jobs" className="card flex h-full items-center justify-center gap-2 p-4 text-sm text-muted"><Plus className="h-4 w-4" />Post a job</Link></li>
        </ul>
      )}
    </div>
  );
}
