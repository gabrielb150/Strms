// Build-time data access (server components only). Reads /data/weeks directly.

import fs from "node:fs";
import path from "node:path";
import { overlayMeta } from "./meta-overlay";
import type { Artist, ArtistEntry, PlatformId, WeekFile, WeekIndex } from "./types";

const WEEKS_DIR = path.join(process.cwd(), "data", "weeks");
const META_FILE = path.join(process.cwd(), "data", "meta", "spotify.json");
const meta = fs.existsSync(META_FILE) ? JSON.parse(fs.readFileSync(META_FILE, "utf8")) : null;

export function weekIndex(): WeekIndex {
  const weeks = fs.existsSync(WEEKS_DIR)
    ? fs.readdirSync(WEEKS_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort().reverse()
    : [];
  return { latest: weeks[0] ?? null, weeks };
}

const cache = new Map<string, WeekFile>();
export function loadWeek(week: string): WeekFile {
  let w = cache.get(week);
  if (!w) {
    w = overlayMeta(JSON.parse(fs.readFileSync(path.join(WEEKS_DIR, `${week}.json`), "utf8")) as WeekFile, meta);
    cache.set(week, w);
  }
  return w;
}

export function allWeeks(): WeekFile[] {
  return weekIndex().weeks.map(loadWeek).reverse(); // oldest first
}

export interface ArtistHistoryPoint {
  week: string;
  /** No chart data exists for this week (gap in the archive). */
  missing?: boolean;
  rank: number | null;
  platformRanks: Partial<Record<PlatformId, number | null>>;
}

export interface ArtistProfile {
  artist: Artist;
  /** Most recent week this artist charted. */
  week: WeekFile;
  entry: ArtistEntry;
  history: ArtistHistoryPoint[];
}

/** Every artist that has ever charted, with their latest week and full rank history. */
export function artistProfiles(): Map<string, ArtistProfile> {
  const weeks = allWeeks();
  const profiles = new Map<string, ArtistProfile>();
  for (const w of weeks) {
    for (const entry of w.artistChart) {
      profiles.set(entry.artistId, { artist: w.artists[entry.artistId], week: w, entry, history: [] });
    }
  }
  // Every week from the first to the latest, with null for weeks missing from the archive,
  // so charts show a gap instead of a line that skips a week.
  const byWeek = new Map(weeks.map((w) => [w.week, w]));
  const timeline: string[] = [];
  if (weeks.length) {
    for (let d = new Date(weeks[0].week + "T00:00:00Z"); d.toISOString().slice(0, 10) <= weeks.at(-1)!.week; d.setUTCDate(d.getUTCDate() + 7)) {
      timeline.push(d.toISOString().slice(0, 10));
    }
  }
  for (const [id, p] of profiles) {
    p.history = timeline.map((week) => {
      const w = byWeek.get(week);
      if (!w) return { week, rank: null, platformRanks: {}, missing: true };
      const e = w.artistChart.find((x) => x.artistId === id);
      return {
        week,
        rank: e?.rank ?? null,
        platformRanks: {
          spotify: e?.platforms.spotify?.rank ?? null,
          apple: e?.platforms.apple?.rank ?? null,
          youtube: e?.platforms.youtube?.rank ?? null,
        },
      };
    });
  }
  return profiles;
}
