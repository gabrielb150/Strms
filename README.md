# Strms

A personal weekly music chart: the **Top 100 artists and Top 100 songs across Spotify, Apple Music and YouTube**, combined into one chart, with a breakdown per platform.

It runs on **free, public data**. Every Friday a GitHub Action fetches the new week, builds the chart, saves it as a file in `data/weeks/`, and the site on Vercel updates itself. You don't have to do anything week to week.

---

## What's real and what's calculated

| | Real or calculated? | Where it comes from |
|---|---|---|
| Spotify streams | **Real** weekly streams | Spotify's weekly global top 200, via [kworb.net](https://kworb.net/spotify/country/global_weekly.html) |
| YouTube views | **Real** weekly views, added up across ~60 country charts (a *lower bound* of global views) | YouTube weekly country charts, via [kworb.net](https://kworb.net/youtube/insights/) |
| Apple Music | **Rank only** (Apple publishes no stream counts) | Apple Music worldwide chart, via [kworb.net](https://kworb.net/apple_songs/) |
| Combined Score | **Calculated** chart points. Never a stream count. | Formula below |
| Photos, genres, ISRC | Metadata | Spotify Web API (needs your keys) |
| Artist country | Metadata | [MusicBrainz](https://musicbrainz.org) (free, open data) |

**Combined Score in one paragraph:** on each platform a song gets 0–100 points. Where there are real numbers it's `100 × streams ÷ the #1 song's streams`. Apple only gives ranks, so a rank becomes points on a curve (`100 × rank^-k`) whose steepness is copied from that week's real Spotify numbers. The three are then mixed with weights: **Spotify 45%, YouTube 30%, Apple Music 25%**. Artists are scored by adding up the songs where they are the **lead** artist. The full explanation is on the site's **About the data** page.

When you later add paid data with real streams for every platform, the chart switches by itself to **Combined Streams** (a real sum) and labels it that way.

---

## Run it on your computer

You need [Node.js](https://nodejs.org) 22 or newer.

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. That's it: the site reads the weeks already saved in `data/weeks/`.

---

## Add your Spotify keys (for photos and genres)

Without keys the chart still works; artists just show coloured initials instead of photos, and the genre filter is empty.

1. Go to the [Spotify developer dashboard](https://developer.spotify.com/dashboard) and create an app (any name; redirect URI can be `http://localhost:3000`).
   **The Spotify account that owns the app needs Spotify Premium.** That's a Spotify rule for new apps since February 2026.
2. Copy the **Client ID** and **Client secret**.
3. **For your computer:** copy `.env.example` to `.env.local` and paste them in:
   ```
   SPOTIFY_CLIENT_ID=your-id
   SPOTIFY_CLIENT_SECRET=your-secret
   ```
4. **For the weekly automation:** on GitHub open your repo → **Settings → Secrets and variables → Actions → New repository secret**, and add `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` with the same values.

Photos appear after the next update. To fetch them right away, run `npm run pipeline -- --force --offline` (rebuilds the current week from the saved pages and looks up the metadata).

---

## Update the chart

**Automatically:** every Friday at 18:00 UTC, with a retry on Saturday at 15:00 UTC in case a source published late. If Friday already worked, Saturday does nothing.

**Right now, from GitHub:** repo → **Actions → Weekly chart update → Run workflow**. Tick *force* to rebuild the latest week even if it already exists.

**Right now, on your computer:**

```bash
npm run pipeline
```

Useful options (add them after `--`, e.g. `npm run pipeline -- --force`):

| Option | What it does |
|---|---|
| `--force` | Rebuild the latest week even if it already exists |
| `--offline` | Don't touch the internet for chart data; use the pages already saved in `data/raw/` |
| `--no-enrich` | Skip the Spotify and MusicBrainz lookups (faster) |

A normal run takes about 6 minutes, because it politely fetches ~130 YouTube country pages a few seconds apart.

**Change the schedule:** edit the two `cron:` lines at the top of `.github/workflows/weekly-update.yml` ([cron cheat sheet](https://crontab.guru)).

**Change the weights:** edit `config/scoring.json`, then rebuild all weeks so the whole history uses the same formula:

```bash
npm run rebuild
```

---

## Where the site lives

**Live site: https://gabrielb150.github.io/Strms/** (GitHub Pages, free).

The `Deploy site to GitHub Pages` workflow rebuilds and publishes it on every push to `main` and after every weekly update. Nothing to set up.

## Deploy on Vercel or Netlify instead (optional)

1. The code lives at [github.com/gabrielb150/Strms](https://github.com/gabrielb150/Strms).
2. In GitHub: repo → **Settings → Actions → General → Workflow permissions** → choose **Read and write permissions** (the weekly job needs to commit the new week).
3. On [vercel.com](https://vercel.com): **Add New → Project**, pick the repository, keep the defaults (`vercel.json` already sets the build) and click **Deploy**. On Netlify: build command `npm run build`, publish directory `out`. The site needs no keys; it only reads the files in `data/`.

From then on, every weekly commit redeploys the site automatically. If you'd rather use a Vercel **Deploy Hook**, add its URL as a GitHub secret named `VERCEL_DEPLOY_HOOK_URL` and the workflow will call it.

---

## When something goes wrong

- **A source fails** (site down, page layout changed): the week is still published with the other sources, the site shows which sources were included, and a GitHub issue labelled `source-warning` is opened (or updated).
- **The whole run fails:** nothing is committed, so **last week's chart stays live**, and an issue labelled `pipeline-failure` is opened with the error. Fix the cause, then use **Run workflow** again.
- **Review the matching:** each week writes `data/logs/<week>-matching.json` with:
  - `unmatched`: songs that couldn't be matched to a Spotify song. Most are genuinely not on Spotify's top 200, like big Indian or Brazilian YouTube hits. They still count; they're listed so you can check them.
  - `fuzzy`: matches made by the looser rules (e.g. a one-letter title difference). Skim these for mistakes.

  If you spot a wrong match, the rules live in `lib/pipeline/normalize.ts` and `lib/pipeline/match.ts`, with tests in `tests/matching.test.ts`. Run `npm test` after a change, then `npm run rebuild`.

---

## Adding Chartmetric or Luminate later

Empty adapters are already in place: `lib/pipeline/adapters/chartmetric.ts` and `lib/pipeline/adapters/luminate.ts`. Each file has step-by-step comments. In short:

1. Add the key to `.env.local` and to the GitHub secrets (`CHARTMETRIC_REFRESH_TOKEN` or `LUMINATE_API_KEY`). The workflow already passes them through.
2. Fill in the adapter's `fetch()` so it returns each platform's chart in the same shape the free adapters use. Include ISRCs and platform IDs when the source has them, because matching uses those first.
3. In `config/pipeline.json` set `"enabled": true` for it. It's already first in `priority`, so for any platform it covers it **replaces** the free source automatically.
4. If it gives real streams for every platform, the chart switches to **Combined Streams** on its own. Nothing else to change.

---

## Good to know (limits of free data)

- **YouTube runs about a week behind.** YouTube's weekly charts come out later than Spotify's, so each chart uses the latest YouTube week available; the site shows which week next to YouTube.
- **YouTube total is partial.** There's no fetchable global YouTube chart (YouTube's robots.txt blocks it), so views are summed over the country charts kworb has updated that week (~60). Songs only count where they charted.
- **Apple Music is ranks only**, and it's a daily chart: the update-day snapshot is used.
- **Spotify follower counts aren't available.** Spotify removed them from the API in 2026.
- **Weeks before Oct 22, 2026 are "reconstructed"** from Internet Archive snapshots of the source pages and are marked on the site. Many have only Spotify, some have Spotify + YouTube or Spotify + Apple, and the week of Oct 8 is missing. Treat movement in that period as approximate. To try again for other weeks: `npm run backfill -- --from=2026-07-01`.
- **Not used:** Spotify's and YouTube's own chart APIs (their robots.txt disallows bots) and Billboard (no public API, ranks only).
- Raw pages are saved compressed in `data/raw/` (~1.5 MB per week) so no week is ever downloaded twice.

---

## Where things are

```
app/                    the website (home, artist pages, About the data)
components/             tables, cards, chart
config/scoring.json     weights and score settings
config/pipeline.json    sources on/off, order, user agent, request delay
data/weeks/             one JSON file per chart week (the history)
data/raw/               saved original pages, per week
data/logs/              matching review files
data/registry.json      keeps every artist/song on the same id across weeks
data/meta/              current photos/genres (Spotify) and countries (MusicBrainz)
lib/build-week.ts       ranking, movement, peaks, weeks on chart, highlights
lib/pipeline/           adapters, matching, the weekly run
scripts/                command-line entry points (pipeline, backfill, rebuild, mock)
tests/                  automated tests (npm test)
```

| Command | What it does |
|---|---|
| `npm run dev` | Run the site locally |
| `npm run build` | Build the static site into `out/` |
| `npm run pipeline` | Fetch and build the latest week |
| `npm run rebuild` | Rebuild all weeks from saved pages (after changing weights or matching) |
| `npm run backfill` | Rebuild past weeks from Internet Archive snapshots |
| `npm test` | Run the tests |
| `npm run mock` | Fictional sample data for design work (refuses to run if real weeks exist) |

Personal, non-commercial project. Not affiliated with Spotify, Apple, YouTube or kworb.
