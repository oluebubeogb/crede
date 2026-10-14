"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Cert = {
  id: number;
  name: string;
  issuer?: string;
  issued_at?: string;
  verification_status: string;
};

export default function CertificationsPage() {
  const [items, setItems] = useState<Cert[]>([]);
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [editId, setEditId] = useState<number | null>(null);

  function load() {
    api<Cert[]>("/api/certifications").then(setItems).catch(console.error);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (editId) {
      const c = items.find((x) => x.id === editId);
      if ((c?.verification_status || "").toLowerCase() === "verified") {
        const ok = confirm(
          "This certification is verified. Editing will remove verification. Continue?"
        );
        if (!ok) return;
      }
      await api.patch(`/certifications/${editId}`, { name, issuer: issuer || null });
      setEditId(null);
    } else {
      await api("/api/certifications", {
        method: "POST",
        body: JSON.stringify({ name, issuer: issuer || null }),
      });
    }
    setName("");
    setIssuer("");
    load();
  }

  async function remove(c: Cert) {
    const verified = (c.verification_status || "").toLowerCase() === "verified";
    const msg = verified
      ? "This certification is verified. Deleting removes the verified record. Continue?"
      : `Delete “${c.name}”?`;
    if (!confirm(msg)) return;
    await api.delete(`/certifications/${c.id}`);
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Certifications</h1>
      <form onSubmit={add} className="card grid gap-3 sm:grid-cols-3">
        <input className="input" placeholder="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="Issuer" value={issuer} onChange={(e) => setIssuer(e.target.value)} />
        <div className="flex gap-2">
          <button type="submit" className="text-action">
            {editId ? "Save" : "Add certification"}
          </button>
          {editId && (
            <button type="button" className="text-action-muted" onClick={() => { setEditId(null); setName(""); setIssuer(""); }}>
              Cancel
            </button>
          )}
        </div>
      </form>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((c) => (
          <div key={c.id} className="card">
            <p className="font-medium">{c.name}</p>
            <p className="text-sm text-muted">{c.issuer}</p>
            <p className="mt-2 text-xs uppercase text-muted">{c.verification_status}</p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="text-xs text-accent"
                onClick={() => {
                  setEditId(c.id);
                  setName(c.name);
                  setIssuer(c.issuer || "");
                }}
              >
                Edit
              </button>
              <button type="button" className="text-xs text-danger" onClick={() => remove(c)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
