// Small presentational pieces shared by the chart tables and artist pages.

import { compact, exact, PLATFORM_LABEL, PLATFORM_SHORT } from "@/lib/format";
import type { ChartPosition, PlatformId, PlatformStats } from "@/lib/types";
import { PLATFORMS } from "@/lib/types";

/** Human-friendly number with the exact value on hover / tap. */
export function Num({ value, unit, className = "" }: { value: number | null | undefined; unit?: string; className?: string }) {
  if (value == null) return <span className={`text-zinc-400 dark:text-zinc-600 ${className}`}>—</span>;
  return (
    <span tabIndex={0} className={`num-tip tabular ${className}`} data-exact={`${exact(value)}${unit ? " " + unit : ""}`} aria-label={`${exact(value)} ${unit ?? ""}`}>
      {compact(value)}
    </span>
  );
}

export function Movement({ entry }: { entry: Pick<ChartPosition, "status" | "movement"> }) {
  switch (entry.status) {
    case "new":
      return <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-accent">NEW</span>;
    case "re-entry":
      return <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-600 dark:text-amber-400" title="Re-entry">RE</span>;
    case "up":
      return (
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400" title={`Up ${entry.movement}`}>
          <svg viewBox="0 0 10 10" className="size-2.5" fill="currentColor"><path d="M5 1l4 6H1z" /></svg>
          {entry.movement}
        </span>
      );
    case "down":
      return (
        <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-rose-600 dark:text-rose-400" title={`Down ${-entry.movement!}`}>
          <svg viewBox="0 0 10 10" className="size-2.5" fill="currentColor"><path d="M5 9L1 3h8z" /></svg>
          {-entry.movement!}
        </span>
      );
    case "no-data":
      return <span className="text-xs text-zinc-400" title="Previous week missing from the archive, so movement is unknown">?</span>;
    default:
      return <span className="text-xs text-zinc-400" title="No change">–</span>;
  }
}

const BADGE: Record<PlatformId, string> = {
  spotify: "bg-spotify/12 text-[#128a3e] ring-spotify/25 dark:text-spotify",
  apple: "bg-apple/10 text-[#d0172f] ring-apple/25 dark:text-[#ff5a6e]",
  youtube: "bg-youtube/10 text-[#cc0029] ring-youtube/25 dark:text-[#ff5c79]",
};

/** Per-platform rank pills. "Derived" ranks (artist totals) are marked in the tooltip. */
export function PlatformBadges({ platforms, derived = false, size = "sm" }: { platforms: PlatformStats; derived?: boolean; size?: "sm" | "md" }) {
  return (
    <div className="flex flex-nowrap gap-1">
      {PLATFORMS.map((p) => {
        const s = platforms[p];
        const label = s?.rank != null ? `${PLATFORM_LABEL[p]} #${s.rank}${derived ? " (from song totals)" : ""}` : `Not on ${PLATFORM_LABEL[p]} chart`;
        return (
          <span
            key={p}
            title={label}
            aria-label={label}
            className={`inline-flex items-center gap-1 rounded-md font-medium ring-1 ring-inset tabular ${size === "md" ? "px-2 py-1 text-xs" : "px-1.5 py-0.5 text-[11px]"} ${
              s ? BADGE[p] : "bg-zinc-100 text-zinc-400 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-600 dark:ring-zinc-800"
            }`}
          >
            <span className="opacity-70">{PLATFORM_SHORT[p]}</span>
            {s?.rank != null ? s.rank : "—"}
          </span>
        );
      })}
    </div>
  );
}

export function PlatformDot({ platform }: { platform: PlatformId }) {
  const c = { spotify: "bg-spotify", apple: "bg-apple", youtube: "bg-youtube" }[platform];
  return <span className={`inline-block size-2 rounded-full ${c}`} />;
}

const GRADIENTS = [
  "from-violet-500 to-fuchsia-500",
  "from-sky-500 to-indigo-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-rose-500 to-pink-500",
  "from-cyan-500 to-blue-500",
  "from-lime-500 to-emerald-500",
  "from-orange-500 to-red-500",
];

export function Avatar({ id, name, image, size = 40, rounded = "full" }: { id: string; name: string; image: string | null; size?: number; rounded?: "full" | "md" }) {
  const r = rounded === "full" ? "rounded-full" : "rounded-md";
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" width={size} height={size} loading="lazy" className={`${r} shrink-0 object-cover`} style={{ width: size, height: size }} />;
  }
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const initials = name.replace(/[^\p{L}\p{N} ]/gu, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <span
      aria-hidden
      className={`${r} grid shrink-0 place-items-center bg-gradient-to-br font-semibold text-white ${GRADIENTS[h % GRADIENTS.length]}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </span>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span tabIndex={0} className="num-tip tip-wide ml-1 inline-grid size-3.5 place-items-center rounded-full border border-current text-[9px] font-bold normal-case opacity-60" data-exact={text} aria-label={text}>
      i
    </span>
  );
}
