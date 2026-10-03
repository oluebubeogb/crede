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

  function load() {
    api<Cert[]>("/api/certifications").then(setItems).catch(console.error);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await api("/api/certifications", {
      method: "POST",
      body: JSON.stringify({ name, issuer: issuer || null }),
    });
    setName("");
    setIssuer("");
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Certifications</h1>
      <form onSubmit={add} className="card grid gap-3 sm:grid-cols-3">
        <input className="input" placeholder="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="Issuer" value={issuer} onChange={(e) => setIssuer(e.target.value)} />
        <button type="submit" className="btn-primary">
          Add certification
        </button>
      </form>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((c) => (
          <div key={c.id} className="card">
            <p className="font-medium">{c.name}</p>
            <p className="text-sm text-muted">{c.issuer}</p>
            <p className="mt-2 text-xs uppercase text-muted">{c.verification_status}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
