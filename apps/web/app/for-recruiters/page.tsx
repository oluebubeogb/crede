import Link from "next/link";

export default function ForRecruitersPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-content items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-btn bg-accent text-sm font-bold text-white">
            C
          </div>
          <span className="text-lg font-semibold">Crede</span>
        </Link>
        <Link href="/login" className="btn-primary text-sm">
          Request Access
        </Link>
      </header>
      <section className="mx-auto max-w-content px-6 py-24 text-center">
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">Find verified professionals.</h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
          Search trusted candidates based on verified career histories.
        </p>
        <Link href="/login" className="btn-primary mt-10 inline-flex">
          Request Access
        </Link>
        <p className="mt-8 text-sm text-muted">Recruiter dashboard ships in Phase 2.</p>
      </section>
    </div>
  );
}
