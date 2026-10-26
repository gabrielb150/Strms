import scoring from "@/config/scoring.json";
import { loadWeek, weekIndex } from "@/lib/data";
import { weekRange } from "@/lib/format";

export const metadata = { title: "About the data · Combined Charts" };

export default function About() {
  const latest = weekIndex().latest;
  const week = latest ? loadWeek(latest) : null;
  const w = scoring.weights;

  return (
    <article className="mx-auto max-w-3xl pt-8 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
      <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">About the data</h1>
      <p className="mt-3">
        This is a personal chart that combines Spotify, Apple Music and YouTube into one weekly Top 100. It uses free, public
        data, so some platforms give real numbers and others give only chart positions. This page explains what is real and
        what is calculated.
      </p>

      <Section title="Real vs calculated">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
            <p className="font-semibold text-emerald-800 dark:text-emerald-300">Real numbers</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              <li><strong>Spotify streams</strong>: weekly global streams as reported on the Spotify weekly chart.</li>
              <li><strong>YouTube views</strong>: weekly views, summed across YouTube&apos;s country charts.</li>
              <li>Ranks on each platform&apos;s own chart.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-500/30 dark:bg-violet-500/10">
            <p className="font-semibold text-violet-800 dark:text-violet-300">Calculated</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              <li><strong>Combined Score</strong>: weighted chart points. It is <em>not</em> a stream count.</li>
              <li><strong>Apple Music points</strong>: converted from rank (Apple publishes no stream counts).</li>
              <li><strong>Artist positions per platform</strong>: from adding up each artist&apos;s lead-credit songs.</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Sources">
        <ul className="space-y-3">
          <li>
            <strong>Spotify</strong> · Weekly global top 200 songs with real stream counts, read from{" "}
            <a className="underline" href="https://kworb.net/spotify/country/global_weekly.html">kworb.net</a>, which allows automated access and
            republishes Spotify&apos;s chart. Artist photos and genres come from the official Spotify Web API.
          </li>
          <li>
            <strong>Apple Music</strong> · The worldwide Apple Music song chart on{" "}
            <a className="underline" href="https://kworb.net/apple_songs/">kworb.net</a>, built from Apple&apos;s country charts. Ranks only.
          </li>
          <li>
            <strong>YouTube (overall)</strong> · YouTube&apos;s weekly country charts (about 60 countries) from{" "}
            <a className="underline" href="https://kworb.net/youtube/insights/">kworb.net</a>, added up. This is YouTube as a whole, not only YouTube
            Music. Because a song only counts in countries where it charted, totals are a <em>lower bound</em> of its real global views.
            YouTube&apos;s weekly charts come out about a week after Spotify&apos;s, so each chart uses the latest YouTube week available; the
            week used is shown next to YouTube at the top of the chart.
          </li>
        </ul>
        <p className="mt-3 text-sm text-zinc-500">
          Artist country comes from MusicBrainz (open data). Not used: Spotify&apos;s and YouTube&apos;s own chart APIs (their robots.txt disallows automated access) and Billboard (no public API, ranks only).
          Every source is fetched at most once per week with a polite user agent, and raw responses are stored so the same week is never fetched twice.
        </p>
      </Section>

      <Section title="The chart week">
        <p>
          A chart week runs <strong>Friday to Thursday</strong>, matching Spotify&apos;s and YouTube&apos;s weekly charts. The site updates every Friday.
          {week && <> The current chart covers <strong>{weekRange(week.week)}</strong>.</>} Apple&apos;s chart is a rolling daily chart, so the snapshot taken on update day is used.
        </p>
      </Section>

      <Section title="How the Combined Score works">
        <ol className="list-decimal space-y-3 pl-5">
          <li>
            <strong>Points per platform (0–100).</strong> Where a platform reports real numbers, a song gets
            <Formula>points = 100 × its streams ÷ the #1 song&apos;s streams</Formula>
            So the #1 song gets 100, and a song with half as many streams gets 50.
          </li>
          <li>
            <strong>Rank-only platforms (Apple Music).</strong> A rank becomes points on a curve:
            <Formula>points = 100 × rank<sup>−k</sup></Formula>
            Each week <em>k</em> is fitted to how quickly real Spotify streams fall from #1 to #100, so that Apple&apos;s #10 is worth about what
            Spotify&apos;s #10 is worth.{week && <> This week k = {week.rankCurveExponent}.</>}
          </li>
          <li>
            <strong>Weighted sum.</strong>
            <Formula>Combined Score = {w.spotify} × Spotify + {w.youtube} × YouTube + {w.apple} × Apple</Formula>
            A song not on a platform&apos;s chart gets 0 points there. If a source is unavailable one week, the remaining weights are scaled up so they still add to 1.
          </li>
          <li>
            <strong>Artists.</strong> An artist&apos;s platform total is the sum of points of songs where they are the <em>lead</em> artist, rescaled so the top artist on each platform has 100. Featured artists are still shown on every song.
          </li>
          <li>
            <strong>When real streams are available everywhere</strong> (for example after adding paid data like Luminate), the chart switches automatically to <em>Combined Streams</em>: a plain sum of real streams, labelled as such.
          </li>
        </ol>
        <p className="mt-3 text-sm text-zinc-500">Weights are set in <code>config/scoring.json</code>. Defaults: Spotify 45%, YouTube 30%, Apple Music 25%.</p>
      </Section>

      <Section title="Movement and labels">
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>▲ / ▼</strong>: places gained or lost vs last week.</li>
          <li><strong>NEW</strong>: first time ever on this chart. <strong>RE</strong>: back after dropping off.</li>
          <li><strong>Peak</strong> and <strong>weeks on chart</strong> count only weeks tracked by this site.</li>
          <li>Numbers like 1.2B are rounded; hover or tap them to see the exact value.</li>
          <li><strong>Reconstructed</strong> weeks were rebuilt from Internet Archive snapshots of the source pages, before this site started collecting. Sources without a snapshot for that week are left out and marked.</li>
        </ul>
      </Section>

      <Section title="Matching across platforms">
        <p>
          The same song is matched across platforms by Spotify ID and ISRC first, then by carefully normalized title and artist names
          (accents, &quot;feat.&quot;, &quot;&amp;&quot;, and remix tags are handled). Anything that can&apos;t be matched confidently is logged for review instead of being merged by guess.
        </p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-3 text-xl font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
      {children}
    </section>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return <code className="my-2 block rounded-lg bg-zinc-100 px-3 py-2 font-mono text-sm text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">{children}</code>;
}
