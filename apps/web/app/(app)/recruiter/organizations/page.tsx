"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Org = {
  id: number;
  name: string;
  website?: string;
  industry?: string;
  location?: string;
  verification_status: string;
};

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [industry, setIndustry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function load() {
    api<Org[]>("/api/organizations/mine").then(setOrgs).catch(() => setOrgs([]));
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/organizations", {
        method: "POST",
        body: JSON.stringify({ name, website: website || null, industry: industry || null }),
      });
      setName("");
      setWebsite("");
      setIndustry("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-content space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Organizations</h1>
        <p className="mt-1 text-muted">Create and verify your employer profile.</p>
      </div>

      <form onSubmit={onCreate} className="card max-w-lg space-y-4">
        <h2 className="font-semibold">Create organization</h2>
        <div>
          <label className="label">Name</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label">Website</label>
          <input className="input" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        <div>
          <label className="label">Industry</label>
          <input className="input" value={industry} onChange={(e) => setIndustry(e.target.value)} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" className="text-sm font-medium text-accent underline-offset-4 hover:underline" disabled={loading}>
          {loading ? "Creating…" : "Create"}
        </button>
      </form>

      <div className="space-y-3">
        {orgs.map((o) => (
          <div key={o.id} className="card flex items-center justify-between">
            <div>
              <p className="font-medium">{o.name}</p>
              <p className="text-sm text-muted">
                {[o.industry, o.location, o.website].filter(Boolean).join(" · ")}
              </p>
            </div>
            <span className="rounded-full bg-surface px-3 py-1 text-xs capitalize text-muted">
              {o.verification_status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
