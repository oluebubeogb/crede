"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";

/** Tiny dependency-free SVG charts. All colours come from CSS vars so dark mode just works. */

type Series = { key: string; label: string; color: string };

function Legend({ series }: { series: Series[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
      {series.map((s) => <span key={s.key} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>)}
    </div>
  );
}

export function AreaChart({ data, x, series, max = 100, height = 150, suffix = "" }: {
  data: Record<string, number | string>[]; x: string; series: Series[]; max?: number; height?: number; suffix?: string;
}) {
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = height, P = 6;
  const n = data.length;
  const px = (i: number) => (n <= 1 ? W / 2 : P + (i * (W - 2 * P)) / (n - 1));
  const py = (v: number) => H - P - (Math.min(v, max) / max) * (H - 2 * P);
  const active = hover ?? n - 1;
  return (
    <div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" preserveAspectRatio="none" style={{ height }}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1)); setHover(Math.max(0, Math.min(n - 1, i))); }}>
          <defs>{series.map((s) => (
            <linearGradient key={s.key} id={`${gid}${s.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={s.color} stopOpacity=".22" /><stop offset="1" stopColor={s.color} stopOpacity="0" />
            </linearGradient>))}
          </defs>
          {[0.25, 0.5, 0.75].map((g) => <line key={g} x1={0} x2={W} y1={py(max * g)} y2={py(max * g)} stroke="var(--border)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />)}
          {series.map((s) => {
            const pts = data.map((d, i) => [px(i), py(Number(d[s.key]) || 0)]);
            if (n === 1) pts.unshift([P, pts[0][1]]), pts.push([W - P, pts[1][1]]);
            const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ");
            return (
              <g key={s.key}>
                <path d={`${line} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`} fill={`url(#${gid}${s.key})`} />
                <path d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" className="chart-draw" />
              </g>
            );
          })}
          {n > 0 && <line x1={px(active)} x2={px(active)} y1={0} y2={H} stroke="var(--border-strong)" vectorEffect="non-scaling-stroke" opacity={hover == null ? 0 : 1} />}
        </svg>
        {n > 0 && (
          <div className="pointer-events-none absolute top-0 rounded-lg bg-surface px-2 py-1 text-[11px] shadow-sm ring-1 ring-border"
            style={{ left: `clamp(0px, calc(${(px(active) / W) * 100}% - 50px), calc(100% - 110px))` }}>
            <p className="text-muted">{String(data[active][x])}</p>
            {series.map((s) => <p key={s.key} className="tabular font-medium" style={{ color: s.color }}>{s.label}: {data[active][s.key]}{suffix}</p>)}
          </div>
        )}
      </div>
      <Legend series={series} />
    </div>
  );
}

export function StackedBars({ data, x, series, height = 130, fmt = (v: string) => v }: {
  data: Record<string, number | string>[]; x: string; series: Series[]; height?: number; fmt?: (v: string) => string;
}) {
  const totals = data.map((d) => series.reduce((a, s) => a + (Number(d[s.key]) || 0), 0));
  const max = Math.max(1, ...totals);
  return (
    <div>
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${fmt(String(d[x]))}: ${series.map((s) => `${d[s.key]} ${s.label}`).join(", ")}`}>
            <span className={cn("text-[10px] tabular text-muted transition-opacity", totals[i] ? "opacity-0 group-hover:opacity-100" : "opacity-0")}>{totals[i]}</span>
            <div className="flex w-full max-w-[34px] flex-col-reverse overflow-hidden rounded-md bg-surface-2" style={{ height: `${Math.max(4, (totals[i] / max) * 100)}%` }}>
              {series.map((s) => { const v = Number(d[s.key]) || 0; return v ? <div key={s.key} className="chart-grow transition-opacity group-hover:opacity-90" style={{ height: `${(v / (totals[i] || 1)) * 100}%`, background: s.color }} /> : null; })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">{data.map((d, i) => <span key={i} className="flex-1 text-center text-[10px] text-muted">{fmt(String(d[x]))}</span>)}</div>
      <Legend series={series} />
    </div>
  );
}

export function Histogram({ buckets, height = 130 }: { buckets: { range: string; count: number }[]; height?: number }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  const tone = (i: number) => ["var(--danger)", "var(--warning)", "var(--amber)", "var(--accent)", "var(--success)"][i] || "var(--accent)";
  return (
    <div>
      <div className="flex items-end gap-2" style={{ height }}>
        {buckets.map((b, i) => (
          <div key={b.range} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[11px] font-medium tabular">{b.count || ""}</span>
            <div className="chart-grow w-full max-w-[44px] rounded-md transition-[filter] group-hover:brightness-110"
              style={{ height: `${Math.max(3, (b.count / max) * 100)}%`, background: b.count ? `color-mix(in srgb, ${tone(i)} 70%, var(--surface))` : "var(--surface-2)" }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">{buckets.map((b) => <span key={b.range} className="flex-1 text-center text-[10px] text-muted">{b.range}%</span>)}</div>
    </div>
  );
}

export function CoverageBars({ rows }: { rows: { skill: string; demand: number; met: number; partial: number; missing: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.demand));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.skill} className="group">
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="font-medium capitalize">{r.skill}</span>
            <span className="tabular text-muted">{r.met ? "You have it" : r.partial ? "Partly" : "Gap"} · {r.demand} job{r.demand === 1 ? "" : "s"}</span>
          </div>
          <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" style={{ width: `${Math.max(18, (r.demand / max) * 100)}%` }}>
            <div className="chart-grow-x" style={{ width: `${(r.met / r.demand) * 100}%`, background: "var(--success)" }} />
            <div className="chart-grow-x" style={{ width: `${(r.partial / r.demand) * 100}%`, background: "var(--warning)" }} />
            <div style={{ width: `${(r.missing / r.demand) * 100}%`, background: "color-mix(in srgb, var(--danger) 55%, var(--surface))" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Ring({ value, size = 72, color = "var(--accent)", label }: { value: number; size?: number; color?: string; label?: string }) {
  const s = Math.max(5, size / 11), r = (size - s) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={s} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={s} strokeLinecap="round" strokeDasharray={c}
          strokeDashoffset={c - (Math.min(100, value) / 100) * c} style={{ transition: "stroke-dashoffset .9s cubic-bezier(.2,.7,.2,1)" }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular">{label ?? `${Math.round(value)}%`}</span>
    </div>
  );
}
