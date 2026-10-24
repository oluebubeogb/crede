/** External share targets — plain intent URLs, no SDKs or trackers. */
export type ShareTarget = { key: string; label: string; color: string; href: (url: string, text: string) => string };

const e = encodeURIComponent;

export const SHARE_TARGETS: ShareTarget[] = [
  { key: "whatsapp", label: "WhatsApp", color: "#25d366", href: (u, t) => `https://wa.me/?text=${e(`${t} ${u}`.trim())}` },
  { key: "x", label: "X", color: "#111114", href: (u, t) => `https://x.com/intent/post?url=${e(u)}&text=${e(t)}` },
  { key: "linkedin", label: "LinkedIn", color: "#0a66c2", href: (u) => `https://www.linkedin.com/sharing/share-offsite/?url=${e(u)}` },
  { key: "facebook", label: "Facebook", color: "#1877f2", href: (u) => `https://www.facebook.com/sharer/sharer.php?u=${e(u)}` },
  { key: "telegram", label: "Telegram", color: "#229ed9", href: (u, t) => `https://t.me/share/url?url=${e(u)}&text=${e(t)}` },
  { key: "email", label: "Email", color: "#6b6b76", href: (u, t) => `mailto:?subject=${e(t)}&body=${e(`${t}\n\n${u}`)}` },
];

export const isCoarse = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
export const canNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

/** Returns true if the native sheet completed, false if unavailable/cancelled. */
export async function nativeShare(data: ShareData): Promise<boolean> {
  if (!canNativeShare()) return false;
  try {
    await navigator.share(data);
    return true;
  } catch {
    return false;
  }
}
