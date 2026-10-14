"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Building2, Briefcase, Users, Search } from "lucide-react";

type Org = { id: number; name: string; verification_status: string };

export default function RecruiterDashboard() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Org[]>("/api/organizations/mine")
      .then(setOrgs)
      .catch(() => setOrgs([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-content space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Recruiter dashboard</h1>
        <p className="mt-1 text-muted">Search verified professionals and manage hiring.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/recruiter/candidates" className="card flex items-center gap-4 transition hover:border-accent">
          <div className="flex h-10 w-10 items-center justify-center rounded-btn bg-accent/10 text-accent">
            <Search className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium">Find candidates</p>
            <p className="text-sm text-muted">Search verified profiles</p>
          </div>
        </Link>
        <Link href="/recruiter/jobs" className="card flex items-center gap-4 transition hover:border-accent">
          <div className="flex h-10 w-10 items-center justify-center rounded-btn bg-accent/10 text-accent">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium">Jobs</p>
            <p className="text-sm text-muted">Post & match roles</p>
          </div>
        </Link>
        <Link href="/recruiter/organizations" className="card flex items-center gap-4 transition hover:border-accent">
          <div className="flex h-10 w-10 items-center justify-center rounded-btn bg-accent/10 text-accent">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium">Organizations</p>
            <p className="text-sm text-muted">Company profiles</p>
          </div>
        </Link>
        <div className="card flex items-center gap-4 opacity-60">
          <div className="flex h-10 w-10 items-center justify-center rounded-btn bg-surface text-muted">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium">Pipelines</p>
            <p className="text-sm text-muted">Coming soon</p>
          </div>
        </div>
      </div>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your organizations</h2>
          <Link href="/recruiter/organizations" className="text-sm text-accent hover:underline">
            Manage
          </Link>
        </div>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : orgs.length === 0 ? (
          <div className="card text-center">
            <p className="text-muted">No organization yet.</p>
            <Link href="/recruiter/organizations" className="text-action">
              Create organization
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {orgs.map((o) => (
              <div key={o.id} className="card flex items-center justify-between">
                <div>
                  <p className="font-medium">{o.name}</p>
                  <p className="text-xs capitalize text-muted">{o.verification_status}</p>
                </div>
                <Link href={`/recruiter/jobs?org=${o.id}`} className="text-sm text-accent hover:underline">
                  Jobs →
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
