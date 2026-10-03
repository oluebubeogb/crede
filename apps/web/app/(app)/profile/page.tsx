"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Profile = {
  full_name?: string;
  username?: string;
  headline?: string;
  industry?: string;
  location?: string;
  years_experience?: number;
  summary?: string;
  verification_score: number;
  profile_completion: number;
};

export default function ProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [form, setForm] = useState<Partial<Profile>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api<Profile>("/api/profile/me").then((data) => {
      setP(data);
      setForm(data);
    }).catch(console.error);
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const updated = await api<Profile>("/api/profile/me", {
      method: "PATCH",
      body: JSON.stringify({
        full_name: form.full_name,
        username: form.username,
        headline: form.headline,
        industry: form.industry,
        location: form.location,
        years_experience: form.years_experience ? Number(form.years_experience) : null,
        summary: form.summary,
      }),
    });
    setP(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!p) return <p className="text-muted">Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="text-sm text-muted">
          Completion {p.profile_completion}% · Verification {p.verification_score}/100
        </p>
      </div>
      <form onSubmit={save} className="card space-y-4">
        {(
          [
            ["full_name", "Full name"],
            ["username", "Public username"],
            ["headline", "Headline"],
            ["industry", "Industry"],
            ["location", "Location"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className="label">{label}</label>
            <input
              className="input"
              value={(form as Record<string, string | number | undefined>)[key] ?? ""}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </div>
        ))}
        <div>
          <label className="label">Years of experience</label>
          <input
            type="number"
            className="input"
            value={form.years_experience ?? ""}
            onChange={(e) => setForm({ ...form, years_experience: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="label">Summary</label>
          <textarea
            className="input min-h-[120px] py-2"
            value={form.summary ?? ""}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
          />
        </div>
        <button type="submit" className="btn-primary">
          Save
        </button>
        {saved && <span className="ml-3 text-sm text-success">Saved</span>}
      </form>
      {p.username && (
        <p className="text-sm text-muted">
          Public URL: <code>/u/{p.username}</code>
        </p>
      )}
    </div>
  );
}
