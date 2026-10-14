"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { TextAction } from "@/components/ui/TextAction";
import { CircleCheckbox } from "@/components/ui/CircleCheckbox";
import { InlineFormActions } from "@/components/ui/InlineFormActions";

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

const employmentTypes = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "freelance", label: "Freelance" },
  { value: "internship", label: "Internship" },
];

export default function TimelinePage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [titleHints, setTitleHints] = useState<Occ[]>([]);
  const [occDetail, setOccDetail] = useState<Occ | null>(null);
  const [saving, setSaving] = useState(false);

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
    setTitleHints([]);
    setOpen(true);
  }

  function openEdit(e: Entry) {
    if ((e.verification_status || "").toLowerCase() === "verified") {
      const ok = window.confirm(
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
      start_date: e.start_date || "",
      end_date: e.end_date || "",
      is_current: !!e.is_current,
      description: e.description || "",
      achievements: (e.achievements || []).join("\n"),
      responsibilities: (e.responsibilities || []).join("\n"),
      team_size: e.team_size != null ? String(e.team_size) : "",
      budget_managed: e.budget_managed || "",
    });
    setOccDetail(null);
    setTitleHints([]);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      job_title: form.job_title,
      organization: form.organization,
      industry: form.industry || undefined,
      employment_type: form.employment_type,
      start_date: form.start_date,
      end_date: form.is_current ? null : form.end_date || null,
      is_current: form.is_current,
      description: form.description || undefined,
      achievements: form.achievements
        ? form.achievements.split("\n").map((s) => s.trim()).filter(Boolean)
        : [],
      responsibilities: form.responsibilities
        ? form.responsibilities.split("\n").map((s) => s.trim()).filter(Boolean)
        : [],
      team_size: form.team_size ? Number(form.team_size) : undefined,
      budget_managed: form.budget_managed || undefined,
    };
    try {
      if (editingId) {
        await api.put(`/api/timeline/${editingId}`, payload);
      } else {
        await api.post("/api/timeline", payload);
      }
      setOpen(false);
      setEditingId(null);
      load();
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Delete this timeline entry? This cannot be undone.")) return;
    try {
      await api.delete(`/api/timeline/${id}`);
      load();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function statusLabel(s: string) {
    const v = (s || "unverified").toLowerCase();
    if (v === "verified") return { text: "Verified", circle: "●", color: "text-success" };
    if (v === "pending") return { text: "Pending review", circle: "○", color: "text-warning" };
    return { text: "Unverified", circle: "○", color: "text-muted" };
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Career Timeline</h1>
          <p className="mt-1 text-sm text-muted">
            Your verified career history is the source of truth for CVs, matching, and trust.
          </p>
        </div>
        {!open && (
          <TextAction variant="primary" onClick={openAdd}>
            Add new entry
          </TextAction>
        )}
      </header>

      {error && (
        <div className="rounded-card border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!open && entries.length === 0 && (
        <div className="card flex flex-col items-start gap-3">
          <p className="text-sm text-muted">
            Your career timeline is empty. Add your first role to start building a verifiable professional record.
          </p>
          <TextAction variant="primary" onClick={openAdd}>
            Add your first role
          </TextAction>
        </div>
      )}

      {/* Entry cards */}
      <div className="space-y-3">
        {entries.map((entry) => {
          const st = statusLabel(entry.verification_status);
          const isExpanded = expandedId === entry.id;
          return (
            <article key={entry.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-medium text-foreground">{entry.job_title}</h2>
                  <p className="mt-0.5 text-sm text-muted">
                    {entry.organization}
                    {entry.industry ? ` · ${entry.industry}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {entry.start_date}
                    {" → "}
                    {entry.is_current ? "Present" : entry.end_date || "—"}
                    {entry.employment_type ? ` · ${entry.employment_type.replace("_", " ")}` : ""}
                  </p>
                </div>
                <div className={`flex items-center gap-1.5 text-sm ${st.color}`}>
                  <span aria-hidden>{st.circle}</span>
                  <span>{st.text}</span>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-4 space-y-3 border-t border-border pt-4 text-sm">
                  {entry.description && <p className="text-foreground">{entry.description}</p>}
                  {entry.responsibilities && entry.responsibilities.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">Responsibilities</p>
                      <ul className="list-inside list-disc space-y-0.5 text-foreground">
                        {entry.responsibilities.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {entry.achievements && entry.achievements.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">Achievements</p>
                      <ul className="list-inside list-disc space-y-0.5 text-foreground">
                        {entry.achievements.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <TextAction
                  variant="muted"
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                >
                  {isExpanded ? "Hide details" : "Show details"}
                </TextAction>
                <span className="text-muted">·</span>
                <TextAction variant="secondary" onClick={() => openEdit(entry)}>
                  Edit
                </TextAction>
                <span className="text-muted">·</span>
                <TextAction href="/verification" variant="primary">
                  Request verification
                </TextAction>
                <span className="text-muted">·</span>
                <TextAction variant="danger" onClick={() => handleDelete(entry.id)}>
                  Delete
                </TextAction>
              </div>
            </article>
          );
        })}
      </div>

      {/* Add / Edit form */}
      {open && (
        <div className="card">
          <h2 className="text-lg font-medium">
            {editingId ? "Edit timeline entry" : "Add timeline entry"}
          </h2>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="label">Job title</label>
              <input
                className="input"
                required
                value={form.job_title}
                onChange={(e) => {
                  setForm({ ...form, job_title: e.target.value });
                  searchTitles(e.target.value);
                }}
                placeholder="e.g. Product Manager"
              />
              {titleHints.length > 0 && (
                <div className="mt-2 space-y-1 rounded-card border border-border bg-background p-2">
                  {titleHints.map((h) => (
                    <TextAction
                      key={h.id}
                      variant="secondary"
                      className="block w-full px-2 py-1.5 text-left no-underline hover:bg-surface"
                      onClick={() => {
                        setForm({ ...form, job_title: h.title });
                        setOccDetail(h);
                        setTitleHints([]);
                      }}
                    >
                      {h.title}
                    </TextAction>
                  ))}
                </div>
              )}
              {occDetail?.definition && (
                <p className="mt-2 text-xs text-muted">{occDetail.definition}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Organization</label>
                <input
                  className="input"
                  required
                  value={form.organization}
                  onChange={(e) => setForm({ ...form, organization: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Industry</label>
                <input
                  className="input"
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                />
              </div>
            </div>

            <div>
              <p className="label">Employment type</p>
              <div className="mt-1 flex flex-wrap gap-4">
                {employmentTypes.map((t) => (
                  <CircleCheckbox
                    key={t.value}
                    checked={form.employment_type === t.value}
                    onChange={() => setForm({ ...form, employment_type: t.value })}
                    label={t.label}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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

            <CircleCheckbox
              checked={form.is_current}
              onChange={(v) => setForm({ ...form, is_current: v, end_date: v ? "" : form.end_date })}
              label="Currently working here"
            />

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

            <InlineFormActions
              saveType="submit"
              saveLabel={editingId ? "Save changes" : "Add entry"}
              saveDisabled={saving}
              onCancel={() => {
                setOpen(false);
                setEditingId(null);
              }}
            />
          </form>
        </div>
      )}
    </div>
  );
}
