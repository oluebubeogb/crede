"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { getSession, login, signup } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/dashboard";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = await getSession();
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
      if (mode === "signup") {
        await signup(email.trim(), password, fullName.trim() || undefined);
      } else {
        await login(email.trim(), password);
      }
      router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="card w-full max-w-md text-center">
        <p className="text-sm text-muted">Checking session…</p>
      </div>
    );
  }

  return (
    <div className="card w-full max-w-md">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-card bg-accent text-lg font-bold text-white">
        C
      </div>
      <h1 className="mt-6 text-center text-2xl font-semibold">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h1>
      <p className="mt-2 text-center text-sm text-muted">
        {mode === "login"
          ? "Sign in to your Crede professional identity."
          : "Build your verified career timeline in minutes."}
      </p>

      <div className="mt-6 flex rounded-card border border-border p-1">
        <button
          type="button"
          className={`flex-1 rounded-card py-2 text-sm font-medium transition ${
            mode === "login" ? "bg-accent text-white" : "text-muted"
          }`}
          onClick={() => {
            setMode("login");
            setError(null);
          }}
        >
          Sign in
        </button>
        <button
          type="button"
          className={`flex-1 rounded-card py-2 text-sm font-medium transition ${
            mode === "signup" ? "bg-accent text-white" : "text-muted"
          }`}
          onClick={() => {
            setMode("signup");
            setError(null);
          }}
        >
          Sign up
        </button>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {mode === "signup" && (
          <div>
            <label className="label" htmlFor="fullName">
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              className="input"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
        )}
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
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === "signup" && (
            <p className="mt-1 text-xs text-muted">At least 8 characters</p>
          )}
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" className="text-action w-full" disabled={loading}>
          {loading
            ? mode === "signup"
              ? "Creating account…"
              : "Signing in…"
            : mode === "signup"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-muted">
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
