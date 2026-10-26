// Photos, album art and genres come from the Spotify Web API and are kept in one current file
// (data/meta/spotify.json) instead of inside every historical week file. They are merged in here
// when the site is built, so old weeks show current photos and nothing Spotify-sourced is archived.

import type { WeekFile } from "./types";

interface SpotifyMetaLite {
  artists: Record<string, { image: string | null; genres: string[] }>;
  tracks: Record<string, { image: string | null }>;
}

export function overlayMeta(week: WeekFile, meta: SpotifyMetaLite | null): WeekFile {
  if (!meta || week.isMock) return week;
  for (const a of Object.values(week.artists)) {
    const m = a.platformIds.spotify ? meta.artists[a.platformIds.spotify] : undefined;
    if (m) {
      a.image = m.image ?? a.image;
      if (m.genres.length) a.genres = m.genres;
    }
  }
  for (const s of Object.values(week.songs)) {
    const m = s.platformIds.spotify ? meta.tracks[s.platformIds.spotify] : undefined;
    if (m?.image) s.image = m.image;
  }
  return week;
}
