"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Lock, LogOut, User, Eye, BadgeCheck, Plug, ExternalLink, Loader2 } from "lucide-react";
import { api, getSession, logout, type CredeUser } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useMe } from "@/lib/me";
import { PageHeader, SoftIcon, Switch, VerifiedBadge, toast, type Tint } from "@/components/ui/kit";

type Privacy = { is_public: boolean; show_email_on_profile: boolean; show_phone_on_profile: boolean; recruiter_contact: boolean; job_match_alerts: boolean };
const PRIV0: Privacy = { is_public: true, show_email_on_profile: false, show_phone_on_profile: false, recruiter_contact: true, job_match_alerts: true };

const EMAIL_LABELS: Record<string, [string, string]> = {
  email_verification: ["Verification", "Claim decisions, verification requests and ID checks"],
  email_orgs: ["Organisations", "Claim codes, approvals and team invites"],
  email_community: ["Community", "Replies, mentions and comments on your posts"],
  email_badges: ["Badges & payments", "Receipts and badge decisions"],
  email_product: ["Product news", "Occasional updates about new features"],
};

function Section({ id, icon, tint, title, lead, children }: { id: string; icon: typeof Bell; tint: Tint; title: string; lead?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-20 p-5">
      <div className="mb-4 flex items-start gap-3">
        <SoftIcon icon={icon} tint={tint} size="sm" />
        <div><h2 className="font-semibold">{title}</h2>{lead && <p className="text-sm text-muted">{lead}</p>}</div>
      </div>
      {children}
    </section>
  );
}

function Row({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0"><p className="text-sm">{title}</p>{sub && <p className="text-xs text-muted">{sub}</p>}</div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { me } = useMe();
  const [user, setUser] = useState<CredeUser | null>(null);
  const [priv, setPriv] = useState<Privacy>(PRIV0);
  const [username, setUsername] = useState("");
  const email = useApi<{ email: Record<string, boolean>; keys: string[] }>("/notifications/preferences");
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    getSession().then(setUser).catch(() => setUser(null));
    api.get<{ preferences?: Record<string, unknown>; username?: string; is_public?: boolean }>("/profile/me").then((p) => {
      const pr = p.preferences || {};
      setPriv({ ...PRIV0, ...(pr as Partial<Privacy>), ...(typeof p.is_public === "boolean" ? { is_public: p.is_public } : {}) });
      if (p.username) setUsername(p.username);
    }).catch(() => {});
  }, []);

  async function setEmail(key: string, v: boolean) {
    if (!email.data) return;
    const next = { ...email.data.email, [key]: v };
    email.setData({ ...email.data, email: next });
    setSavingKey(key);
    try { await api.put("/notifications/preferences", { email: next }); }
    catch (e) { toast(e instanceof Error ? e.message : "Couldn't save", "error"); email.reload(); }
    finally { setSavingKey(null); }
  }

  async function setPrivacy(key: keyof Privacy, v: boolean) {
    const next = { ...priv, [key]: v };
    setPriv(next);
    try {
      await api.patch("/profile/me", { preferences: next, is_public: next.is_public });
    } catch (e) { toast(e instanceof Error ? e.message : "Couldn't save", "error"); setPriv(priv); }
  }

  const accountsUrl = process.env.NEXT_PUBLIC_ACCOUNTS_URL || "https://accounts.collab.name.ng";
  const collab = user?.source === "collab";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Settings" lead="Your account, emails and privacy." />

      <Section id="account" icon={User} tint="blue" title="Account">
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          {[["Email", user?.email], ["Name", user?.display_name], ["Sign-in", collab ? "Collab Accounts" : "Crede account"], ["Role", user?.role || "professional"]].map(([k, v]) => (
            <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-medium">{v || "—"}</dd></div>
          ))}
        </dl>
        {collab && <p className="mt-3 text-sm text-muted">Password and email are managed in <a href={accountsUrl} target="_blank" rel="noreferrer" className="link">Collab Accounts</a>.</p>}
      </Section>

      <Section id="notifications" icon={Bell} tint="rose" title="Email notifications" lead="In-app notifications always arrive in your bell. Choose what also comes by email.">
        <div className="divide-y divide-border">
          {(email.data?.keys || Object.keys(EMAIL_LABELS)).map((k) => (
            <Row key={k} title={EMAIL_LABELS[k]?.[0] || k} sub={EMAIL_LABELS[k]?.[1]}>
              <span className="flex items-center gap-2">
                {savingKey === k && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />}
                <Switch label={EMAIL_LABELS[k]?.[0]} checked={!!email.data?.email[k]} disabled={!email.data} onChange={(v) => setEmail(k, v)} />
              </span>
            </Row>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Security and sign-in emails are always sent.</p>
      </Section>

      <Section id="privacy" icon={Eye} tint="violet" title="Privacy" lead="Control what others see on your public profile and share cards.">
        <div className="divide-y divide-border">
          <Row title="Public profile" sub={username ? `crede.africa/u/${username}` : "Visible to anyone with the link"}><Switch checked={priv.is_public} onChange={(v) => setPrivacy("is_public", v)} label="Public profile" /></Row>
          <Row title="Show email on profile"><Switch checked={priv.show_email_on_profile} onChange={(v) => setPrivacy("show_email_on_profile", v)} label="Show email" /></Row>
          <Row title="Show phone on profile"><Switch checked={priv.show_phone_on_profile} onChange={(v) => setPrivacy("show_phone_on_profile", v)} label="Show phone" /></Row>
          <Row title="Recruiters can contact me"><Switch checked={priv.recruiter_contact} onChange={(v) => setPrivacy("recruiter_contact", v)} label="Recruiter contact" /></Row>
          <Row title="Job match alerts" sub="Tell me when a strong match is posted"><Switch checked={priv.job_match_alerts} onChange={(v) => setPrivacy("job_match_alerts", v)} label="Job alerts" /></Row>
        </div>
        {username && <Link href={`/u/${username}`} className="link mt-2 inline-flex items-center gap-1 text-sm">View public profile <ExternalLink className="h-3.5 w-3.5" /></Link>}
      </Section>

      <Section id="badge" icon={BadgeCheck} tint="emerald" title="Badge & billing">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-sm">{me?.badge_level && me.badge_level !== "none" ? <>You have the <span className="font-medium capitalize">{me.badge_level}</span> badge <VerifiedBadge level={me.badge_level} size={15} /></> : "Core Crede features are free. Badges are a one-off payment."}</p>
          <Link href="/badges" className="link shrink-0 text-sm">Badges</Link>
        </div>
      </Section>

      <Section id="security" icon={Lock} tint="gray" title="Security">
        <p className="text-sm text-muted">{collab ? <>Change your password and sessions in <a href={`${accountsUrl}/settings`} target="_blank" rel="noreferrer" className="link">Collab Accounts</a>.</> : "Use a strong, unique password. Signing in with Collab Accounts is recommended."}</p>
        <button type="button" onClick={async () => { await logout(); router.replace("/login"); }} className="link-muted mt-3 inline-flex items-center gap-1.5 text-sm text-danger"><LogOut className="h-4 w-4" />Sign out of this device</button>
      </Section>

      <Section id="connected" icon={Plug} tint="sky" title="Connected apps">
        <Row title="Collab Accounts" sub={collab ? "Identity provider" : "Not connected"}><span className={collab ? "pill pill-green" : "pill pill-gray"}>{collab ? "Active" : "Local"}</span></Row>
        <Row title="Collab Teams" sub="Organisations stay in sync both ways"><Link href="/orgs" className="link text-sm">Organisations</Link></Row>
      </Section>
    </div>
  );
}
