"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Profile = {
  full_name?: string;
  username?: string;
  headline?: string;
  industry?: string;
  location?: string;
  country?: string;
  phone?: string;
  phone_country_code?: string;
  years_experience?: number;
  summary?: string;
  verification_score: number;
  profile_completion: number;
};

/** Common dial codes — default NG (+234) for Crede Africa focus */
const COUNTRY_CODES = [
  { code: "+234", label: "NG +234" },
  { code: "+233", label: "GH +233" },
  { code: "+254", label: "KE +254" },
  { code: "+27", label: "ZA +27" },
  { code: "+1", label: "US/CA +1" },
  { code: "+44", label: "UK +44" },
  { code: "+91", label: "IN +91" },
  { code: "+971", label: "AE +971" },
  { code: "+49", label: "DE +49" },
  { code: "+33", label: "FR +33" },
];

function normalizeLocalPhone(raw: string): string {
  return raw.replace(/[^\d]/g, "").replace(/^0+/, "");
}

export default function ProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [form, setForm] = useState<Partial<Profile>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .get<Profile>("/profile/me")
      .then((data) => {
        setP(data);
        setForm({
          ...data,
          phone_country_code: data.phone_country_code || "+234",
        });
      })
      .catch(console.error);
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const local = form.phone ? normalizeLocalPhone(String(form.phone)) : "";
    const dial = form.phone_country_code || "+234";
    const e164 = local ? `${dial}${local}` : null;
    const updated = await api.patch<Profile>("/profile/me", {
      full_name: form.full_name,
      username: form.username,
      headline: form.headline,
      industry: form.industry,
      location: form.location,
      country: form.country,
      phone: e164,
      phone_country_code: dial,
      years_experience: form.years_experience ? Number(form.years_experience) : null,
      summary: form.summary,
    });
    setP(updated);
    setForm({
      ...updated,
      phone_country_code: updated.phone_country_code || dial,
      // show national part in the input when possible
      phone: updated.phone?.startsWith(dial)
        ? updated.phone.slice(dial.length)
        : updated.phone || "",
    });
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
            ["country", "Country"],
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
          <label className="label">Mobile number</label>
          <div className="flex gap-2">
            <select
              className="input w-[140px] shrink-0"
              value={form.phone_country_code || "+234"}
              onChange={(e) => setForm({ ...form, phone_country_code: e.target.value })}
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              className="input flex-1"
              inputMode="tel"
              placeholder="8012345678"
              value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <p className="mt-1 text-xs text-muted">
            Stored as{" "}
            {(form.phone_country_code || "+234") +
              (form.phone ? normalizeLocalPhone(String(form.phone)) : "…")}
          </p>
        </div>

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
        <button type="submit" className="text-action">
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
