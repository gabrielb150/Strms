// Apple Music worldwide song chart via kworb.net. Ranks only: Apple publishes no stream counts,
// and kworb's "points" are its own popularity formula, so we deliberately use the rank alone.

import path from "node:path";
import { politeFetch } from "../http";
import { parseAppleWorldwide } from "../kworb-parse";
import type { SourceAdapter } from "./types";

const URL = "https://kworb.net/apple_songs/";

export const kworbApple: SourceAdapter = {
  id: "kworb-apple",
  label: "Apple Music Worldwide (via kworb)",
  platforms: ["apple"],
  isConfigured: () => true,
  async fetch(ctx) {
    const html = await politeFetch(URL, { cacheFile: path.join(ctx.rawDir, "apple_songs.html.gz"), offline: ctx.offline });
    const page = parseAppleWorldwide(html);
    if (page.rows.length < 50) throw new Error(`Only ${page.rows.length} rows parsed; the page layout may have changed`);
    const rows = page.rows.slice(0, 100);
    ctx.log(`Apple Music: ${rows.length} songs, snapshot ${page.chartDate}`);
    return [
      {
        platform: "apple",
        valueKind: null,
        dataType: "ranks_only",
        chartWeek: page.chartDate,
        scope: `Worldwide top ${rows.length}, ranks only (daily chart, snapshot ${page.chartDate})`,
        songs: rows.map((r) => ({ rank: r.rank, title: r.title, artists: r.artists, value: null, raw: r.raw })),
      },
    ];
  },
};
