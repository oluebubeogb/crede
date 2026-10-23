import Link from "next/link";
import { ArrowRight, Building2, ListChecks, Search, ShieldCheck } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/PublicHeader";
import { SoftIcon } from "@/components/ui/soft-icon";

const POINTS = [
  { icon: ShieldCheck, tint: "emerald", title: "Claims you can trust", body: "Roles, degrees and certificates confirmed by the organisations themselves." },
  { icon: ListChecks, tint: "blue", title: "Requirement-level matching", body: "See exactly which must-haves each candidate meets, with the evidence behind it." },
  { icon: Search, tint: "sky", title: "Search verified talent", body: "Filter by skills, location and verification — no more guessing from PDFs." },
  { icon: Building2, tint: "violet", title: "Your organisation page", body: "Claim it with your official email domain, verify staff and post openings." },
] as const;

export default function ForRecruitersPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <section className="mx-auto max-w-content px-5 py-16 text-center md:py-24">
        <p className="eyebrow">For recruiters & organisations</p>
        <h1 className="mx-auto mt-3 max-w-2xl text-4xl font-semibold tracking-tight md:text-5xl">Hire from verified career records.</h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted">Post a role and Crede ranks candidates against every requirement — using histories confirmed by employers, schools and issuers.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/login?mode=signup&next=/recruiter/dashboard" className="btn btn-primary">Create recruiter account<ArrowRight className="h-4 w-4" /></Link>
          <Link href="/recruiter/dashboard" className="btn btn-soft">Open recruiter portal</Link>
        </div>
      </section>
      <section className="mx-auto grid grid-cols-1 max-w-content gap-4 px-5 pb-20 sm:grid-cols-2">
        {POINTS.map((p) => (
          <div key={p.title} className="card card-hover flex gap-4 p-5">
            <SoftIcon icon={p.icon} tint={p.tint} />
            <div><p className="font-semibold">{p.title}</p><p className="mt-1 text-sm text-muted">{p.body}</p></div>
          </div>
        ))}
      </section>
      <PublicFooter />
    </div>
  );
}
