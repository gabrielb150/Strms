// Persistent identity registry (data/registry.json): keeps artist and song ids stable across weeks.
// Artists: Spotify artist ID when known, otherwise "n-<name>".  Songs: "sp-<Spotify track ID>" or "n-<artist>--<title>".
// When a name-only item later shows up with a Spotify ID, a redirect old → new is recorded and
// older week files are rewritten so history stays connected.

import fs from "node:fs";
import path from "node:path";
import type { PlatformId, WeekFile } from "../types";
import { ArtistResolver, SongMatcher } from "./match";

export interface RegistryArtist {
  name: string;
  platformIds: Partial<Record<PlatformId, string>>;
  country?: string | null;
}

export interface RegistrySong {
  title: string;
  artistIds: string[];
  isrc: string | null;
  platformIds: Partial<Record<PlatformId, string>>;
}

export interface RegistryData {
  version: 1;
  artists: Record<string, RegistryArtist>;
  songs: Record<string, RegistrySong>;
  redirects: { artists: Record<string, string>; songs: Record<string, string> };
}

const FILE = path.join(process.cwd(), "data", "registry.json");

export class Registry {
  data: RegistryData;
  /** Redirects created during this run (used to rewrite older week files). */
  newRedirects: RegistryData["redirects"] = { artists: {}, songs: {} };

  constructor(data?: RegistryData) {
    this.data = data ?? { version: 1, artists: {}, songs: {}, redirects: { artists: {}, songs: {} } };
  }

  static load(file = FILE): Registry {
    return new Registry(fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as RegistryData) : undefined);
  }

  save(file = FILE) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(sortKeys(this.data), null, 1));
  }

  artistResolver(): ArtistResolver {
    return new ArtistResolver(Object.entries(this.data.artists).map(([id, a]) => [a.name, id]));
  }

  songMatcher(): SongMatcher {
    return new SongMatcher(
      Object.entries(this.data.songs).map(([id, s]) => ({
        id,
        title: s.title,
        artistNames: s.artistIds.map((a) => this.data.artists[a]?.name ?? ""),
        isrc: s.isrc,
        spotifyTrackId: s.platformIds.spotify ?? null,
      })),
    );
  }

  upsertArtist(id: string, a: RegistryArtist) {
    const prev = this.data.artists[id];
    this.data.artists[id] = { ...prev, ...a, platformIds: { ...prev?.platformIds, ...a.platformIds } };
  }

  upsertSong(id: string, s: RegistrySong) {
    const prev = this.data.songs[id];
    this.data.songs[id] = { ...prev, ...s, isrc: s.isrc ?? prev?.isrc ?? null, platformIds: { ...prev?.platformIds, ...s.platformIds } };
  }

  redirectArtist(from: string, to: string) {
    if (from === to) return;
    this.data.redirects.artists[from] = to;
    this.newRedirects.artists[from] = to;
    delete this.data.artists[from];
    for (const s of Object.values(this.data.songs)) s.artistIds = s.artistIds.map((a) => (a === from ? to : a));
  }

  redirectSong(from: string, to: string) {
    if (from === to) return;
    this.data.redirects.songs[from] = to;
    this.newRedirects.songs[from] = to;
    delete this.data.songs[from];
  }

  artistId(id: string): string {
    return follow(this.data.redirects.artists, id);
  }

  songId(id: string): string {
    return follow(this.data.redirects.songs, id);
  }
}

/** Rewrite ids in a stored week file. Returns true if anything changed. */
export function applyRedirects(week: WeekFile, r: RegistryData["redirects"]): boolean {
  let changed = false;
  const a = (id: string) => {
    const n = follow(r.artists, id);
    if (n !== id) changed = true;
    return n;
  };
  const s = (id: string) => {
    const n = follow(r.songs, id);
    if (n !== id) changed = true;
    return n;
  };
  week.artistChart.forEach((e) => {
    e.artistId = a(e.artistId);
    e.topSongIds = e.topSongIds.map(s);
  });
  week.songChart.forEach((e) => (e.songId = s(e.songId)));
  week.artists = Object.fromEntries(Object.entries(week.artists).map(([id, v]) => [a(id), { ...v, id: a(id) }]));
  week.songs = Object.fromEntries(Object.entries(week.songs).map(([id, v]) => [s(id), { ...v, id: s(id), artistIds: v.artistIds.map(a) }]));
  for (const h of Object.values(week.highlights)) if (h) h.id = h.kind === "artist" ? a(h.id) : s(h.id);
  return changed;
}

function follow(map: Record<string, string>, id: string): string {
  let cur = id;
  for (let i = 0; i < 10 && map[cur]; i++) cur = map[cur];
  return cur;
}

function sortKeys<T>(obj: T): T {
  if (Array.isArray(obj) || obj === null || typeof obj !== "object") return obj;
  return Object.fromEntries(Object.entries(obj as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : 1)).map(([k, v]) => [k, sortKeys(v)])) as T;
}
