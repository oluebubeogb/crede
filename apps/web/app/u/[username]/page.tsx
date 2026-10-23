"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Award, BriefcaseBusiness, CheckCircle2, GraduationCap, MapPin, UserX } from "lucide-react";
import { useApi } from "@/lib/hooks";
import { fmtMonth } from "@/lib/utils";
import { PublicHeader } from "@/components/PublicHeader";
import { Avatar, EmptyState, Skeleton, SoftIcon, VerifiedBadge } from "@/components/ui/kit";

type T = { id: number; job_title: string; organization: string; start_date?: string | null; end_date?: string | null; is_current: boolean; entry_type?: string; field_of_study?: string | null; verification_status?: string | null };
type P = {
  full_name?: string; username: string; headline?: string; location?: string; summary?: string; avatar_url?: string | null; badge_level?: string | null;
  claims?: { label?: string }; timeline_entries: T[]; skills: { id: number; name: string }[]; certifications: { id: number; name: string; issuer?: string | null; issued_at?: string | null; verification_status?: string | null }[];
};
const ok = (s?: string | null) => s === "verified" || s === "approved";
const Tick = ({ s }: { s?: string | null }) => (ok(s) ? <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3.5 w-3.5" />Verified</span> : null);

export default function PublicProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { data: p, error, loading } = useApi<P>(`/profile/public/${username}`, [username]);
  const tl = [...(p?.timeline_entries || [])].sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""));
  const work = tl.filter((e) => e.entry_type !== "education");
  const edu = tl.filter((e) => e.entry_type === "education");

  return (
    <div className="min-h-screen bg-surface-2/40">
      <PublicHeader links={false} />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
        {error ? <EmptyState icon={UserX} title="Profile not found" body="This profile doesn't exist or isn't public." action={<Link href="/" className="link text-sm">Go to Crede</Link>} /> :
          loading || !p ? <div className="space-y-4"><Skeleton className="h-40 rounded-3xl" /><Skeleton className="h-64 rounded-3xl" /></div> : (
          <div className="space-y-4">
            <section className="card p-6">
              <div className="flex items-start gap-4">
                <Avatar name={p.full_name} src={p.avatar_url} size={72} />
                <div className="min-w-0 flex-1">
                  <h1 className="flex items-center gap-1.5 text-2xl font-semibold tracking-tight">{p.full_name || p.username}<VerifiedBadge level={p.badge_level} size={20} /></h1>
                  {p.headline && <p className="text-muted">{p.headline}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                    {p.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{p.location}</span>}
                    {p.claims?.label && <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3.5 w-3.5" />{p.claims.label}</span>}
                  </div>
                </div>
              </div>
              {p.summary && <p className="mt-5 text-sm leading-relaxed">{p.summary}</p>}
            </section>
            {[["Experience", work, BriefcaseBusiness, "blue"], ["Education", edu, GraduationCap, "violet"]].map(([label, items, icon, tint]) => (items as T[]).length > 0 && (
              <section key={label as string} className="card p-6">
                <p className="eyebrow mb-4">{label as string}</p>
                <ul className="space-y-4">
                  {(items as T[]).map((e) => (
                    <li key={e.id} className="flex gap-3">
                      <SoftIcon icon={icon as typeof GraduationCap} tint={tint as "blue"} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{e.job_title}{e.field_of_study ? `, ${e.field_of_study}` : ""}</p>
                        <p className="text-sm text-muted">{e.organization}</p>
                        <p className="flex flex-wrap items-center gap-2 text-xs text-muted"><span className="tabular">{fmtMonth(e.start_date)} – {e.is_current ? "Present" : fmtMonth(e.end_date)}</span><Tick s={e.verification_status} /></p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            {(p.certifications.length > 0 || p.skills.length > 0) && (
              <section className="card p-6">
                {p.certifications.length > 0 && <>
                  <p className="eyebrow mb-3">Certifications</p>
                  <ul className="mb-6 space-y-3">{p.certifications.map((c) => (
                    <li key={c.id} className="flex gap-3"><SoftIcon icon={Award} tint="amber" size="sm" /><div><p className="font-medium">{c.name}</p><p className="flex flex-wrap items-center gap-2 text-xs text-muted">{[c.issuer, c.issued_at && fmtMonth(c.issued_at)].filter(Boolean).join(" · ")}<Tick s={c.verification_status} /></p></div></li>
                  ))}</ul>
                </>}
                {p.skills.length > 0 && <><p className="eyebrow mb-3">Skills</p><div className="flex flex-wrap gap-1.5">{p.skills.map((s) => <span key={s.id} className="chip">{s.name}</span>)}</div></>}
              </section>
            )}
            <p className="pt-2 text-center text-xs text-muted">Verified career record on <Link href="/" className="link">Crede</Link></p>
          </div>
        )}
      </main>
    </div>
  );
}
