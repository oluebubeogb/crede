"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { IconButton } from "@/components/ui/IconButton";
import { Pencil, Trash2 } from "lucide-react";

type Cert = {
  id: number;
  name: string;
  issuer?: string;
  issued_at?: string | null;
  expires_at?: string | null;
  verification_status: string;
};

export default function CertificationsPage() {
  const [items, setItems] = useState<Cert[]>([]);
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [editId, setEditId] = useState<number | null>(null);

  function load() {
    api<Cert[]>("/api/certifications").then(setItems).catch(console.error);
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setName("");
    setIssuer("");
    setIssuedAt("");
    setEditId(null);
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name,
      issuer: issuer || null,
      issued_at: issuedAt || null,
    };
    if (editId) {
      const c = items.find((x) => x.id === editId);
      if ((c?.verification_status || "").toLowerCase() === "verified") {
        const ok = confirm(
          "This certification is verified. Editing will remove verification. Continue?"
        );
        if (!ok) return;
      }
      await api.patch(`/certifications/${editId}`, payload);
    } else {
      await api("/api/certifications", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    resetForm();
    load();
  }

  async function remove(c: Cert) {
    const verified = (c.verification_status || "").toLowerCase() === "verified";
    const msg = verified
      ? "This certification is verified. Deleting removes the verified record. Continue?"
      : `Delete "${c.name}"?`;
    if (!confirm(msg)) return;
    await api.delete(`/certifications/${c.id}`);
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
        <h1 className="text-2xl font-semibold tracking-tight">Certifications</h1>
        <p className="mt-1.5 text-sm text-muted">
          Credentials with issuance dates for your verified profile.
        </p>
      </section>

      <section className="note-section">
        <form onSubmit={add} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            className="input"
            placeholder="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input"
            placeholder="Issuer"
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
          />
          <input
            type="date"
            className="input"
            value={issuedAt}
            onChange={(e) => setIssuedAt(e.target.value)}
            title="Date of issuance"
            aria-label="Date of issuance"
          />
          <div className="flex items-center gap-2">
            <button type="submit" className="text-action">
              {editId ? "Save" : "Add certification"}
            </button>
            {editId && (
              <button type="button" className="text-action-muted" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <div>
        {items.map((c) => (
          <div
            key={c.id}
            className="note-section flex items-start justify-between gap-3 py-4"
          >
            <div className="min-w-0">
              <p className="font-medium">{c.name}</p>
              <p className="text-sm text-muted">{c.issuer}</p>
              {formatDate(c.issued_at) && (
                <p className="mt-1 text-xs text-muted">Issued {formatDate(c.issued_at)}</p>
              )}
              <p className="mt-2 text-xs uppercase text-muted">{c.verification_status}</p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <IconButton
                label="Edit"
                onClick={() => {
                  setEditId(c.id);
                  setName(c.name);
                  setIssuer(c.issuer || "");
                  setIssuedAt(c.issued_at ? c.issued_at.slice(0, 10) : "");
                }}
              >
                <Pencil className="h-4 w-4" />
              </IconButton>
              <IconButton label="Delete" danger onClick={() => remove(c)}>
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <p className="py-8 text-sm text-muted">No certifications yet.</p>
        )}
      </div>
    </div>
  );
}
