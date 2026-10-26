import type { PlatformId } from "./types";

/** 1234567 → "1.2M", 1234567890 → "1.2B". */
export function compact(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  const fmt = (v: number, unit: string) => `${v >= 100 ? v.toFixed(0) : v.toFixed(1)}${unit}`.replace(".0" + unit, unit);
  if (abs >= 1e9) return fmt(n / 1e9, "B");
  if (abs >= 1e6) return fmt(n / 1e6, "M");
  if (abs >= 1e3) return fmt(n / 1e3, "K");
  return String(n);
}

export function exact(n: number | null | undefined): string {
  return n == null ? "Not available" : n.toLocaleString("en-US");
}

export function score(n: number): string {
  return n.toFixed(1);
}

/** "2026-10-22" → "Oct 16 – Oct 22, 2026" (chart weeks run Friday → Thursday). */
export function weekRange(week: string): string {
  const end = new Date(week + "T00:00:00Z");
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 6);
  const md = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return `${md(start)} – ${md(end)}, ${end.getUTCFullYear()}`;
}

export function shortDate(week: string): string {
  return new Date(week + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC";
}

export const PLATFORM_LABEL: Record<PlatformId, string> = {
  spotify: "Spotify",
  apple: "Apple Music",
  youtube: "YouTube",
};

export const PLATFORM_SHORT: Record<PlatformId, string> = {
  spotify: "SP",
  apple: "AM",
  youtube: "YT",
};

const REGION = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
export function countryName(code: string | null): string {
  if (!code) return "Unknown";
  try {
    return REGION?.of(code) ?? code;
  } catch {
    return code;
  }
}

export function flag(code: string | null): string {
  if (!code || code.length !== 2) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}
