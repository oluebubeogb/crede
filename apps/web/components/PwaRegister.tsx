"use client";

import { useEffect, useState } from "react";
import { Share, X, Download } from "lucide-react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISS_KEY = "crede-install-dismissed";

/** Registers the service worker and shows a gentle install banner:
 *  - Android/Chrome: uses beforeinstallprompt
 *  - iOS Safari: a one-line "Share → Add to Home Screen" hint */
export function PwaRegister() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const dismissed = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (Date.now() - dismissed < 14 * 864e5) return;
    if (!/\/(feed|dashboard)/.test(location.pathname)) return;

    const ua = navigator.userAgent;
    const isIos = /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios/i.test(ua);
    if (isIos) {
      setIos(true);
      const t = setTimeout(() => setShow(true), 2500);
      return () => clearTimeout(t);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => null);
    setDeferred(null);
    setShow(false);
  }

  if (!show) return null;
  return (
    <div
      role="dialog"
      aria-label="Install Crede"
      className="animate-in fixed inset-x-3 z-[60] mx-auto max-w-md md:bottom-6"
      style={{ bottom: "calc(var(--nav-h) + env(safe-area-inset-bottom) + 12px)" }}
    >
      <div className="card flex items-center gap-3 p-3 pr-2" style={{ boxShadow: "var(--shadow-hover)" }}>
        <img src="/icons/icon-192.png" alt="" width={40} height={40} className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install Crede</p>
          {ios ? (
            <p className="text-xs text-muted">
              Tap <Share className="inline h-3.5 w-3.5 -translate-y-px" aria-label="Share" /> then{" "}
              <span className="font-medium text-foreground">Add to Home Screen</span>
            </p>
          ) : (
            <p className="text-xs text-muted">Faster, full-screen, works offline.</p>
          )}
        </div>
        {!ios && (
          <button type="button" onClick={install} className="btn btn-primary btn-sm">
            <Download className="h-3.5 w-3.5" /> Install
          </button>
        )}
        <button type="button" onClick={dismiss} aria-label="Dismiss" className="flex h-8 w-8 items-center justify-center rounded-full text-muted nav-hover">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
