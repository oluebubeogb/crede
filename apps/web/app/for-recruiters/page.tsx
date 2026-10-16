import Link from "next/link";

export default function ForRecruitersPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-content items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-card bg-accent text-sm font-bold text-white">
            C
          </div>
          <span className="text-lg font-semibold">Crede</span>
        </Link>
        <Link href="/login" className="text-action">
          Get started
        </Link>
      </header>
      <section className="mx-auto max-w-content px-6 py-24 text-center">
        <h1 className="page-title">Find verified professionals.</h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
          Search trusted candidates based on verified career histories. Post jobs and match talent from the same
          source of truth professionals maintain.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link href="/login" className="text-action">
            Create recruiter account
          </Link>
          <Link href="/recruiter/dashboard" className="text-action-muted">
            Open recruiter portal
          </Link>
        </div>
      </section>
    </div>
  );
}
