// Turns matched per-platform chart rows into a finished WeekFile:
// scores, combined ranks, movement, peaks, weeks on chart, artist totals and highlights.

import {
  chooseScoreMode,
  fitRankExponent,
  normalizeWeights,
  rankPoints,
  round1,
  valuePoints,
  weightedScore,
  type ScoringConfig,
} from "./scoring";
import type {
  Artist,
  ArtistEntry,
  ChartPosition,
  Highlight,
  PlatformId,
  PlatformStat,
  PlatformStats,
  Song,
  SongEntry,
  SourceStatus,
  ValueKind,
  WeekFile,
} from "./types";

export interface PlatformSongRow {
  songId: string; // canonical id after matching
  rank: number;
  value: number | null;
}

export interface PlatformArtistRow {
  artistId: string;
  rank: number;
  value: number | null;
}

export interface PlatformInput {
  platform: PlatformId;
  source: SourceStatus;
  valueKind: ValueKind;
  songRows: PlatformSongRow[];
  /** Optional official artist chart. If absent, artist stats are derived from songs (lead credit). */
  artistRows?: PlatformArtistRow[];
}

export interface BuildWeekInput {
  week: string;
  generatedAt: string;
  isMock: boolean;
  artists: Record<string, Artist>;
  songs: Record<string, Song>;
  platforms: PlatformInput[];
  /** Earlier week files, any order. Used for movement, peak, weeks on chart, re-entries. */
  previousWeeks: WeekFile[];
  config: ScoringConfig;
}

export function buildWeek(input: BuildWeekInput): WeekFile {
  const { config } = input;
  const used = input.platforms.filter((p) => p.source.included && p.songRows.length > 0);
  const includedIds = used.map((p) => p.platform);
  const weights = normalizeWeights(config.weights, includedIds);
  const scoreMode = chooseScoreMode(used.map((p) => p.valueKind));

  const ref = used.find((p) => p.platform === config.rankCurve.fitToReference && p.valueKind);
  const exponent = ref ? fitRankExponent(ref.songRows, config.rankCurve) : config.rankCurve.fallbackExponent;

  // --- Songs: per-platform stats and score ---
  const songStats = new Map<string, PlatformStats>();
  for (const p of used) {
    const top = Math.max(0, ...p.songRows.map((r) => r.value ?? 0));
    for (const row of p.songRows) {
      if (!input.songs[row.songId]) continue;
      const points =
        p.valueKind && row.value != null ? valuePoints(row.value, top) : rankPoints(row.rank, exponent);
      const stats = songStats.get(row.songId) ?? {};
      // Keep the best position if a source lists the same song twice (e.g. two versions).
      if (!stats[p.platform] || row.rank < (stats[p.platform]!.rank ?? Infinity)) {
        stats[p.platform] = { rank: row.rank, value: row.value, valueKind: p.valueKind, points: round1(points) };
      }
      songStats.set(row.songId, stats);
    }
  }

  const scoredSongs = [...songStats.entries()].map(([songId, platforms]) => ({
    songId,
    platforms,
    ...scoreOf(platforms, weights, scoreMode, config),
  }));
  scoredSongs.sort(compareScored);

  // --- Artists: official artist charts when available, otherwise lead-credit sums of song rows ---
  const artistStats = new Map<string, PlatformStats>();
  for (const p of used) {
    const totals = new Map<string, { value: number | null; points: number; rank: number | null }>();
    if (p.artistRows?.length) {
      const top = Math.max(0, ...p.artistRows.map((r) => r.value ?? 0));
      for (const r of p.artistRows) {
        const points = p.valueKind && r.value != null ? valuePoints(r.value, top) : rankPoints(r.rank, exponent);
        totals.set(r.artistId, { value: r.value, points, rank: r.rank });
      }
    } else {
      for (const [songId, stats] of songStats) {
        const s = stats[p.platform];
        const lead = input.songs[songId]?.artistIds[0];
        if (!s || !lead) continue;
        const t = totals.get(lead) ?? { value: p.valueKind ? 0 : null, points: 0, rank: null };
        if (t.value != null && s.value != null) t.value += s.value;
        t.points += s.points;
        totals.set(lead, t);
      }
      // Rank artists on this platform by their summed points and rescale so the leader = 100.
      const ordered = [...totals.entries()].sort((a, b) => b[1].points - a[1].points);
      const max = ordered[0]?.[1].points ?? 0;
      ordered.forEach(([, t], i) => {
        t.rank = i + 1;
        t.points = max > 0 ? (100 * t.points) / max : 0;
      });
    }
    for (const [artistId, t] of totals) {
      if (!input.artists[artistId]) continue;
      const stats = artistStats.get(artistId) ?? {};
      stats[p.platform] = { rank: t.rank, value: t.value, valueKind: p.valueKind, points: round1(t.points) };
      artistStats.set(artistId, stats);
    }
  }

  const scoredArtists = [...artistStats.entries()].map(([artistId, platforms]) => ({
    artistId,
    platforms,
    ...scoreOf(platforms, weights, scoreMode, config),
  }));
  scoredArtists.sort(compareScored);

  // --- History-aware chart positions ---
  const prevSorted = [...input.previousWeeks].filter((w) => w.week < input.week).sort((a, b) => (a.week < b.week ? -1 : 1));
  // Movement is only measured against the week directly before; a gap in history means "unknown".
  const lastWeek = prevSorted.at(-1) ?? null;
  const hasPrevWeek = lastWeek != null && daysBetween(lastWeek.week, input.week) === 7;
  const gap = lastWeek != null && !hasPrevWeek;
  const songHistory = historyIndex(prevSorted, (w) => w.songChart.map((e) => [e.songId, e]));
  const artistHistory = historyIndex(prevSorted, (w) => w.artistChart.map((e) => [e.artistId, e]));
  const lastSongRanks = new Map(hasPrevWeek ? lastWeek!.songChart.map((e) => [e.songId, e.rank]) : []);
  const lastArtistRanks = new Map(hasPrevWeek ? lastWeek!.artistChart.map((e) => [e.artistId, e.rank]) : []);

  const songChart: SongEntry[] = scoredSongs.slice(0, config.chartSize).map((s, i) => ({
    songId: s.songId,
    ...position(i + 1, s, lastSongRanks.get(s.songId) ?? null, songHistory.get(s.songId), gap),
  }));

  // Every scored song (not only the Top 100), best first, grouped by each credited artist.
  const chartRankOf = new Map(songChart.map((e) => [e.songId, e.rank]));
  const songsByArtist = new Map<string, (typeof scoredSongs)[number][]>();
  for (const s of scoredSongs) {
    for (const a of input.songs[s.songId].artistIds) {
      const list = songsByArtist.get(a) ?? [];
      list.push(s);
      songsByArtist.set(a, list);
    }
  }

  const artistChart: ArtistEntry[] = scoredArtists.slice(0, config.chartSize).map((a, i) => {
    const top = (songsByArtist.get(a.artistId) ?? []).slice(0, 3);
    return {
      artistId: a.artistId,
      topSongIds: top.map((s) => s.songId),
      topSongs: top.map((s) => ({ songId: s.songId, chartRank: chartRankOf.get(s.songId) ?? null, score: s.score, platforms: s.platforms })),
      ...position(i + 1, a, lastArtistRanks.get(a.artistId) ?? null, artistHistory.get(a.artistId), gap),
    };
  });

  // Only ship metadata for what is actually on the charts (plus each artist's top songs).
  const songIds = new Set(songChart.map((e) => e.songId));
  for (const e of artistChart) for (const id of e.topSongIds) songIds.add(id);
  const artistIds = new Set(artistChart.map((e) => e.artistId));
  for (const id of songIds) for (const a of input.songs[id].artistIds) artistIds.add(a);

  return {
    schemaVersion: 1,
    week: input.week,
    generatedAt: input.generatedAt,
    isMock: input.isMock,
    scoreMode,
    weights,
    rankCurveExponent: round3(exponent),
    sources: input.platforms.map((p) => ({ ...p.source, included: p.source.included && p.songRows.length > 0 })),
    artists: pick(input.artists, artistIds),
    songs: pick(input.songs, songIds),
    artistChart,
    songChart,
    highlights: {
      topArtist: highlight("artist", artistChart[0], (e) => e.artistId),
      topSong: highlight("song", songChart[0], (e) => e.songId),
      biggestGainerArtist: highlight("artist", biggestGainer(artistChart), (e) => e.artistId),
      biggestGainerSong: highlight("song", biggestGainer(songChart), (e) => e.songId),
      topNewArtist: highlight("artist", artistChart.find((e) => e.status === "new"), (e) => e.artistId),
      topNewSong: highlight("song", songChart.find((e) => e.status === "new"), (e) => e.songId),
    },
  };
}

interface Scored {
  platforms: PlatformStats;
  score: number;
  combinedStreams: number | null;
}

function scoreOf(
  platforms: PlatformStats,
  weights: Partial<Record<PlatformId, number>>,
  mode: WeekFile["scoreMode"],
  config: ScoringConfig,
): { score: number; combinedStreams: number | null } {
  if (mode === "combined_streams") {
    let total = 0;
    for (const [p, s] of Object.entries(platforms) as [PlatformId, PlatformStat][]) {
      const factor = s.valueKind === "views" ? config.combinedStreams.youtubeViewFactor : 1;
      total += (s.value ?? 0) * factor;
    }
    return { score: total, combinedStreams: total };
  }
  const points: Partial<Record<PlatformId, number>> = {};
  for (const [p, s] of Object.entries(platforms) as [PlatformId, PlatformStat][]) points[p] = s.points;
  return { score: weightedScore(points, weights), combinedStreams: null };
}

function compareScored(a: Scored, b: Scored): number {
  if (b.score !== a.score) return b.score - a.score;
  // Tie-break: best single-platform rank, then number of platforms charted on.
  const best = (s: Scored) => Math.min(...Object.values(s.platforms).map((p) => p?.rank ?? Infinity));
  const diff = best(a) - best(b);
  if (diff !== 0) return diff;
  return Object.keys(b.platforms).length - Object.keys(a.platforms).length;
}

function historyIndex<T extends ChartPosition>(
  weeks: WeekFile[],
  entries: (w: WeekFile) => [string, T][],
): Map<string, T> {
  // Latest appearance wins, which carries the running peak and weeks-on-chart forward.
  const map = new Map<string, T>();
  for (const w of weeks) for (const [id, e] of entries(w)) map.set(id, e);
  return map;
}

function position(
  rank: number,
  s: Scored,
  previousRank: number | null,
  lastAppearance: ChartPosition | undefined,
  gap = false,
): ChartPosition {
  const status: ChartPosition["status"] =
    previousRank != null
      ? previousRank > rank
        ? "up"
        : previousRank < rank
          ? "down"
          : "same"
      : lastAppearance
        ? gap
          ? "no-data"
          : "re-entry"
        : "new";
  return {
    rank,
    previousRank,
    movement: previousRank != null ? previousRank - rank : null,
    status,
    peak: Math.min(rank, lastAppearance?.peak ?? Infinity),
    weeksOnChart: (lastAppearance?.weeksOnChart ?? 0) + 1,
    score: s.score,
    combinedStreams: s.combinedStreams,
    platforms: s.platforms,
  };
}

function biggestGainer<T extends ChartPosition>(chart: T[]): T | undefined {
  let best: T | undefined;
  for (const e of chart) if ((e.movement ?? 0) > 0 && (!best || e.movement! > best.movement!)) best = e;
  return best;
}

function highlight<T extends ChartPosition>(
  kind: Highlight["kind"],
  e: T | undefined,
  id: (e: T) => string,
): Highlight | null {
  return e ? { kind, id: id(e), rank: e.rank, movement: e.movement } : null;
}

function pick<T>(obj: Record<string, T>, ids: Set<string>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const id of ids) if (obj[id]) out[id] = obj[id];
  return out;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}
