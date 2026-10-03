"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Skill = { id: number; name: string; category: string; proficiency?: string; verified: boolean };

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("technical");

  function load() {
    api<Skill[]>("/api/skills").then(setSkills).catch(console.error);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    await api("/api/skills", {
      method: "POST",
      body: JSON.stringify({ name: name.trim(), category }),
    });
    setName("");
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
          Add
        </button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((s) => (
          <div key={s.id} className="card flex items-center justify-between">
            <div>
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-muted capitalize">
                {s.category}
                {s.verified ? " · Verified" : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
