"use client";

/** 1×1 transparent PNG used when a cross-origin image (e.g. an SSO avatar without CORS) can't be embedded. */
const BLANK = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=";

async function settle(node: HTMLElement) {
  // Images must be decoded and webfonts ready, otherwise the canvas captures blanks/fallback fonts.
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(imgs.map((img) => (img.complete && img.naturalWidth ? img.decode().catch(() => undefined)
    : new Promise<void>((r) => { img.onload = img.onerror = () => r(); setTimeout(r, 4000); }))));
  if (document.fonts?.ready) await document.fonts.ready;
}

/** Render a node (the GrabFrame) to a crisp PNG (≥2× pixel ratio); share it natively on phones, else download. */
export async function grabToPng(node: HTMLElement, filename: string): Promise<"shared" | "downloaded"> {
  const { toBlob } = await import("html-to-image");
  await settle(node);
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--background").trim() || "#f7f7f8";
  const opts = {
    pixelRatio: Math.max(2, Math.min(3, window.devicePixelRatio || 2)),
    backgroundColor: bg,
    cacheBust: false,
    imagePlaceholder: BLANK,
    width: node.offsetWidth,
    height: node.offsetHeight,
  };
  // First pass warms html-to-image's font/image cache (Safari otherwise drops webfonts on the first render).
  await toBlob(node, opts).catch(() => null);
  const blob = await toBlob(node, opts);
  if (!blob) throw new Error("render failed");
  if (window.matchMedia("(pointer: coarse)").matches && typeof navigator.canShare === "function") {
    const file = new File([blob], filename, { type: "image/png" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "Shared from Crede" });
        return "shared";
      } catch {
        /* cancelled — fall back to download */
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return "downloaded";
}
