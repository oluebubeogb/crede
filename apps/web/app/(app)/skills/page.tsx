"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Skill = { id: number; name: string; category: string; proficiency?: string; verified: boolean };

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("technical");
  const [editId, setEditId] = useState<number | null>(null);

  function load() {
    api<Skill[]>("/api/skills").then(setSkills).catch(console.error);
  }

  useEffect(() => {
    load();
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
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input
          className="input max-w-xs"
          placeholder="Add skill…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select className="input max-w-[160px]" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="technical">Technical</option>
          <option value="leadership">Leadership</option>
          <option value="industry">Industry</option>
        </select>
        <button type="submit" className="btn-primary">
          {editId ? "Save" : "Add"}
        </button>
        {editId && (
          <button type="button" className="btn-secondary" onClick={() => { setEditId(null); setName(""); }}>
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
