import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-content items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-btn bg-accent text-sm font-bold text-white">
            C
          </div>
          <span className="text-lg font-semibold">Crede</span>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-muted md:flex">
          <a href="#features" className="hover:text-foreground">
            Features
          </a>
          <Link href="/for-recruiters" className="hover:text-foreground">
            For Recruiters
          </Link>
          <a href="#pricing" className="hover:text-foreground">
            Pricing
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn-secondary text-sm">
            Login
          </Link>
          <Link href="/login" className="btn-primary text-sm">
            Get Started
          </Link>
        </div>
      </header>

      <section className="mx-auto grid max-w-content gap-12 px-6 py-20 md:grid-cols-2 md:items-center">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
            Build your verified professional identity.
          </h1>
          <p className="mt-5 max-w-lg text-lg text-muted">
            Maintain your career timeline once. Generate recruiter-ready CVs forever.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/login" className="btn-primary">
              Get Started
            </Link>
            <Link href="/login" className="btn-secondary">
              View Demo
            </Link>
          </div>
        </div>
        <div className="card relative overflow-hidden">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">Career Timeline</p>
          <div className="mt-6 space-y-6 border-l-2 border-accent pl-5">
            {[
              { year: "2024", role: "Director of Pharmacy", org: "ABC Hospital Group" },
              { year: "2020", role: "Senior Pharmacist", org: "City Medical Center" },
              { year: "2016", role: "Clinical Pharmacist", org: "Regional Health" },
            ].map((e) => (
              <div key={e.year} className="relative">
                <span className="absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full bg-accent" />
                <p className="text-xs text-muted">{e.year}</p>
                <p className="font-medium">{e.role}</p>
                <p className="text-sm text-muted">{e.org}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-border bg-surface py-16">
        <div className="mx-auto grid max-w-content gap-6 px-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { t: "Career Timeline", d: "One source of truth for every role, achievement, and project." },
            { t: "Verification", d: "Email, phone, certifications, employment — scored and public." },
            { t: "CV Generation", d: "Paste a job description. Get a tailored ATS-ready CV." },
            { t: "Talent Discovery", d: "Be found by verified organizations (Phase 2)." },
            { t: "Recruiter Search", d: "Trusted candidates ranked by verified history." },
            { t: "Opportunity Feed", d: "Relevant roles matched to your timeline." },
          ].map((f) => (
            <div key={f.t} className="card">
              <h3 className="font-semibold">{f.t}</h3>
              <p className="mt-2 text-sm text-muted">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="py-16">
        <div className="mx-auto max-w-content px-6 text-center">
          <h2 className="text-3xl font-semibold">Simple pricing</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { name: "Free", price: "₦0", items: ["Career Timeline", "Basic Profile", "Limited downloads"] },
              {
                name: "Professional",
                price: "Coming soon",
                items: ["Unlimited CV generation", "Premium templates", "Priority verification"],
              },
              {
                name: "Enterprise",
                price: "Contact",
                items: ["Organization verification", "API access", "Talent intelligence"],
              },
            ].map((p) => (
              <div key={p.name} className="card text-left">
                <h3 className="font-semibold">{p.name}</h3>
                <p className="mt-2 text-2xl font-semibold text-accent">{p.price}</p>
                <ul className="mt-4 space-y-2 text-sm text-muted">
                  {p.items.map((i) => (
                    <li key={i}>· {i}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10 text-center text-sm text-muted">
        <div className="mx-auto flex max-w-content flex-wrap justify-center gap-6 px-6">
          <a href="#">About</a>
          <a href="#">Terms</a>
          <a href="#">Privacy</a>
          <a href="#">Contact</a>
        </div>
        <p className="mt-6">© {new Date().getFullYear()} Crede · Collab</p>
      </footer>
    </div>
  );
}
