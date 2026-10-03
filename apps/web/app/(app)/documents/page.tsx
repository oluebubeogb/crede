"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Doc = {
  id: number;
  title: string;
  doc_type: string;
  template: string;
  created_at: string;
};

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);

  useEffect(() => {
    api<Doc[]>("/api/documents").then(setDocs).catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Documents</h1>
        <Link href="/generate" className="btn-primary">
          Generate CV
        </Link>
      </div>
      {docs.length === 0 ? (
        <div className="card py-16 text-center text-muted">Generate your first tailored CV.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {docs.map((d) => (
            <div key={d.id} className="card">
              <p className="font-medium">{d.title}</p>
              <p className="text-sm text-muted capitalize">
                {d.doc_type} · {d.template}
              </p>
              <p className="mt-2 text-xs text-muted">{new Date(d.created_at).toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
