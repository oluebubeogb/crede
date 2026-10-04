"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { getAccountsSession, loginWithCollab } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Already logged in on Collab suite? Skip the form.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await getAccountsSession();
      if (cancelled) return;
      if (user) {
        router.replace(next);
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, next]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginWithCollab(email.trim(), password);
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="card w-full max-w-md text-center">
        <p className="text-sm text-muted">Checking Collab session…</p>
      </div>
    );
  }

  return (
    <div className="card w-full max-w-md">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-btn bg-accent text-lg font-bold text-white">
        C
      </div>
      <h1 className="mt-6 text-center text-2xl font-semibold">Welcome back</h1>
      <p className="mt-2 text-center text-sm text-muted">
        Sign in with your Collab Account — same login as Editor, Project, Teams & Meet.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="input"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            className="input"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "Signing in…" : "Continue with Collab Account"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
        No separate Crede signup.{" "}
        <Link href="/" className="text-accent hover:underline">
          Back to home
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Suspense
        fallback={
          <div className="card w-full max-w-md text-center text-sm text-muted">Loading…</div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
