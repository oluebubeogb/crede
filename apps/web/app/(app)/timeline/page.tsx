"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

type Entry = {
  id: number;
  job_title: string;
  organization: string;
  industry?: string;
  employment_type?: string;
  start_date: string;
  end_date?: string;
  is_current: boolean;
  verification_status: string;
  achievements?: string[];
  responsibilities?: string[];
  description?: string;
  team_size?: number;
  budget_managed?: string;
};

type Occ = {
  id: number;
  title: string;
  definition?: string;
  tasks?: string;
  skills_suggested?: string[];
  aliases?: string[];
};

const emptyForm = {
  job_title: "",
  organization: "",
  industry: "",
  employment_type: "full_time",
  start_date: "",
  end_date: "",
  is_current: false,
  description: "",
  achievements: "",
  responsibilities: "",
  team_size: "",
  budget_managed: "",
};

export default function TimelinePage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [titleHints, setTitleHints] = useState<Occ[]>([]);
  const [occDetail, setOccDetail] = useState<Occ | null>(null);

  function load() {
    api<Entry[]>("/api/timeline")
      .then(setEntries)
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  const searchTitles = useCallback(async (q: string) => {
    if (q.trim().length < 1) {
      setTitleHints([]);
      return;
    }
    try {
      const rows = await api.get<Occ[]>(`/occupations/search?q=${encodeURIComponent(q)}&limit=12`);
      setTitleHints(rows);
    } catch {
      setTitleHints([]);
    }
  }, []);

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setOccDetail(null);
    setOpen(true);
  }

  function openEdit(e: Entry) {
    if ((e.verification_status || "").toLowerCase() === "verified") {
      const ok = confirm(
        "This timeline entry is verified. Editing will remove its verification status. You will need to re-submit proof. Continue?"
      );
      if (!ok) return;
    }
    setEditingId(e.id);
    setForm({
      job_title: e.job_title || "",
      organization: e.organization || "",
      industry: e.industry || "",
      employment_type: e.employment_type || "full_time",
      start_date: e.start_date?.slice(0, 10) || "",
      end_date: e.end_date?.slice(0, 10) || "",
      is_current: e.is_current,
      description: e.description || "",
      achievements: (e.achievements || []).join("\n"),
      responsibilities: (e.responsibilities || []).join("\n"),
      team_size: e.team_size != null ? String(e.team_size) : "",
      budget_managed: e.budget_managed || "",
    });
    setSelected(null);
    setOpen(true);
  }

  async function remove(e: Entry) {
    const verified = (e.verification_status || "").toLowerCase() === "verified";
    const msg = verified
      ? "This entry is verified. Deleting it permanently removes the verified record. Continue?"
      : "Delete this timeline entry?";
    if (!confirm(msg)) return;
    await api.delete(`/timeline/${e.id}`);
    setSelected(null);
    load();
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
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
      responsibilities: form.responsibilities
        ? form.responsibilities.split("\n").map((s) => s.trim()).filter(Boolean)
        : null,
      team_size: form.team_size ? Number(form.team_size) : null,
      budget_managed: form.budget_managed || null,
    };
    if (editingId) {
      await api(`/api/timeline/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
    } else {
      await api("/api/timeline", { method: "POST", body: JSON.stringify(body) });
      // learn unknown titles
      try {
        await api.post("/occupations/suggest", { title: form.job_title });
      } catch {
        /* ignore */
      }
    }
    setOpen(false);
    setForm(emptyForm);
    setEditingId(null);
    load();
  }

  function applyOcc(o: Occ) {
    setForm((f) => ({ ...f, job_title: o.title }));
    setOccDetail(o);
    setTitleHints([]);
    if (o.tasks && !form.responsibilities) {
      const lines = o.tasks
        .split(/[;\n]/)
        .map((s) => s.replace(/^\([a-z]\)\s*/i, "").trim())
        .filter((s) => s.length > 8)
        .slice(0, 8);
      setForm((f) => ({
        ...f,
        job_title: o.title,
        responsibilities: lines.join("\n"),
        description: o.definition?.slice(0, 400) || f.description,
      }));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Career Timeline</h1>
          <p className="text-sm text-muted">Source of truth for CVs and discovery</p>
        </div>
        <button type="button" className="btn-primary" onClick={openAdd}>
          Add Entry
        </button>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {entries.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-muted">Add your first career milestone.</p>
          <button type="button" className="btn-primary mt-4" onClick={openAdd}>
            Add Entry
          </button>
        </div>
      ) : (
        <div className="space-y-0 border-l-2 border-border ml-3">
          {entries.map((e) => (
            <div key={e.id} className="relative block w-full pl-8 pb-8 text-left">
              <span className="absolute left-[-7px] top-1.5 h-3 w-3 rounded-full border-2 border-accent bg-background" />
              <p className="text-xs text-muted">
                {e.start_date?.slice(0, 4)}
                {e.is_current ? " – Present" : e.end_date ? ` – ${e.end_date.slice(0, 4)}` : ""}
              </p>
              <p className="font-medium">{e.job_title}</p>
              <p className="text-sm text-muted">{e.organization}</p>
              <span className="mt-1 inline-block rounded-full badge-muted px-2 py-0.5 text-[11px] text-muted">
                {e.verification_status}
              </span>
              <div className="mt-2 flex gap-2">
                <button type="button" className="text-xs text-accent" onClick={() => openEdit(e)}>
                  Edit
                </button>
                <button type="button" className="text-xs text-danger" onClick={() => remove(e)}>
                  Delete
                </button>
                <button type="button" className="text-xs text-muted" onClick={() => setSelected(e)}>
                  Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="card text-sm space-y-2">
          <p className="font-semibold">{selected.job_title}</p>
          <p className="text-muted">{selected.organization}</p>
          {selected.description && <p>{selected.description}</p>}
          <ul className="list-disc pl-5">
            {(selected.achievements || []).map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
          <button type="button" className="text-xs text-muted" onClick={() => setSelected(null)}>
            Close
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={save} className="card max-h-[90vh] w-full max-w-lg overflow-y-auto space-y-3">
            <h2 className="text-lg font-semibold">{editingId ? "Edit career entry" : "Add career entry"}</h2>
            {editingId && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                If this entry was verified, saving will clear verification until you re-submit proof.
              </p>
            )}
            <div className="relative">
              <label className="label">Job title</label>
              <input
                className="input"
                required
                value={form.job_title}
                onChange={(e) => {
                  setForm({ ...form, job_title: e.target.value });
                  searchTitles(e.target.value);
                }}
                placeholder="Start typing e.g. COO, Product Designer…"
                autoComplete="off"
              />
              {titleHints.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-background shadow-lg text-sm">
                  {titleHints.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-accent/10"
                        onClick={() => applyOcc(o)}
                      >
                        {o.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {occDetail?.tasks && (
              <p className="text-xs text-muted line-clamp-3">
                Catalog hint: {occDetail.definition?.slice(0, 160)}…
              </p>
            )}
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
                className="input min-h-[80px] py-2"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Responsibilities (one per line)</label>
              <textarea
                className="input min-h-[80px] py-2"
                value={form.responsibilities}
                onChange={(e) => setForm({ ...form, responsibilities: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Achievements (one per line)</label>
              <textarea
                className="input min-h-[80px] py-2"
                value={form.achievements}
                onChange={(e) => setForm({ ...form, achievements: e.target.value })}
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button type="submit" className="btn-primary">
                {editingId ? "Save changes" : "Add entry"}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setOpen(false);
                  setEditingId(null);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
