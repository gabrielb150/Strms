// Cross-platform matching. Order of confidence:
//   1. ISRC          2. Spotify track ID
//   3. exact key     (normalized credited artist + normalized title + version)
//   4. fuzzy         (same title with overlapping artists, or a 1-character title typo with the same lead)
// Anything else is reported as unmatched instead of being merged by guess.

import { normalizeArtist, parseTitle } from "./normalize";

export interface KnownSong {
  id: string;
  title: string;
  /** Credited artist names, lead first. Featured artists in the title are picked up automatically. */
  artistNames: string[];
  isrc?: string | null;
  spotifyTrackId?: string | null;
}

export interface MatchQuery {
  title: string;
  artists: string[];
  isrc?: string | null;
  spotifyTrackId?: string | null;
}

export type MatchMethod = "isrc" | "spotify_id" | "exact" | "ambiguous" | "fuzzy";

export type MatchResult =
  | { songId: string; method: MatchMethod; candidates?: string[] }
  | { songId: null; reason: "no_candidate" | "ambiguous_fuzzy"; candidates: string[] };

export class SongMatcher {
  private byIsrc = new Map<string, string>();
  private bySpotify = new Map<string, string>();
  private byKey = new Map<string, string[]>();
  private byTitle = new Map<string, string[]>();
  private songs = new Map<string, { artists: string[]; titleKey: string; version: string; lead: string }>();

  constructor(songs: KnownSong[] = []) {
    for (const s of songs) this.add(s);
  }

  add(song: KnownSong) {
    if (this.songs.has(song.id)) return;
    const t = parseTitle(song.title);
    const artists = unique([...song.artistNames, ...t.featured].map(normalizeArtist).filter(Boolean));
    this.songs.set(song.id, { artists, titleKey: t.key, version: t.version, lead: artists[0] ?? "" });
    if (song.isrc) this.byIsrc.set(song.isrc.toUpperCase(), song.id);
    if (song.spotifyTrackId) this.bySpotify.set(song.spotifyTrackId, song.id);
    for (const a of artists) push(this.byKey, `${a}|${t.key}|${t.version}`, song.id);
    push(this.byTitle, `${t.key}|${t.version}`, song.id);
  }

  has(id: string) {
    return this.songs.has(id);
  }

  match(q: MatchQuery): MatchResult {
    if (q.isrc) {
      const id = this.byIsrc.get(q.isrc.toUpperCase());
      if (id) return { songId: id, method: "isrc" };
    }
    if (q.spotifyTrackId) {
      const id = this.bySpotify.get(q.spotifyTrackId);
      if (id) return { songId: id, method: "spotify_id" };
    }

    const t = parseTitle(q.title);
    const artists = unique([...q.artists, ...t.featured].map(normalizeArtist).filter(Boolean));

    // Exact: count how many credited artists point at each candidate.
    const hits = new Map<string, number>();
    for (const a of artists) for (const id of this.byKey.get(`${a}|${t.key}|${t.version}`) ?? []) hits.set(id, (hits.get(id) ?? 0) + 1);
    if (hits.size > 0) {
      const ranked = [...hits.entries()].sort((a, b) => b[1] - a[1]);
      const top = ranked.filter(([, n]) => n === ranked[0][1]).map(([id]) => id);
      // Prefer the candidate whose lead artist is our lead artist.
      const sameLead = top.filter((id) => this.songs.get(id)!.lead === artists[0]);
      const pool = sameLead.length ? sameLead : top;
      if (pool.length === 1) return { songId: pool[0], method: "exact" };
      // Same lead AND same title on two known songs: almost always the same recording listed twice.
      return { songId: pool[0], method: "ambiguous", candidates: pool };
    }

    // Fuzzy 1: same title + version, artists overlap loosely ("KAROL G" vs "Karol G.", "Sean Paul" in "Sean Paul and X").
    const sameTitle = (this.byTitle.get(`${t.key}|${t.version}`) ?? []).filter((id) => artistsOverlap(artists, this.songs.get(id)!.artists));
    if (sameTitle.length === 1) return { songId: sameTitle[0], method: "fuzzy" };
    if (sameTitle.length > 1) return { songId: null, reason: "ambiguous_fuzzy", candidates: sameTitle };

    // Fuzzy 2: tiny title typo (one edit, titles of 6+ chars) with the exact same lead artist and version.
    if (t.key.length >= 6 && artists[0]) {
      const close = [...this.songs.entries()]
        .filter(([, s]) => s.lead === artists[0] && s.version === t.version && Math.abs(s.titleKey.length - t.key.length) <= 1 && levenshtein(s.titleKey, t.key) === 1)
        .map(([id]) => id);
      if (close.length === 1) return { songId: close[0], method: "fuzzy" };
      if (close.length > 1) return { songId: null, reason: "ambiguous_fuzzy", candidates: close };
    }

    return { songId: null, reason: "no_candidate", candidates: [] };
  }
}

/** Loose artist comparison: equal ignoring spaces, or one name is a whole-word part of the other. */
export function artistsOverlap(a: string[], b: string[]): boolean {
  for (const x of a) {
    for (const y of b) {
      if (!x || !y) continue;
      if (x.replace(/ /g, "") === y.replace(/ /g, "")) return true;
      const [short, long] = x.length <= y.length ? [x, y] : [y, x];
      if (short.length >= 4 && ` ${long} `.includes(` ${short} `)) return true;
    }
  }
  return false;
}

export function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

/** Resolves artist names to canonical ids (Spotify ID when known). */
export class ArtistResolver {
  private byName = new Map<string, string>();

  constructor(entries: [name: string, id: string][] = []) {
    for (const [n, id] of entries) this.add(n, id);
  }

  /** Spotify-ID'd artists win over name-only ids for the same normalized name. */
  add(name: string, id: string) {
    const key = normalizeArtist(name);
    if (!key) return;
    const existing = this.byName.get(key);
    if (!existing || (existing.startsWith("n-") && !id.startsWith("n-"))) this.byName.set(key, id);
  }

  resolve(name: string): string | null {
    return this.byName.get(normalizeArtist(name)) ?? null;
  }

  isKnown = (name: string) => this.byName.has(normalizeArtist(name));
}

function push(map: Map<string, string[]>, key: string, id: string) {
  const list = map.get(key);
  if (!list) map.set(key, [id]);
  else if (!list.includes(id)) list.push(id);
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}
