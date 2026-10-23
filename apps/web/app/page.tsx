import Link from "next/link";
import { ArrowRight, BadgeCheck, BriefcaseBusiness, Building2, FileText, GraduationCap, LineChart, ShieldCheck, Sparkles, Users } from "lucide-react";
import { PublicFooter, PublicHeader } from "@/components/PublicHeader";
import { SoftIcon } from "@/components/ui/soft-icon";

const FEATURES = [
  { icon: BriefcaseBusiness, tint: "blue", title: "One timeline", body: "Add roles, NYSC, schools and certifications once. Everything else is built from it." },
  { icon: ShieldCheck, tint: "emerald", title: "Verified by the source", body: "Employers, schools and issuers confirm your claims from their official domain." },
  { icon: LineChart, tint: "sky", title: "Honest match scores", body: "Paste a job and see each requirement — met, partial or missing — with the evidence." },
  { icon: FileText, tint: "violet", title: "CVs that pass ATS", body: "Tailored CVs and cover letters in six clean templates. PDF or Word, one click." },
  { icon: Users, tint: "amber", title: "A professional community", body: "Share wins, ask questions and follow people and organisations in your field." },
  { icon: Building2, tint: "rose", title: "Built for organisations", body: "Claim your company or school page, verify alumni and staff, and post openings." },
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <section className="mx-auto max-w-content px-5 pb-16 pt-16 md:pt-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="pill pill-blue"><Sparkles className="h-3.5 w-3.5" />Now piloting in Nigeria</span>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-6xl">Your career, <span className="text-accent">verified.</span></h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">Keep one trusted career record. Crede turns it into tailored CVs, honest job matches and a badge employers can rely on.</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login?mode=signup" className="btn btn-primary">Create your profile<ArrowRight className="h-4 w-4" /></Link>
            <Link href="/for-recruiters" className="btn btn-soft">I&apos;m hiring</Link>
          </div>
        </div>
        <div className="mx-auto mt-14 max-w-3xl">
          <div className="card p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/10 text-base font-semibold text-accent">AO</div>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 font-semibold">Amaka Okafor<BadgeCheck className="h-4 w-4 text-success" /></p>
                <p className="text-sm text-muted">Financial Analyst · ICAN · Lagos</p>
              </div>
              <div className="text-right"><p className="text-2xl font-semibold tabular text-success">86%</p><p className="text-xs text-muted">match</p></div>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[["B.Sc. Accounting · UNILAG", GraduationCap, "Verified by school"], ["Analyst · Access Bank", BriefcaseBusiness, "Verified by employer"], ["ICAN Associate", BadgeCheck, "Verified by issuer"]].map(([t, I, s]) => {
                const Icon = I as typeof GraduationCap;
                return <div key={t as string} className="rounded-2xl bg-surface-2 p-3"><Icon className="h-4 w-4 text-success" /><p className="mt-2 text-sm font-medium">{t as string}</p><p className="text-xs text-muted">{s as string}</p></div>;
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="border-t border-border bg-surface-2/40">
        <div className="mx-auto max-w-content px-5 py-16 md:py-20">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-2 max-w-lg text-3xl font-semibold tracking-tight">Build once. Prove it. Apply with confidence.</h2>
          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card card-hover p-5">
                <SoftIcon icon={f.icon} tint={f.tint} />
                <p className="mt-4 font-semibold">{f.title}</p>
                <p className="mt-1 text-sm text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="badges" className="mx-auto max-w-content px-5 py-16 md:py-20">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:items-center">
          <div>
            <p className="eyebrow">Badges</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Free to build. A badge when you&apos;re ready.</h2>
            <p className="mt-3 text-muted">Your profile, timeline, CVs and match scores are free. Badges are a small one-time fee in naira, reviewed by our team.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="card p-5"><BadgeCheck className="h-6 w-6 text-muted" /><p className="mt-3 font-semibold">Gray badge</p><p className="mt-1 text-sm text-muted">Identity confirmed. Shows you&apos;re a real, reachable professional.</p></div>
            <div className="card p-5"><BadgeCheck className="h-6 w-6 text-success" /><p className="mt-3 font-semibold">Green badge</p><p className="mt-1 text-sm text-muted">Identity plus at least one claim verified by an employer, school or issuer.</p></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-content px-5 pb-20">
        <div className="card flex flex-col items-start gap-4 bg-accent/5 p-8 md:flex-row md:items-center">
          <div className="flex-1"><p className="text-xl font-semibold">Start your verified profile today.</p><p className="mt-1 text-sm text-muted">It takes about five minutes.</p></div>
          <Link href="/login?mode=signup" className="btn btn-primary">Get started<ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
