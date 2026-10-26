// YouTube weekly country charts (real views) via kworb.net, summed per song after matching.
// YouTube's own global chart is not fetchable (robots.txt disallows /youtubei/), so the
// total is "views in countries where the song charted": a lower bound of global views.

import path from "node:path";
import { politeFetch } from "../http";
import { parseYoutubeCountry, parseYoutubeCountryList } from "../kworb-parse";
import type { AdapterSongRow, SourceAdapter } from "./types";

const INDEX = "https://kworb.net/youtube/insights/";

export const kworbYoutube: SourceAdapter = {
  id: "kworb-youtube",
  label: "YouTube Weekly Country Charts (via kworb)",
  platforms: ["youtube"],
  isConfigured: () => true,
  async fetch(ctx) {
    const indexHtml = await politeFetch(INDEX, { cacheFile: path.join(ctx.rawDir, "index.html.gz"), offline: ctx.offline });
    const countries = parseYoutubeCountryList(indexHtml);
    if (countries.length < 20) throw new Error(`Only ${countries.length} countries listed; the page layout may have changed`);

    const loaded: { id: string; week: string | null; songs: AdapterSongRow[] }[] = [];
    const weeks = new Map<string, number>();
    for (const cc of countries) {
      try {
        const html = await politeFetch(`${INDEX}${cc}.html`, { cacheFile: path.join(ctx.rawDir, `${cc}.html.gz`), offline: ctx.offline });
        const page = parseYoutubeCountry(html);
        if (page.chartDate) weeks.set(page.chartDate, (weeks.get(page.chartDate) ?? 0) + 1);
        loaded.push({ id: cc, week: page.chartDate, songs: page.rows.map((r) => ({ rank: r.rank, title: r.title, artists: r.artists, value: r.value, raw: r.raw })) });
      } catch (e) {
        ctx.warn(`YouTube ${cc}: skipped (${(e as Error).message})`);
      }
    }
    if (loaded.length < countries.length * 0.8) throw new Error(`Only ${loaded.length}/${countries.length} country charts loaded`);

    // kworb refreshes small countries less often, so use the LATEST week that enough countries share,
    // and drop countries still on an older week so weeks are never mixed.
    const MIN_COUNTRIES = 25;
    const chartWeek = [...weeks.entries()].filter(([, n]) => n >= MIN_COUNTRIES).map(([w]) => w).sort().at(-1) ?? null;
    if (!chartWeek) throw new Error(`No week shared by ${MIN_COUNTRIES}+ country charts`);
    const subCharts = loaded.filter((s) => s.week === chartWeek).map(({ id, songs }) => ({ id, songs }));
    const off = loaded.filter((s) => s.week !== chartWeek).map((s) => `${s.id} (${s.week})`);
    if (off.length) ctx.log(`YouTube: left out ${off.length} country chart(s) not yet updated to ${chartWeek}`);
    ctx.log(`YouTube: ${subCharts.length} country charts, week ending ${chartWeek}`);
    return [
      {
        platform: "youtube",
        valueKind: "views",
        dataType: "real_views",
        chartWeek,
        scope: `YouTube overall: sum of ${subCharts.length} country charts (lower bound of global views)`,
        songs: [],
        subCharts,
      },
    ];
  },
};
