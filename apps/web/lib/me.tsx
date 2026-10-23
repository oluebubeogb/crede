"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";

export type Claims = {
  total: number; verified: number; issuer_verified: number; document_provided: number;
  pending: number; self_reported: number; rejected: number; identity_verified: boolean; label: string; ratio: number;
};

export type Me = {
  id: number;
  email: string;
  full_name?: string | null;
  username?: string | null;
  headline?: string | null;
  location?: string | null;
  avatar_url?: string | null;
  badge_level: "none" | "gray" | "green";
  identity_verified: boolean;
  is_admin: boolean;
  verification_score: number;
  profile_completion: number;
  claims?: Claims;
  onboarding_completed?: boolean;
};

export type AppConfig = {
  payment_provider: "paystack" | "monnify" | "none";
  badge_prices: { gray: number; green: number };
  ai: boolean;
  teams_url?: string;
  max_image_mb: number;
  org_domain_auto_approve: boolean;
};

type Ctx = {
  me: Me | null;
  config: AppConfig | null;
  unread: number;
  loading: boolean;
  refresh: () => Promise<void>;
  refreshUnread: () => Promise<void>;
  setUnread: React.Dispatch<React.SetStateAction<number>>;
};

const MeCtx = createContext<Ctx>({
  me: null, config: null, unread: 0, loading: true,
  refresh: async () => {}, refreshUnread: async () => {}, setUnread: () => {},
});

export function MeProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [m, c] = await Promise.all([
        api.get<Me>("/profile/me"),
        api.get<AppConfig>("/config").catch(() => null),
      ]);
      setMe(m);
      if (c) setConfig(c);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      const r = await api.get<{ unread: number }>("/notifications/unread-count");
      setUnread(r.unread || 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
    refreshUnread();
    // Light polling; pauses when the tab is hidden
    const t = setInterval(() => {
      if (document.visibilityState === "visible") refreshUnread();
    }, 60_000);
    const onVis = () => document.visibilityState === "visible" && refreshUnread();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh, refreshUnread]);

  return (
    <MeCtx.Provider value={{ me, config, unread, loading, refresh, refreshUnread, setUnread }}>
      {children}
    </MeCtx.Provider>
  );
}

export const useMe = () => useContext(MeCtx);
