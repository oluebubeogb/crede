"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { IconButton } from "@/components/ui/IconButton";
import { Pencil, Trash2 } from "lucide-react";

type Skill = {
  id: number;
  name: string;
  category: string;
  proficiency?: string;
  verified: boolean;
  acquired_at?: string | null;
};
type CatalogHit = { id: number; name: string; category?: string; description?: string };

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("technical");
  const [acquiredAt, setAcquiredAt] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [hints, setHints] = useState<CatalogHit[]>([]);

  function load() {
    api<Skill[]>("/api/skills").then(setSkills).catch(console.error);
  }

  useEffect(() => {
    load();
  }, []);

  const searchCatalog = useCallback(async (q: string) => {
    if (q.trim().length < 1) {
      setHints([]);
      return;
    }
    try {
      const rows = await api.get<CatalogHit[]>(
        `/skills/catalog/search?q=${encodeURIComponent(q)}&limit=12`
      );
      setHints(rows);
    } catch {
      setHints([]);
    }
  }, []);

  function resetForm() {
    setName("");
    setCategory("technical");
    setAcquiredAt("");
    setEditId(null);
    setHints([]);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const payload = {
      name: name.trim(),
      category,
      acquired_at: acquiredAt || null,
    };
    if (editId) {
      const sk = skills.find((s) => s.id === editId);
      if (sk?.verified) {
        const ok = confirm(
          "This skill is verified. Editing will remove verification. Continue?"
        );
        if (!ok) return;
      }
      await api.patch(`/skills/${editId}`, payload);
    } else {
      await api("/api/skills", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    resetForm();
    load();
  }

  async function remove(s: Skill) {
    const msg = s.verified
      ? "This skill is verified. Deleting removes the verified record. Continue?"
      : `Delete skill "${s.name}"?`;
    if (!confirm(msg)) return;
    await api.delete(`/skills/${s.id}`);
    load();
  }

  function formatDate(d?: string | null) {
    if (!d) return null;
    try {
      return new Date(d).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
      });
    } catch {
      return d;
    }
  }

  return (
    <div className="space-y-0">
      <section className="note-section">
        <h1 className="page-title">Skills</h1>
        <p className="mt-1.5 text-sm text-muted">
          Skills power matching and appear on generated CVs. Add a start date when you acquired each one.
        </p>
      </section>

      <section className="note-section">
        <form onSubmit={add} className="flex flex-wrap items-start gap-2">
          <div className="relative w-full max-w-xs">
            <input
              className="input w-full"
              placeholder="Add skill…"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                searchCatalog(e.target.value);
              }}
              autoComplete="off"
            />
            {hints.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto border border-border bg-background text-sm shadow-lg">
                {hints.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-border/30"
                      onClick={() => {
                        setName(h.name);
                        if (h.category) setCategory(h.category);
                        setHints([]);
                      }}
                    >
                      {h.name}
                      {h.category ? (
                        <span className="text-xs text-muted"> · {h.category}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <select
            className="input max-w-[160px]"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="technical">Technical</option>
            <option value="leadership">Leadership</option>
            <option value="industry">Industry</option>
          </select>
          <input
            type="date"
            className="input max-w-[160px]"
            value={acquiredAt}
            onChange={(e) => setAcquiredAt(e.target.value)}
            title="Start date / date acquired"
            aria-label="Start date or date acquired"
          />
          <button type="submit" className="text-action self-center">
            {editId ? "Save" : "Add Skills"}
          </button>
          {editId && (
            <button type="button" className="text-action-muted self-center" onClick={resetForm}>
              Cancel
            </button>
          )}
        </form>
      </section>

      <div>
        {skills.map((s) => (
          <div
            key={s.id}
            className="note-section flex items-center justify-between gap-3 py-4"
          >
            <div className="min-w-0">
              <p className="font-medium">{s.name}</p>
              <p className="text-xs capitalize text-muted">
                {s.category}
                {s.verified ? " · Verified" : ""}
                {formatDate(s.acquired_at) ? ` · ${formatDate(s.acquired_at)}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <IconButton
                label="Edit"
                onClick={() => {
                  setEditId(s.id);
                  setName(s.name);
                  setCategory(s.category);
                  setAcquiredAt(s.acquired_at ? s.acquired_at.slice(0, 10) : "");
                }}
              >
                <Pencil className="h-4 w-4" />
              </IconButton>
              <IconButton label="Delete" danger onClick={() => remove(s)}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          </div>
        ))}
        {skills.length === 0 && (
          <p className="py-8 text-sm text-muted">No skills yet. Add your first above.</p>
        )}
      </div>
    </div>
  );
}
