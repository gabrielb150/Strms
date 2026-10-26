// Spotify weekly global top 200 with real stream counts, via kworb.net (robots.txt: Allow /).

import path from "node:path";
import { politeFetch } from "../http";
import { parseSpotifyWeekly } from "../kworb-parse";
import type { SourceAdapter } from "./types";

const URL = "https://kworb.net/spotify/country/global_weekly.html";

export const kworbSpotify: SourceAdapter = {
  id: "kworb-spotify",
  label: "Spotify Weekly Global (via kworb)",
  platforms: ["spotify"],
  isConfigured: () => true,
  async fetch(ctx) {
    const html = await politeFetch(URL, { cacheFile: path.join(ctx.rawDir, "global_weekly.html.gz"), offline: ctx.offline });
    const page = parseSpotifyWeekly(html);
    if (page.rows.length < 50) throw new Error(`Only ${page.rows.length} rows parsed; the page layout may have changed`);
    ctx.log(`Spotify: ${page.rows.length} songs, week ending ${page.chartDate}`);
    return [
      {
        platform: "spotify",
        valueKind: "streams",
        dataType: "real_streams",
        chartWeek: page.chartDate,
        scope: `Global top ${page.rows.length}`,
        songs: page.rows.map((r) => ({
          rank: r.rank,
          title: r.title,
          artists: r.artists,
          value: r.value,
          raw: r.raw,
          spotifyTrackId: r.spotifyTrackId,
          spotifyArtistIds: r.spotifyArtistIds,
        })),
      },
    ];
  },
};
