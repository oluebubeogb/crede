"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Entry = {
  id: number;
  job_title: string;
  organization: string;
  start_date: string;
  end_date?: string;
  is_current: boolean;
  verification_status: string;
  achievements?: string[];
  description?: string;
};

const emptyForm = {
  job_title: "",
  organization: "",
  industry: "",
  employment_type: "full-time",
  start_date: "",
  end_date: "",
  is_current: false,
  description: "",
  achievements: "",
  team_size: "",
  budget_managed: "",
};

export default function TimelinePage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api<Entry[]>("/api/timeline")
      .then(setEntries)
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      job_title: form.job_title,
      organization: form.organization,
      industry: form.industry || null,
      employment_type: form.employment_type || null,
      start_date: form.start_date,
      end_date: form.is_current || !form.end_date ? null : form.end_date,
      is_current: form.is_current,
      description: form.description || null,
      achievements: form.achievements
        ? form.achievements.split("\n").map((s) => s.trim()).filter(Boolean)
        : null,
      team_size: form.team_size ? Number(form.team_size) : null,
      budget_managed: form.budget_managed || null,
    };
    await api("/api/timeline", { method: "POST", body: JSON.stringify(body) });
    setOpen(false);
    setForm(emptyForm);
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Career Timeline</h1>
          <p className="text-sm text-muted">Source of truth for CVs and discovery</p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
          Add Entry
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {entries.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-muted">Add your first career milestone.</p>
          <button type="button" className="btn-primary mt-4" onClick={() => setOpen(true)}>
            Add Entry
          </button>
        </div>
      ) : (
        <div className="space-y-0 border-l-2 border-border ml-3">
          {entries.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelected(e)}
              className="relative block w-full pl-8 pb-8 text-left"
            >
              <span className="absolute left-[-7px] top-1.5 h-3 w-3 rounded-full border-2 border-accent bg-background" />
              <p className="text-xs text-muted">
                {e.start_date?.slice(0, 4)}
                {e.is_current ? " – Present" : e.end_date ? ` – ${e.end_date.slice(0, 4)}` : ""}
              </p>
              <p className="font-medium">{e.job_title}</p>
              <p className="text-sm text-muted">{e.organization}</p>
              <span className="mt-1 inline-block rounded-full bg-border/60 px-2 py-0.5 text-[11px] text-muted">
                {e.verification_status}
              </span>
            </button>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={save} className="card max-h-[90vh] w-full max-w-lg overflow-y-auto">
            <h2 className="text-lg font-semibold">Add career entry</h2>
            <div className="mt-4 space-y-3">
              <div>
                <label className="label">Job title</label>
                <input
                  className="input"
                  required
                  value={form.job_title}
                  onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Organization</label>
                <input
                  className="input"
                  required
                  value={form.organization}
                  onChange={(e) => setForm({ ...form, organization: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start date</label>
                  <input
                    type="date"
                    className="input"
                    required
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">End date</label>
                  <input
                    type="date"
                    className="input"
                    disabled={form.is_current}
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_current}
                  onChange={(e) => setForm({ ...form, is_current: e.target.checked })}
                />
                Current role
              </label>
              <div>
                <label className="label">Description</label>
                <textarea
                  className="input h-24 py-2"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Achievements (one per line)</label>
                <textarea
                  className="input h-24 py-2"
                  value={form.achievements}
                  onChange={(e) => setForm({ ...form, achievements: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {selected && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md border-l border-border bg-surface p-6 shadow-xl">
          <button type="button" className="text-sm text-muted" onClick={() => setSelected(null)}>
            Close
          </button>
          <h2 className="mt-4 text-xl font-semibold">{selected.job_title}</h2>
          <p className="text-muted">{selected.organization}</p>
          <p className="mt-2 text-sm text-muted">
            {selected.start_date}
            {selected.is_current ? " – Present" : selected.end_date ? ` – ${selected.end_date}` : ""}
          </p>
          {selected.description && <p className="mt-4 text-sm">{selected.description}</p>}
          {selected.achievements && selected.achievements.length > 0 && (
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
              {selected.achievements.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          )}
          <p className="mt-6 text-xs uppercase tracking-wide text-muted">
            Verification: {selected.verification_status}
          </p>
        </div>
      )}
    </div>
  );
}
