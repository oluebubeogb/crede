"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { TextAction } from "@/components/ui/TextAction";

type Org = { id: number; name: string };
type Job = {
  id: number;
  title: string;
  location?: string;
  status: string;
  organization_id: number;
};

export default function JobsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState<number | "">("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Org[]>("/api/organizations/mine").then((list) => {
      setOrgs(list);
      if (list.length) setOrgId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!orgId) return;
    api<Job[]>(`/api/jobs/org/${orgId}`).then(setJobs).catch(() => setJobs([]));
  }, [orgId]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setError(null);
    try {
      await api("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          organization_id: orgId,
          title,
          location: location || null,
          description: description || null,
          status: "open",
        }),
      });
      setTitle("");
      setLocation("");
      setDescription("");
      const list = await api<Job[]>(`/api/jobs/org/${orgId}`);
      setJobs(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  }

  async function runMatches(jobId: number) {
    try {
      await api(`/api/candidates/jobs/${jobId}/matches`, { method: "POST" });
      alert("Matches computed. Open Matches from the job row.");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Match failed");
    }
  }

  return (
    <div className="w-full space-y-0">
      <div>
        <h1 className="page-title">Jobs</h1>
        <p className="mt-1 text-muted">Post roles and match verified candidates.</p>
      </div>

      {orgs.length === 0 ? (
        <div className="card text-center">
          <p className="text-muted">Create an organization first.</p>
          <Link href="/recruiter/organizations" className="text-sm font-medium text-accent underline-offset-4 hover:underline">
            Organizations
          </Link>
        </div>
      ) : (
        <>
          <div className="flex gap-3">
            <select
              className="input w-64"
              value={orgId}
              onChange={(e) => setOrgId(Number(e.target.value))}
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={onCreate} className="card max-w-lg space-y-4">
            <h2 className="font-semibold">Post a job</h2>
            <div>
              <label className="label">Title</label>
              <input className="input" required value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="input min-h-[100px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button type="submit" className="text-action font-medium text-accent underline-offset-4 hover:underline">
              Create job
            </button>
          </form>

          <div className="space-y-3">
            {jobs.map((j) => (
              <div key={j.id} className="card flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{j.title}</p>
                  <p className="text-sm text-muted">
                    {j.location || "Remote / unspecified"} · <span className="capitalize">{j.status}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="text-sm text-muted hover:text-foreground underline-offset-4 hover:underline" onClick={() => runMatches(j.id)}>
                    Run matching
                  </button>
                  <Link href={`/recruiter/jobs/${j.id}/matches`} className="text-sm font-medium text-accent underline-offset-4 hover:underline">
                    Matches
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
