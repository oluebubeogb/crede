"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { ExternalLink } from "lucide-react";

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

const WORLD_COUNTRIES = ['Afghanistan', 'Albania', 'Algeria', 'Argentina', 'Australia', 'Austria', 'Bahrain', 'Bangladesh', 'Belgium', 'Benin', 'Brazil', 'Cameroon', 'Canada', 'Chile', 'China', 'Colombia', "Côte d'Ivoire", 'Denmark', 'Egypt', 'Ethiopia', 'Finland', 'France', 'Germany', 'Ghana', 'Greece', 'Hong Kong', 'India', 'Indonesia', 'Ireland', 'Israel', 'Italy', 'Japan', 'Jordan', 'Kenya', 'Kuwait', 'Lebanon', 'Malaysia', 'Mexico', 'Morocco', 'Netherlands', 'New Zealand', 'Nigeria', 'Norway', 'Oman', 'Pakistan', 'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Rwanda', 'Saudi Arabia', 'Senegal', 'Singapore', 'South Africa', 'South Korea', 'Spain', 'Sweden', 'Switzerland', 'Tanzania', 'Thailand', 'Turkey', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States', 'Vietnam', 'Zambia', 'Zimbabwe'];

function normalizeLocalPhone(raw: string): string {
  return raw.replace(/[^\d]/g, "").replace(/^0+/, "");
}

function LiveCircle({
  value,
  max = 100,
  label,
  display,
}: {
  value: number;
  max?: number;
  label: string;
  display?: string;
}) {
  const size = 96;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const offset = c - (pct / 100) * c;
  const color =
    pct >= 80 ? "#10b981" : pct >= 50 ? "#3b82f6" : pct >= 25 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            className="text-border opacity-60"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className="transition-all duration-500 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-base font-semibold tabular-nums" style={{ color }}>
            {display ?? `${Math.round(pct)}%`}
          </span>
        </div>
      </div>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

export default function ProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [form, setForm] = useState<Partial<Profile>>({});
  const [saved, setSaved] = useState(false);
  const [countryQ, setCountryQ] = useState("");
  const [showCountries, setShowCountries] = useState(false);

  useEffect(() => {
    api
      .get<Profile>("/profile/me")
      .then((data) => {
        setP(data);
        setForm({
          ...data,
          phone_country_code: data.phone_country_code || "+234",
        });
        setCountryQ(data.country || "");
      })
      .catch(console.error);
  }, []);

  const countryHints = useMemo(() => {
    const q = countryQ.trim().toLowerCase();
    if (q.length < 1) return [] as string[];
    return WORLD_COUNTRIES.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
  }, [countryQ]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const local = form.phone ? normalizeLocalPhone(String(form.phone)) : "";
    const dial = form.phone_country_code || "+234";
    const e164 = local ? `${dial}${local}` : null;
    const updated = await api.patch<Profile>("/profile/me", {
      full_name: form.full_name,
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
      phone: updated.phone?.startsWith(dial)
        ? updated.phone.slice(dial.length)
        : updated.phone || "",
    });
    setCountryQ(updated.country || "");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!p) return <p className="py-12 text-sm text-muted">Loading…</p>;

  const publicPath = form.username || p.username ? `/u/${form.username || p.username}` : null;
  const publicUrl =
    typeof window !== "undefined" && publicPath
      ? `${window.location.origin}${publicPath}`
      : publicPath;

  return (
    <div className="w-full space-y-0">
      <section className="note-section">
        <h1 className="page-title">Profile</h1>
        <p className="page-lead">Your public professional identity on Crede.</p>
      </section>

      <section className="note-section">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          Public profile
        </p>
        {publicPath ? (
          <Link
            href={publicPath}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-accent hover:underline"
          >
            {publicUrl || publicPath}
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Set a public username to get a shareable profile link.
          </p>
        )}
      </section>

      <section className="note-section">
        <div className="flex flex-wrap justify-center gap-12 sm:justify-start">
          <LiveCircle value={p.profile_completion} label="Profile completion" />
          <LiveCircle
            value={p.verification_score}
            max={100}
            label="Verification score"
            display={`${p.verification_score}`}
          />
        </div>
      </section>

      <section className="note-section">
        <form onSubmit={save} className="space-y-5">
          <div>
            <label className="label">Public username</label>
            <input
              className="input bg-border/20 text-muted"
              value={form.username || p.username || ""}
              readOnly
              disabled
            />
            <p className="mt-1 text-xs text-muted">Public username cannot be edited</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Full name</label>
              <input
                className="input"
                value={form.full_name ?? ""}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Headline</label>
              <input
                className="input"
                value={form.headline ?? ""}
                onChange={(e) => setForm({ ...form, headline: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label">Industry</label>
              <input
                className="input"
                value={form.industry ?? ""}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Location</label>
              <input
                className="input"
                value={form.location ?? ""}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div className="relative">
              <label className="label">Country</label>
              <input
                className="input"
                value={countryQ}
                placeholder="Start typing a country…"
                autoComplete="off"
                onChange={(e) => {
                  setCountryQ(e.target.value);
                  setForm({ ...form, country: e.target.value });
                  setShowCountries(true);
                }}
                onFocus={() => setShowCountries(true)}
                onBlur={() => setTimeout(() => setShowCountries(false), 150)}
              />
              {showCountries && countryHints.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto border border-border bg-background text-sm shadow-lg">
                  {countryHints.map((c) => (
                    <li key={c}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-border/30"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setCountryQ(c);
                          setForm({ ...form, country: c });
                          setShowCountries(false);
                        }}
                      >
                        {c}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
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
          </div>

          <div>
            <label className="label">Summary</label>
            <textarea
              className="input min-h-[120px] py-2"
              value={form.summary ?? ""}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button type="submit" className="text-action">
              Save
            </button>
            {saved && <span className="text-sm text-success">Saved</span>}
          </div>
        </form>
      </section>
    </div>
  );
}
