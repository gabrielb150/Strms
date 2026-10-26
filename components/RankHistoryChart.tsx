"use client";

import { useEffect, useRef, useState } from "react";
import { PLATFORM_LABEL, shortDate } from "@/lib/format";
import type { ArtistHistoryPoint } from "@/lib/data";
import type { PlatformId } from "@/lib/types";

type Series = "combined" | PlatformId;
const COLORS: Record<Series, string> = { combined: "#7c5cff", spotify: "#1db954", apple: "#fa2d48", youtube: "#ff7a00" };
const LABELS: Record<Series, string> = { combined: "Combined", ...PLATFORM_LABEL };

/** Rank over time (1 at the top). Gaps = weeks off the chart. */
export default function RankHistoryChart({ history }: { history: ArtistHistoryPoint[] }) {
  const [shown, setShown] = useState<Record<Series, boolean>>({ combined: true, spotify: false, apple: false, youtube: false });
  const [hover, setHover] = useState<number | null>(null);

  // Draw at the real pixel width so text and dots keep their size on any screen.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const H = 240, L = 36, R = 28, T = 12, B = 28;
  const n = history.length;
  const valueOf = (h: ArtistHistoryPoint, s: Series) => (s === "combined" ? h.rank : h.platformRanks[s] ?? null);
  const allRanks = history.flatMap((h) => (Object.keys(shown) as Series[]).filter((s) => shown[s]).map((s) => valueOf(h, s))).filter((v): v is number => v != null);
  const maxRank = Math.max(10, Math.ceil(Math.max(...allRanks, 1) / 10) * 10);
  const x = (i: number) => L + (n <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (rank: number) => T + ((rank - 1) / (maxRank - 1)) * (H - T - B);
  const ticks = [1, ...Array.from({ length: 4 }, (_, i) => Math.round(((i + 1) * maxRank) / 4))];

  function path(s: Series) {
    let d = "";
    let pen = false;
    history.forEach((h, i) => {
      const v = valueOf(h, s);
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  }

  return (
    <div ref={box}>
      <div className="mb-3 flex flex-wrap gap-2">
        {(Object.keys(COLORS) as Series[]).map((s) => (
          <button
            key={s}
            onClick={() => setShown({ ...shown, [s]: !shown[s] })}
            aria-pressed={shown[s]}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${shown[s] ? "border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-800" : "border-transparent text-zinc-400"}`}
          >
            <span className="size-2 rounded-full" style={{ background: shown[s] ? COLORS[s] : "#a1a1aa" }} />
            {LABELS[s]}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block" role="img" aria-label="Rank history" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="stroke-zinc-200 dark:stroke-zinc-800" strokeDasharray={t === 1 ? undefined : "3 4"} />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="fill-zinc-400 text-[10px]">#{t}</text>
          </g>
        ))}
        {history.map((h, i) => (
          (i === 0 || i === n - 1 || i % Math.max(1, Math.ceil((n * 56) / (W - L - R))) === 0) && (
            <text key={h.week} x={x(i)} y={H - 8} textAnchor="middle" className="fill-zinc-400 text-[10px]">
              {shortDate(h.week).replace(/, \d{4}$/, "")}
            </text>
          )
        ))}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} className="stroke-zinc-300 dark:stroke-zinc-700" />}
        {(Object.keys(COLORS) as Series[]).filter((s) => shown[s]).map((s) => (
          <g key={s}>
            <path d={path(s)} fill="none" stroke={COLORS[s]} strokeWidth={s === "combined" ? 2.5 : 1.75} strokeLinejoin="round" strokeLinecap="round" />
            {history.map((h, i) => {
              const v = valueOf(h, s);
              return v == null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 4.5 : 3} fill={COLORS[s]} className="stroke-white dark:stroke-zinc-900" strokeWidth={1.5} />;
            })}
          </g>
        ))}
        {history.map((h, i) => (
          <rect key={h.week} x={x(i) - (W - L - R) / Math.max(1, n - 1) / 2} y={0} width={(W - L - R) / Math.max(1, n - 1)} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
        ))}
      </svg>
      <p className="mt-1 min-h-5 text-xs text-zinc-500 tabular">
        {hover != null ? (
          <>
            <strong className="text-zinc-700 dark:text-zinc-300">Week ending {shortDate(history[hover].week)}</strong>
            {(Object.keys(COLORS) as Series[]).filter((s) => shown[s]).map((s) => {
              const v = valueOf(history[hover], s);
              return <span key={s} className="ml-3">{LABELS[s]}: {history[hover].missing ? "no data" : v != null ? `#${v}` : "off chart"}</span>;
            })}
          </>
        ) : (
          "Hover or tap the chart for details. Gaps mean the artist was off that chart (or the week is missing from the archive)."
        )}
      </p>
    </div>
  );
}
