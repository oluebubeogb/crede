"use client";

import { useMemo, useState } from "react";

export type ActivityKind = "career" | "skill" | "cert" | "cv";

export type ActivityPoint = {
  id: string;
  date: Date;
  label: string;
  kind: ActivityKind;
  detail?: string;
};

const ALL_KIND_META: Record<
  ActivityKind,
  { y: number; color: string; label: string }
> = {
  career: { y: 0, color: "#3b82f6", label: "Career" },
  skill: { y: 1, color: "#10b981", label: "Skills" },
  cert: { y: 2, color: "#f59e0b", label: "Certs" },
  cv: { y: 3, color: "#8b5cf6", label: "CVs" },
};

type Props = {
  points: ActivityPoint[];
  /** Hide specific lanes (e.g. omit CVs on public profiles). */
  hideKinds?: ActivityKind[];
  emptyMessage?: string;
};

/**
 * Shared relational career-activity chart.
 * Used on the dashboard and public profile (/u/[username]).
 */
export function ActivityGraph({
  points,
  hideKinds = [],
  emptyMessage = "No activity to show yet.",
}: Props) {
  const [hover, setHover] = useState<ActivityPoint | null>(null);

  const kinds = (Object.keys(ALL_KIND_META) as ActivityKind[]).filter(
    (k) => !hideKinds.includes(k)
  );

  const kindMeta = useMemo(() => {
    const map: Record<string, { y: number; color: string; label: string }> = {};
    kinds.forEach((k, i) => {
      map[k] = { ...ALL_KIND_META[k], y: i };
    });
    return map;
  }, [kinds]);

  const sorted = useMemo(
    () =>
      [...points]
        .filter((p) => !hideKinds.includes(p.kind) && !Number.isNaN(p.date.getTime()))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [points, hideKinds]
  );

  if (sorted.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-muted">
        {emptyMessage}
      </div>
    );
  }

  const padL = 56;
  const padR = 24;
  const padT = 16;
  const padB = 36;
  const width = 800;
  const height = 220 + kinds.length * 10;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const laneH = plotH / Math.max(kinds.length, 1);

  const tMin = sorted[0].date.getTime();
  const tMax = Math.max(sorted[sorted.length - 1].date.getTime(), tMin + 1);
  const span = tMax - tMin || 1;

  function xOf(d: Date) {
    return padL + ((d.getTime() - tMin) / span) * plotW;
  }
  function yOf(kind: ActivityKind) {
    return padT + (kindMeta[kind]?.y ?? 0) * laneH + laneH / 2;
  }

  const tickCount = Math.min(6, Math.max(2, sorted.length));
  const ticks: Date[] = [];
  for (let i = 0; i < tickCount; i++) {
    ticks.push(new Date(tMin + (span * i) / (tickCount - 1 || 1)));
  }

  const byKind = kinds.map((kind) => ({
    kind,
    pts: sorted.filter((p) => p.kind === kind),
  }));

  function fmtTick(d: Date) {
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
  }

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted">
        {kinds.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: kindMeta[k].color }}
            />
            {kindMeta[k].label}
          </span>
        ))}
      </div>
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full min-w-[520px]"
          role="img"
          aria-label="Career activity over time"
        >
          {kinds.map((k) => {
            const y = yOf(k);
            return (
              <g key={k}>
                <line
                  x1={padL}
                  y1={y}
                  x2={width - padR}
                  y2={y}
                  stroke="currentColor"
                  strokeOpacity={0.08}
                  strokeWidth={1}
                />
                <text
                  x={padL - 10}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-muted"
                  style={{ fontSize: 11 }}
                >
                  {kindMeta[k].label}
                </text>
              </g>
            );
          })}

          <line
            x1={padL}
            y1={height - padB + 4}
            x2={width - padR}
            y2={height - padB + 4}
            stroke="currentColor"
            strokeOpacity={0.2}
            strokeWidth={1}
          />
          {ticks.map((t, i) => (
            <text
              key={i}
              x={xOf(t)}
              y={height - 10}
              textAnchor="middle"
              className="fill-muted"
              style={{ fontSize: 10 }}
            >
              {fmtTick(t)}
            </text>
          ))}

          {byKind.map(({ kind, pts }) => {
            if (pts.length < 2) return null;
            const d = pts
              .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(p.date)} ${yOf(kind)}`)
              .join(" ");
            return (
              <path
                key={kind}
                d={d}
                fill="none"
                stroke={kindMeta[kind].color}
                strokeWidth={2}
                strokeOpacity={0.45}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}

          {sorted.map((p) => {
            const cx = xOf(p.date);
            const cy = yOf(p.kind);
            const active = hover?.id === p.id;
            return (
              <g
                key={p.id}
                onMouseEnter={() => setHover(p)}
                onMouseLeave={() => setHover(null)}
                className="cursor-pointer"
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r={active ? 7 : 5}
                  fill={kindMeta[p.kind].color}
                  stroke="var(--background)"
                  strokeWidth={2}
                  className="transition-all duration-150"
                />
              </g>
            );
          })}
        </svg>
      </div>
      {hover ? (
        <p className="mt-2 text-center text-sm text-foreground">
          <span className="font-medium">{hover.label}</span>
          {hover.detail ? <span className="text-muted"> · {hover.detail}</span> : null}
          <span className="text-muted">
            {" "}
            ·{" "}
            {hover.date.toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-center text-sm text-muted">
          Hover a point to inspect · {sorted.length} events
        </p>
      )}
    </div>
  );
}

export function parseActivityDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
