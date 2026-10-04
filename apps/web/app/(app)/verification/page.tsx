"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Item = { id: number; kind: string; status: string; points: number };

export default function VerificationPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [score, setScore] = useState(0);

  function load() {
    api<Item[]>("/api/verification").then((list) => {
      setItems(list);
      setScore(list.filter((i) => i.status === "approved").reduce((a, i) => a + i.points, 0));
    }).catch(console.error);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(kind: string) {
    const fd = new FormData();
    await fetch(`/backend/api/verification/${kind}/submit`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    load();
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Verification</h1>
        <p className="text-sm text-muted">Trust center — increase credibility with verified credentials</p>
      </div>
      <div className="card flex flex-col items-center py-10">
        <div className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-accent text-3xl font-semibold">
          {Math.min(100, score)}
        </div>
        <p className="mt-3 text-sm text-muted">Verification score / 100</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <div key={i.id} className="card">
            <p className="font-medium capitalize">{i.kind}</p>
            <p className="mt-1 text-sm text-muted capitalize">{i.status}</p>
            {i.status === "pending" && (
              <button type="button" className="btn-secondary mt-4 text-sm" onClick={() => submit(i.kind)}>
                Submit
              </button>
            )}
          </div>
        ))}
      </div>
      {items.length === 0 && (
        <p className="text-center text-muted">Increase trust by verifying your credentials.</p>
      )}
    </div>
  );
}
