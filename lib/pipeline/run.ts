// The weekly pipeline: fetch every source → match across platforms → score → write data/weeks/<week>.json.
// A failing source is skipped with a warning; the week is still published with the rest.

import fs from "node:fs";
import path from "node:path";
import pipelineConfig from "../../config/pipeline.json";
import scoring from "../../config/scoring.json";
import { buildWeek, type PlatformInput, type PlatformSongRow } from "../build-week";
import type { ScoringConfig } from "../scoring";
import type { Artist, PlatformId, Song, SourceStatus, WeekFile } from "../types";
import { PLATFORMS } from "../types";
import { ADAPTERS } from "./adapters";
import type { AdapterSongRow, PlatformChart, SourceAdapter } from "./adapters/types";
import { enrichMusicBrainz, enrichSpotify, loadMusicBrainzMeta, loadSpotifyMeta, saveSpotifyMeta } from "./enrich";
import { ArtistResolver, type MatchResult } from "./match";
import { cleanDisplayTitle, parseTitle, slugify } from "./normalize";
import { applyRedirects, Registry } from "./registry";

const DATA = path.join(process.cwd(), "data");
const WEEKS_DIR = path.join(DATA, "weeks");

export interface RunOptions {
  now?: Date;
  /** Build this chart week instead of the latest (only works with stored raw data or archived pages). */
  week?: string;
  force?: boolean;
  offline?: boolean;
  skipEnrich?: boolean;
  /** Override where raw responses are read from / written to (used by the backfill). */
  rawRoot?: string;
  /** Mark sources as rebuilt from archived snapshots. */
  reconstructed?: boolean;
  /** Restrict to these source ids (default: config/pipeline.json). */
  only?: string[];
}

export interface RunResult {
  status: "built" | "up-to-date" | "not-published";
  week: string;
  warnings: string[];
  summary: string[];
  /** Platforms left out of this week because their source failed or had no data. */
  excluded: string[];
}

interface ReviewLog {
  week: string;
  generatedAt: string;
  unmatched: { platform: PlatformId; raw: string; rank: number | null; value: number | null; reason: string; candidates: string[]; createdId: string }[];
  fuzzy: { platform: PlatformId; raw: string; matchedTo: string; matchedTitle: string; method: string }[];
}

const DEFAULT_DATATYPE: Record<PlatformId, SourceStatus["dataType"]> = { spotify: "real_streams", apple: "ranks_only", youtube: "real_views" };

export async function runPipeline(opts: RunOptions = {}): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const warnings: string[] = [];
  const summary: string[] = [];
  const log = (m: string) => console.log(`  ${m}`);
  const warn = (m: string) => {
    warnings.push(m);
    console.warn(`  ⚠ ${m}`);
  };

  const expectedWeek = opts.week ?? lastThursdayBefore(now);
  if (!opts.force && isBuilt(expectedWeek)) {
    log(`Week ${expectedWeek} is already built. Use --force to rebuild it from the stored raw data.`);
    return { status: "up-to-date", week: expectedWeek, warnings, summary, excluded: [] };
  }

  // ---------- 1. Fetch ----------
  let rawRoot = opts.rawRoot ?? path.join(DATA, "raw", expectedWeek);
  const covered = new Map<PlatformId, { chart: PlatformChart; adapter: SourceAdapter }>();
  const failed = new Map<PlatformId, { adapter: SourceAdapter; error: string }>();
  const sourcesCfg = pipelineConfig.sources as Record<string, { enabled: boolean }>;
  for (const id of opts.only ?? pipelineConfig.priority) {
    const adapter = ADAPTERS[id];
    if (!adapter || (!opts.only && !sourcesCfg[id]?.enabled)) continue;
    if (!adapter.isConfigured()) {
      log(`${adapter.label}: no API keys, skipped`);
      continue;
    }
    if (adapter.platforms.every((p) => covered.has(p))) continue;
    console.log(`→ ${adapter.label}`);
    try {
      const charts = await adapter.fetch({ expectedWeek, rawDir: path.join(rawRoot, id), offline: Boolean(opts.offline), log, warn });
      for (const c of charts) {
        if (covered.has(c.platform)) continue;
        covered.set(c.platform, { chart: c, adapter });
        failed.delete(c.platform);
      }
    } catch (e) {
      const raw = (e as Error).message;
      const msg = raw.startsWith("Offline mode") ? (opts.reconstructed ? "no archived snapshot for this week" : "no stored data for this week") : raw;
      warn(`${adapter.label} failed: ${msg}. Continuing without it.`);
      for (const p of adapter.platforms) if (!covered.has(p) && !failed.has(p)) failed.set(p, { adapter, error: msg });
    }
  }
  if (covered.size === 0) throw new Error(`All sources failed for week ${expectedWeek}:\n${warnings.join("\n")}`);

  // The chart week follows Spotify (the anchor source with a true Friday–Thursday week).
  const week = covered.get("spotify")?.chart.chartWeek ?? expectedWeek;
  if (week !== expectedWeek) {
    if (!opts.force && isBuilt(week)) {
      log(`Spotify still shows week ${week}, which is already built: the new week isn't published yet. Try again later.`);
      if (!opts.rawRoot) fs.rmSync(rawRoot, { recursive: true, force: true });
      return { status: "not-published", week, warnings, summary, excluded: [] };
    }
    warn(`Expected chart week ${expectedWeek} but Spotify's latest is ${week}; building ${week}.`);
    const target = path.join(DATA, "raw", week);
    if (!opts.rawRoot && fs.existsSync(rawRoot) && !fs.existsSync(target)) {
      fs.renameSync(rawRoot, target);
      rawRoot = target;
    }
  }

  // ---------- 2. Match ----------
  const reg = Registry.load();
  const resolver = reg.artistResolver();
  const matcher = reg.songMatcher();
  const review: ReviewLog = { week, generatedAt: now.toISOString(), unmatched: [], fuzzy: [] };
  const createdSongs = new Map<string, PlatformId>(); // song id → platform whose row created it
  const createdArtists = new Set<string>();

  const artistIdFor = (name: string): string => {
    const known = resolver.resolve(name);
    if (known) return reg.artistId(known);
    const id = `n-${slugify(name)}`;
    resolver.add(name, id);
    if (!reg.data.artists[id]) {
      reg.upsertArtist(id, { name, platformIds: {} });
      createdArtists.add(id);
    }
    return id;
  };

  const platformRows = new Map<PlatformId, PlatformSongRow[]>();

  // 2a. Spotify first: it has real IDs, so it defines identities that the other platforms match onto.
  const sp = covered.get("spotify")?.chart;
  if (sp) {
    const rows: PlatformSongRow[] = [];
    for (const r of sp.songs) {
      if (!r.spotifyTrackId) continue;
      const names = r.artists;
      const ids = (r.spotifyArtistIds ?? []).slice(0, names.length);
      ids.forEach((aid, i) => {
        const prev = resolver.resolve(names[i]);
        if (prev && prev.startsWith("n-") && prev !== aid) reg.redirectArtist(prev, aid);
        resolver.add(names[i], aid);
        reg.upsertArtist(aid, { name: names[i], platformIds: { spotify: aid } });
      });
      const songId = `sp-${r.spotifyTrackId}`;
      const prior = matcher.match({ title: r.title, artists: names });
      if (prior.songId?.startsWith("n-")) reg.redirectSong(prior.songId, songId);
      reg.upsertSong(songId, { title: r.title, artistIds: ids, isrc: r.isrc ?? null, platformIds: { spotify: r.spotifyTrackId } });
      matcher.add({ id: songId, title: r.title, artistNames: names, spotifyTrackId: r.spotifyTrackId, isrc: r.isrc });
      rows.push({ songId, rank: r.rank, value: r.value });
    }
    platformRows.set("spotify", rows);
  }

  const resolveRow = (platform: PlatformId, r: AdapterSongRow, logUnmatched: boolean): string => {
    const artists = mergeKnown(r.artists, resolver);
    const res: MatchResult = matcher.match({ title: r.title, artists, isrc: r.isrc, spotifyTrackId: r.spotifyTrackId });
    if (res.songId !== null) {
      const id = reg.songId(res.songId);
      if (res.method === "fuzzy" || res.method === "ambiguous") {
        review.fuzzy.push({ platform, raw: r.raw, matchedTo: id, matchedTitle: reg.data.songs[id]?.title ?? "?", method: res.method });
      }
      return id;
    }
    // Unmatched: create a name-based song so it still counts, and log it for review.
    const t = parseTitle(r.title);
    const credited = [...artists, ...t.featured.filter((f) => !artists.some((a) => a.toLowerCase() === f.toLowerCase()))];
    const artistIds = [...new Set(credited.map(artistIdFor))];
    const id = `n-${slugify(credited[0] ?? "unknown")}--${slugify(`${t.key} ${t.version}`)}`;
    if (!reg.data.songs[id]) {
      reg.upsertSong(id, { title: cleanDisplayTitle(r.title), artistIds, isrc: r.isrc ?? null, platformIds: {} });
      createdSongs.set(id, platform);
    }
    matcher.add({ id, title: r.title, artistNames: credited, isrc: r.isrc });
    if (logUnmatched) review.unmatched.push({ platform, raw: r.raw, rank: r.rank, value: r.value, reason: res.reason, candidates: res.candidates, createdId: id });
    return id;
  };

  for (const platform of PLATFORMS) {
    if (platform === "spotify" && sp) continue;
    const chart = covered.get(platform)?.chart;
    if (!chart) continue;
    if (chart.subCharts) {
      // Sum per song across sub-charts (YouTube countries), then rank by the total.
      const totals = new Map<string, number>();
      const firstRaw = new Map<string, AdapterSongRow>();
      for (const sub of chart.subCharts) {
        for (const r of sub.songs) {
          const id = resolveRow(platform, r, false);
          totals.set(id, (totals.get(id) ?? 0) + (r.value ?? 0));
          if (!firstRaw.has(id)) firstRaw.set(id, r);
        }
      }
      const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
      // Keep the top N by summed views (default 200, like Spotify) so ranks stay meaningful.
      platformRows.set(platform, ranked.slice(0, pipelineConfig.youtubeChartSize).map(([songId, value], i) => ({ songId, rank: i + 1, value })));
      for (const [songId, value] of ranked.slice(0, 300)) {
        if (createdSongs.get(songId) === platform) {
          const r = firstRaw.get(songId)!;
          review.unmatched.push({ platform, raw: r.raw, rank: null, value, reason: "no_candidate", candidates: [], createdId: songId });
        }
      }
    } else {
      platformRows.set(platform, chart.songs.map((r) => ({ songId: resolveRow(platform, r, true), rank: r.rank, value: r.value })));
    }
  }

  // ---------- 3. Score ----------
  const metaMb = loadMusicBrainzMeta();
  const artists: Record<string, Artist> = {};
  for (const [id, a] of Object.entries(reg.data.artists)) {
    artists[id] = { id, name: a.name, image: null, country: metaMb.artists[id]?.country ?? a.country ?? null, genres: [], platformIds: a.platformIds };
  }
  const songs: Record<string, Song> = {};
  for (const [id, s] of Object.entries(reg.data.songs)) {
    songs[id] = { id, title: s.title, artistIds: s.artistIds.map((a) => reg.artistId(a)), isrc: s.isrc, image: null, platformIds: s.platformIds };
  }

  const fetchedAt = now.toISOString();
  const platforms: PlatformInput[] = PLATFORMS.map((p) => {
    const c = covered.get(p);
    const f = failed.get(p);
    const rows = (platformRows.get(p) ?? []).map((r) => ({ ...r, songId: reg.songId(r.songId) }));
    let warning: string | null = f ? `${f.adapter.label} failed: ${f.error}` : c ? null : "Source not enabled";
    if (c && p !== "apple" && c.chart.chartWeek && c.chart.chartWeek !== week) {
      warning = `Latest available week ends ${c.chart.chartWeek} (chart week ends ${week}).`;
      warn(`${c.adapter.label}: ${warning}`);
    }
    return {
      platform: p,
      valueKind: c?.chart.valueKind ?? null,
      songRows: rows,
      source: {
        id: c?.adapter.id ?? f?.adapter.id ?? p,
        label: c?.adapter.label ?? f?.adapter.label ?? p,
        platform: p,
        included: Boolean(c),
        dataType: c?.chart.dataType ?? DEFAULT_DATATYPE[p],
        scope: c?.chart.scope ?? "",
        chartWeek: c?.chart.chartWeek ?? null,
        fetchedAt: c ? fetchedAt : null,
        warning,
        reconstructed: Boolean(opts.reconstructed),
      },
    };
  });

  // Previous weeks, with any new id redirects applied (and saved back so history stays connected).
  const previousWeeks: WeekFile[] = [];
  if (fs.existsSync(WEEKS_DIR)) {
    for (const f of fs.readdirSync(WEEKS_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort()) {
      if (f.slice(0, 10) === week) continue;
      const w = JSON.parse(fs.readFileSync(path.join(WEEKS_DIR, f), "utf8")) as WeekFile;
      if (w.isMock) continue;
      if (applyRedirects(w, reg.data.redirects)) {
        fs.writeFileSync(path.join(WEEKS_DIR, f), JSON.stringify(w, null, 1));
        log(`Updated ids in ${f} (artist/song now matched to Spotify)`);
      }
      previousWeeks.push(w);
    }
  }

  const file = buildWeek({ week, generatedAt: fetchedAt, isMock: false, artists, songs, platforms, previousWeeks, config: scoring as unknown as ScoringConfig });
  if (file.songChart.length < 20) throw new Error(`Only ${file.songChart.length} songs on the combined chart; refusing to publish a broken week.`);

  // ---------- 4. Enrich (only what made the chart) ----------
  if (!opts.skipEnrich) {
    const spArtists = Object.keys(file.artists).filter((id) => !id.startsWith("n-"));
    const spTracks = Object.values(file.songs).map((s) => s.platformIds.spotify).filter((x): x is string => Boolean(x));
    const meta = await enrichSpotify(spArtists, spTracks, { log, warn });
    saveSpotifyMeta(meta);
    const mb = await enrichMusicBrainz(spArtists, { log, warn });
    for (const a of Object.values(file.artists)) {
      a.country = mb.artists[a.id]?.country ?? a.country;
      if (a.country) reg.upsertArtist(a.id, { ...reg.data.artists[a.id], country: a.country });
    }
    for (const s of Object.values(file.songs)) {
      const isrc = s.platformIds.spotify ? meta.tracks[s.platformIds.spotify]?.isrc : null;
      if (isrc) {
        s.isrc = isrc;
        reg.upsertSong(s.id, { ...reg.data.songs[s.id], isrc });
      }
    }
  }

  // ---------- 5. Write ----------
  // Keep the registry small: forget name-only songs/artists created this run that didn't make a chart.
  const keepSongs = new Set(Object.keys(file.songs));
  for (const id of createdSongs.keys()) if (!keepSongs.has(id)) delete reg.data.songs[id];
  const referenced = new Set(Object.values(reg.data.songs).flatMap((s) => s.artistIds));
  for (const id of Object.keys(file.artists)) referenced.add(id);
  for (const id of createdArtists) if (!referenced.has(id)) delete reg.data.artists[id];
  reg.save();

  fs.mkdirSync(WEEKS_DIR, { recursive: true });
  fs.writeFileSync(path.join(WEEKS_DIR, `${week}.json`), JSON.stringify(file, null, 1));
  const logsDir = path.join(DATA, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const seen = new Set<string>();
  review.fuzzy = review.fuzzy.filter((f) => !seen.has(f.raw + f.matchedTo) && Boolean(seen.add(f.raw + f.matchedTo)));
  fs.writeFileSync(path.join(logsDir, `${week}-matching.json`), JSON.stringify(review, null, 1));

  // Mock weeks are only for previewing; remove them once real data exists.
  for (const f of fs.readdirSync(WEEKS_DIR)) {
    const w = JSON.parse(fs.readFileSync(path.join(WEEKS_DIR, f), "utf8")) as WeekFile;
    if (w.isMock) fs.rmSync(path.join(WEEKS_DIR, f));
  }

  const included = file.sources.filter((s) => s.included).map((s) => s.platform);
  summary.push(
    `Built week ending ${week}: ${file.songChart.length} songs, ${file.artistChart.length} artists.`,
    `Sources included: ${included.join(", ") || "none"}${file.sources.some((s) => !s.included) ? ` (missing: ${file.sources.filter((s) => !s.included).map((s) => s.platform).join(", ")})` : ""}.`,
    `#1 song: ${file.songs[file.songChart[0].songId].title} · #1 artist: ${file.artists[file.artistChart[0].artistId].name}.`,
    `Matching: ${review.unmatched.length} unmatched and ${review.fuzzy.length} fuzzy matches logged in data/logs/${week}-matching.json.`,
  );
  summary.forEach((s) => console.log(s));
  return { status: "built", week, warnings, summary, excluded: file.sources.filter((s) => !s.included).map((s) => s.platform) };
}

/** A real (non-mock) file exists for this week. */
function isBuilt(week: string): boolean {
  const f = path.join(WEEKS_DIR, `${week}.json`);
  return fs.existsSync(f) && !(JSON.parse(fs.readFileSync(f, "utf8")) as WeekFile).isMock;
}

/** Most recent Thursday strictly before `now` (UTC): the end of the last complete chart week. */
export function lastThursdayBefore(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const back = (d.getUTCDay() - 4 + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** Re-join split credits that together form a known artist name ("Simon", "Garfunkel" → "Simon & Garfunkel"). */
function mergeKnown(artists: string[], resolver: ArtistResolver): string[] {
  const out: string[] = [];
  for (let i = 0; i < artists.length; i++) {
    const pair = i + 1 < artists.length ? `${artists[i]} & ${artists[i + 1]}` : null;
    if (pair && resolver.isKnown(pair) && !resolver.isKnown(artists[i])) {
      out.push(pair);
      i++;
    } else out.push(artists[i]);
  }
  return out;
}

