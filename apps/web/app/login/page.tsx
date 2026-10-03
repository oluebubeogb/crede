"use client";

import Link from "next/link";
import { accountsLoginUrl } from "@/lib/api";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="card w-full max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-btn bg-accent text-lg font-bold text-white">
          C
        </div>
        <h1 className="mt-6 text-2xl font-semibold">Welcome back</h1>
        <p className="mt-2 text-sm text-muted">Continue with your Collab Account. No separate signup.</p>
        <a href={accountsLoginUrl("/dashboard")} className="btn-primary mt-8 w-full">
          Continue with Collab Account
        </a>
        <p className="mt-6 text-xs text-muted">
          By continuing you agree to the Terms.{" "}
          <Link href="/" className="text-accent hover:underline">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
