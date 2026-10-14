"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

type Skill = { id: number; name: string; category: string; proficiency?: string; verified: boolean };
type CatalogHit = { id: number; name: string; category?: string; description?: string };

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("technical");
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

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (editId) {
      const sk = skills.find((s) => s.id === editId);
      if (sk?.verified) {
        const ok = confirm(
          "This skill is verified. Editing will remove verification. Continue?"
        );
        if (!ok) return;
      }
      await api.patch(`/skills/${editId}`, { name: name.trim(), category });
      setEditId(null);
    } else {
      await api("/api/skills", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), category }),
      });
    }
    setName("");
    setHints([]);
    load();
  }

  async function remove(s: Skill) {
    const msg = s.verified
      ? "This skill is verified. Deleting removes the verified record. Continue?"
      : `Delete skill “${s.name}”?`;
    if (!confirm(msg)) return;
    await api.delete(`/skills/${s.id}`);
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Skills</h1>
      <form onSubmit={add} className="flex flex-wrap gap-2 items-start">
        <div className="relative max-w-xs w-full">
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
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-background shadow-lg text-sm">
              {hints.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-surface"
                    onClick={() => {
                      setName(h.name);
                      if (h.category) setCategory(h.category);
                      setHints([]);
                    }}
                  >
                    {h.name}
                    {h.category ? (
                      <span className="text-muted text-xs"> · {h.category}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <select className="input max-w-[160px]" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="technical">Technical</option>
          <option value="leadership">Leadership</option>
          <option value="industry">Industry</option>
        </select>
        <button type="submit" className="text-action">
          {editId ? "Save" : "Add"}
        </button>
        {editId && (
          <button
            type="button"
            className="text-action-muted"
            onClick={() => {
              setEditId(null);
              setName("");
            }}
          >
            Cancel
          </button>
        )}
      </form>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((s) => (
          <div key={s.id} className="card flex items-center justify-between gap-2">
            <div>
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-muted capitalize">
                {s.category}
                {s.verified ? " · Verified" : ""}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                className="text-xs text-accent"
                onClick={() => {
                  setEditId(s.id);
                  setName(s.name);
                  setCategory(s.category);
                }}
              >
                Edit
              </button>
              <button type="button" className="text-xs text-danger" onClick={() => remove(s)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
