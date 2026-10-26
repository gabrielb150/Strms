// One-off backfill of past weeks from Internet Archive (Wayback Machine) snapshots of kworb pages.
// Weeks built this way are marked "reconstructed". Sources with no archived snapshot for a week are left out.
//
//   npm run backfill                       weeks since 2026-08-20
//   npm run backfill -- --from=2026-07-01  earlier start
//
// Archived pages are cached in data/raw/_wayback/, so re-running never downloads the same snapshot twice.

import fs from "node:fs";
import path from "node:path";
import { politeFetch, readCache, writeCache } from "../lib/pipeline/http";
import { parseAppleWorldwide, parseSpotifyWeekly, parseYoutubeCountry } from "../lib/pipeline/kworb-parse";
import { runPipeline } from "../lib/pipeline/run";
import type { WeekFile } from "../lib/types";

for (const f of [".env.local", ".env"]) if (fs.existsSync(f)) process.loadEnvFile(f);

const args = process.argv.slice(2);
const FROM = args.find((a) => a.startsWith("--from="))?.split("=")[1] ?? "2026-08-20";
const DATA = path.join(process.cwd(), "data");
const CACHE = path.join(DATA, "raw", "_wayback");
const DELAY = 4000; // ~15 requests/minute: well inside the Wayback Machine's limits
const MIN_YT_COUNTRIES = 25;

interface Snap {
  ts: string;
  url: string;
}

async function cdx(url: string, prefix = false): Promise<Snap[]> {
  const from = FROM.replace(/-/g, "").slice(0, 6);
  const q = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}${prefix ? "&matchType=prefix" : ""}&from=${from}&filter=statuscode:200&fl=timestamp,original&output=txt`;
  const text = await politeFetch(q, { delayMs: DELAY });
  return text.trim().split("\n").filter(Boolean).map((l) => {
    const [ts, original] = l.split(" ");
    return { ts, url: original };
  });
}

/** Raw archived page (the `id_` form returns the original HTML without Wayback's toolbar). */
async function snapshot(s: Snap): Promise<string> {
  const file = path.join(CACHE, `${s.ts}-${s.url.replace(/^https?:\/\//, "").replace(/[^a-z0-9.]+/gi, "_")}.html.gz`);
  if (fs.existsSync(file)) return readCache(file);
  const html = await politeFetch(`https://web.archive.org/web/${s.ts}id_/${s.url}`, { delayMs: DELAY, retries: 3 });
  writeCache(file, html);
  return html;
}

const day = (iso: string, plus = 0) => {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + plus);
  return d.toISOString().slice(0, 10);
};
const tsDate = (ts: string) => `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;

function isBuilt(week: string) {
  const f = path.join(DATA, "weeks", `${week}.json`);
  return fs.existsSync(f) && !(JSON.parse(fs.readFileSync(f, "utf8")) as WeekFile).isMock;
}

async function main() {
  console.log(`Backfilling chart weeks from ${FROM} using Wayback Machine snapshots of kworb.net`);

  // 1. Which Spotify weeks are archived?
  const spSnaps = await cdx("kworb.net/spotify/country/global_weekly.html");
  const spotifyByWeek = new Map<string, string>();
  for (const s of spSnaps) {
    if (tsDate(s.ts) < day(FROM, -1)) continue;
    const html = await snapshot(s);
    const week = parseSpotifyWeekly(html).chartDate;
    if (week && week >= FROM && !spotifyByWeek.has(week)) spotifyByWeek.set(week, html);
  }
  const weeks = [...spotifyByWeek.keys()].sort().filter((w) => !isBuilt(w));
  console.log(`Archived Spotify weeks to build: ${weeks.join(", ") || "none"}`);
  if (!weeks.length) return;

  const appleSnaps = await cdx("kworb.net/apple_songs/");
  const ytSnaps = (await cdx("kworb.net/youtube/insights/", true)).filter((s) => /\/insights\/[a-z]{2}\.html$/.test(s.url));

  for (const week of weeks) {
    console.log(`\n=== Week ending ${week}`);
    const rawRoot = path.join(DATA, "raw", week);
    writeCache(path.join(rawRoot, "kworb-spotify", "global_weekly.html.gz"), spotifyByWeek.get(week)!);

    // Apple: the snapshot closest to the Saturday after the chart week, within a few days.
    const target = Date.parse(day(week, 2));
    const apple = appleSnaps
      .filter((s) => tsDate(s.ts) >= day(week, -2) && tsDate(s.ts) <= day(week, 5))
      .sort((a, b) => Math.abs(Date.parse(tsDate(a.ts)) - target) - Math.abs(Date.parse(tsDate(b.ts)) - target))[0];
    if (apple) {
      const html = await snapshot(apple);
      if (parseAppleWorldwide(html).rows.length >= 50) writeCache(path.join(rawRoot, "kworb-apple", "apple_songs.html.gz"), html);
      console.log(`  Apple Music: snapshot ${tsDate(apple.ts)}`);
    } else console.log("  Apple Music: no archived snapshot near this week, left out");

    // YouTube: like the live pipeline, use the YouTube week one week behind the chart week.
    const ytWeek = day(week, -7);
    const byCountry = new Map<string, Snap[]>();
    for (const s of ytSnaps) {
      const d = tsDate(s.ts);
      if (d < day(ytWeek, 2) || d > day(week, 6)) continue;
      const cc = /\/([a-z]{2})\.html$/.exec(s.url)![1];
      byCountry.set(cc, [...(byCountry.get(cc) ?? []), s]);
    }
    if (byCountry.size < MIN_YT_COUNTRIES) {
      console.log(`  YouTube: only ${byCountry.size} countries archived for week ${ytWeek}, left out`);
    } else {
      const kept: string[] = [];
      for (const [cc, snaps] of byCountry) {
        // Try the snapshots nearest a week after the YouTube week until one shows that week.
        const t = Date.parse(day(ytWeek, 7));
        snaps.sort((a, b) => Math.abs(Date.parse(tsDate(a.ts)) - t) - Math.abs(Date.parse(tsDate(b.ts)) - t));
        for (const s of snaps.slice(0, 2)) {
          const html = await snapshot(s);
          if (parseYoutubeCountry(html).chartDate === ytWeek) {
            writeCache(path.join(rawRoot, "kworb-youtube", `${cc}.html.gz`), html);
            kept.push(cc);
            break;
          }
        }
      }
      if (kept.length >= MIN_YT_COUNTRIES) {
        writeCache(path.join(rawRoot, "kworb-youtube", "index.html.gz"), kept.map((cc) => `<a href="${cc}.html">${cc}</a>`).join("\n"));
        console.log(`  YouTube: ${kept.length} archived country charts for week ${ytWeek}`);
      } else {
        fs.rmSync(path.join(rawRoot, "kworb-youtube"), { recursive: true, force: true });
        console.log(`  YouTube: only ${kept.length} archived countries show week ${ytWeek}, left out`);
      }
    }

    await runPipeline({ week, offline: true, force: true, reconstructed: true });
  }

  // 2. Rebuild already-built later weeks so their movement / peaks / weeks-on-chart include the backfill.
  const later = fs.readdirSync(path.join(DATA, "weeks")).map((f) => f.slice(0, 10)).filter((w) => w > weeks.at(-1)!).sort();
  for (const w of later) {
    console.log(`\n=== Recomputing history for ${w}`);
    const wasReconstructed = (JSON.parse(fs.readFileSync(path.join(DATA, "weeks", `${w}.json`), "utf8")) as WeekFile).sources.some((s) => s.reconstructed);
    await runPipeline({ week: w, offline: true, force: true, reconstructed: wasReconstructed });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
