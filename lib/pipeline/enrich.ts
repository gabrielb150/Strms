// Metadata enrichment for artists/songs that made the chart.
//  - Spotify Web API: artist photo + genres, track album art + ISRC. Needs SPOTIFY_CLIENT_ID/SECRET.
//    Stored in data/meta/spotify.json and refreshed; entries not refreshed for 2× metadataMaxAgeDays
//    are dropped (Spotify's terms: don't keep Spotify content indefinitely).
//  - MusicBrainz (free, CC0): artist country, looked up through the artist's Spotify URL. 1 request/second.

import fs from "node:fs";
import path from "node:path";
import pipelineConfig from "../../config/pipeline.json";
import { HttpError, politeFetch } from "./http";

const META_DIR = path.join(process.cwd(), "data", "meta");
const SPOTIFY_FILE = path.join(META_DIR, "spotify.json");
const MB_FILE = path.join(META_DIR, "musicbrainz.json");
const DAY = 86_400_000;

export interface SpotifyMeta {
  artists: Record<string, { name: string; image: string | null; genres: string[]; fetchedAt: string }>;
  tracks: Record<string, { image: string | null; isrc: string | null; fetchedAt: string }>;
}

export interface MusicBrainzMeta {
  artists: Record<string, { mbid: string | null; country: string | null; fetchedAt: string }>;
}

export function loadSpotifyMeta(): SpotifyMeta {
  return readJson(SPOTIFY_FILE, { artists: {}, tracks: {} });
}

export function loadMusicBrainzMeta(): MusicBrainzMeta {
  return readJson(MB_FILE, { artists: {} });
}

interface Log {
  log: (m: string) => void;
  warn: (m: string) => void;
}

export async function enrichSpotify(artistIds: string[], trackIds: string[], { log, warn }: Log): Promise<SpotifyMeta> {
  const meta = loadSpotifyMeta();
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  const maxAge = pipelineConfig.enrichment.metadataMaxAgeDays * DAY;
  const now = Date.now();
  const stale = (iso?: string) => !iso || now - Date.parse(iso) > maxAge;

  if (!pipelineConfig.enrichment.spotifyWebApi) return meta;
  if (!id || !secret) {
    warn("Spotify Web API: SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET not set, so photos and genres are skipped (placeholders are shown).");
    return purge(meta, maxAge);
  }

  let token: string;
  try {
    const res = await politeFetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      body: "grant_type=client_credentials",
      headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      delayMs: 0,
      retries: 1,
    });
    token = (JSON.parse(res) as { access_token: string }).access_token;
  } catch (e) {
    warn(`Spotify Web API: could not get a token (${(e as Error).message}). Note: Development Mode apps need the owner to have Spotify Premium.`);
    return purge(meta, maxAge);
  }

  const api = async <T>(p: string): Promise<T> => JSON.parse(await politeFetch(`https://api.spotify.com/v1/${p}`, { headers: { Authorization: `Bearer ${token}` }, delayMs: 200 })) as T;
  // Batch endpoints were removed for Development Mode apps in Feb 2026, so items are fetched one by one.
  const todoArtists = artistIds.filter((a) => stale(meta.artists[a]?.fetchedAt));
  const todoTracks = trackIds.filter((t) => stale(meta.tracks[t]?.fetchedAt));
  log(`Spotify Web API: fetching ${todoArtists.length} artists and ${todoTracks.length} tracks (others are cached)`);

  let failures = 0;
  for (const a of todoArtists) {
    try {
      const r = await api<{ name: string; genres?: string[]; images?: { url: string; width: number }[] }>(`artists/${a}`);
      meta.artists[a] = { name: r.name, image: pickImage(r.images), genres: r.genres ?? [], fetchedAt: new Date().toISOString() };
    } catch (e) {
      if (++failures <= 3) warn(`Spotify artist ${a}: ${(e as Error).message}`);
      if (e instanceof HttpError && e.status === 429) break;
    }
  }
  for (const t of todoTracks) {
    try {
      const r = await api<{ album?: { images?: { url: string; width: number }[] }; external_ids?: { isrc?: string } }>(`tracks/${t}`);
      meta.tracks[t] = { image: pickImage(r.album?.images), isrc: r.external_ids?.isrc ?? null, fetchedAt: new Date().toISOString() };
    } catch (e) {
      if (++failures <= 3) warn(`Spotify track ${t}: ${(e as Error).message}`);
      if (e instanceof HttpError && e.status === 429) break;
    }
  }
  if (failures > 3) warn(`Spotify Web API: ${failures} lookups failed in total`);
  return purge(meta, maxAge);
}

export function saveSpotifyMeta(meta: SpotifyMeta) {
  writeJson(SPOTIFY_FILE, meta);
}

/** Country for Spotify-ID'd artists via MusicBrainz URL relationships. Results (including "not found") are cached. */
export async function enrichMusicBrainz(spotifyArtistIds: string[], { log, warn }: Log): Promise<MusicBrainzMeta> {
  const meta = loadMusicBrainzMeta();
  if (!pipelineConfig.enrichment.musicbrainz) return meta;
  const retryMissAfter = 90 * DAY;
  const todo = spotifyArtistIds.filter((id) => {
    const m = meta.artists[id];
    return !m || (!m.mbid && Date.now() - Date.parse(m.fetchedAt) > retryMissAfter);
  });
  if (todo.length) log(`MusicBrainz: looking up country for ${todo.length} artists (~${Math.ceil((todo.length * 2.2) / 60)} min at 1 request/second)`);
  let failures = 0;
  for (const id of todo) {
    try {
      const url = encodeURIComponent(`https://open.spotify.com/artist/${id}`);
      let mbid: string | null = null;
      try {
        const rel = JSON.parse(await politeFetch(`https://musicbrainz.org/ws/2/url?resource=${url}&inc=artist-rels&fmt=json`, { delayMs: 1100, retries: 1 })) as {
          relations?: { artist?: { id: string } }[];
        };
        mbid = rel.relations?.find((r) => r.artist)?.artist?.id ?? null;
      } catch (e) {
        if (!(e instanceof HttpError && e.status === 404)) throw e;
      }
      let country: string | null = null;
      if (mbid) {
        const a = JSON.parse(await politeFetch(`https://musicbrainz.org/ws/2/artist/${mbid}?fmt=json`, { delayMs: 1100, retries: 1 })) as {
          country?: string | null;
          area?: { "iso-3166-1-codes"?: string[] } | null;
        };
        country = a.country ?? a.area?.["iso-3166-1-codes"]?.[0] ?? null;
      }
      meta.artists[id] = { mbid, country, fetchedAt: new Date().toISOString() };
    } catch (e) {
      if (++failures <= 3) warn(`MusicBrainz ${id}: ${(e as Error).message}`);
      if (failures > 10) {
        warn("MusicBrainz: too many failures, stopping for this run");
        break;
      }
    }
  }
  writeJson(MB_FILE, meta);
  return meta;
}

function pickImage(images?: { url: string; width: number }[]): string | null {
  if (!images?.length) return null;
  // Smallest image that is at least 300px wide; tables show 40px, artist pages 96px.
  const sorted = [...images].sort((a, b) => a.width - b.width);
  return (sorted.find((i) => i.width >= 300) ?? sorted.at(-1))!.url;
}

function purge(meta: SpotifyMeta, maxAge: number): SpotifyMeta {
  const cutoff = Date.now() - 2 * maxAge;
  for (const k of Object.keys(meta.artists)) if (Date.parse(meta.artists[k].fetchedAt) < cutoff) delete meta.artists[k];
  for (const k of Object.keys(meta.tracks)) if (Date.parse(meta.tracks[k].fetchedAt) < cutoff) delete meta.tracks[k];
  return meta;
}

function readJson<T>(file: string, fallback: T): T {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as T) : fallback;
}

function writeJson(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1));
}
