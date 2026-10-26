import Link from "next/link";
import { notFound } from "next/navigation";
import RankHistoryChart from "@/components/RankHistoryChart";
import { Avatar, InfoTip, Movement, Num, PlatformBadges, PlatformDot } from "@/components/ui";
import { artistProfiles, weekIndex } from "@/lib/data";
import { countryName, flag, PLATFORM_LABEL, score as fmtScore, weekRange } from "@/lib/format";
import { PLATFORMS, type PlatformId } from "@/lib/types";

export const dynamicParams = false;

export function generateStaticParams() {
  return [...artistProfiles().keys()].map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = artistProfiles().get(id);
  return { title: p ? `${p.artist.name} · Strms` : "Artist" };
}

const PROFILE_URL: Record<PlatformId, (id: string) => string> = {
  spotify: (id) => `https://open.spotify.com/artist/${id}`,
  apple: (id) => `https://music.apple.com/artist/${id}`,
  youtube: (id) => `https://www.youtube.com/channel/${id}`,
};

export default async function ArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = artistProfiles().get(id);
  if (!profile) notFound();
  const { artist, week, entry, history } = profile;
  const isLatest = week.week === weekIndex().latest;

  // Songs this week: every charted song they're credited on (lead or featured) plus their top 3, best first.
  const songMap = new Map<string, { songId: string; chartRank: number | null; score: number; platforms: typeof entry.platforms }>();
  for (const e of week.songChart) if (week.songs[e.songId].artistIds.includes(id)) songMap.set(e.songId, { songId: e.songId, chartRank: e.rank, score: e.score, platforms: e.platforms });
  for (const t of entry.topSongs ?? []) if (!songMap.has(t.songId)) songMap.set(t.songId, t);
  const songs = [...songMap.values()].filter((e) => week.songs[e.songId]).sort((a, b) => b.score - a.score);
  const topIds = new Set(entry.topSongIds);
  const charted = history.filter((h) => h.rank != null).length;
  const tracked = history.filter((h) => !h.missing).length;

  return (
    <div className="pt-6">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">← Back to charts</Link>

      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
        <Avatar id={artist.id} name={artist.name} image={artist.image} size={96} />
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight">{artist.name}</h1>
          <p className="mt-1 text-sm capitalize text-zinc-500">
            {artist.country && <>{flag(artist.country)} {countryName(artist.country)} · </>}
            {artist.genres.join(" · ") || "Genre unknown"}
          </p>
          {!week.isMock && (
            <div className="mt-2 flex gap-3 text-xs">
              {PLATFORMS.filter((p) => artist.platformIds[p]).map((p) => (
                <a key={p} href={PROFILE_URL[p](artist.platformIds[p]!)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-zinc-500 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100">
                  <PlatformDot platform={p} /> {PLATFORM_LABEL[p]}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>

      {!isLatest && (
        <p className="mt-4 rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          Not on the latest chart. Showing the last week they charted: {weekRange(week.week)}.
        </p>
      )}

      {/* Key stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Combined rank" value={<span className="flex items-baseline gap-2">#{entry.rank} <Movement entry={entry} /></span>} />
        <Stat label="Peak" value={`#${entry.peak}`} />
        <Stat label="Weeks on chart" value={entry.weeksOnChart} />
        <Stat
          label={<>{week.scoreMode === "combined_streams" ? "Combined streams" : "Combined score"}<InfoTip text={week.scoreMode === "combined_streams" ? "Real streams summed across platforms" : "Calculated chart points, not streams"} /></>}
          value={week.scoreMode === "combined_streams" ? <Num value={entry.score} unit="streams" /> : fmtScore(entry.score)}
        />
      </div>

      {/* Per platform */}
      <h2 className="mt-10 text-lg font-semibold">By platform <span className="text-sm font-normal text-zinc-500">· week of {weekRange(week.week)}</span></h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {PLATFORMS.map((p) => {
          const s = entry.platforms[p];
          const src = week.sources.find((x) => x.platform === p);
          return (
            <div key={p} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="flex items-center gap-2 text-sm font-medium"><PlatformDot platform={p} /> {PLATFORM_LABEL[p]}</p>
              {!src?.included ? (
                <p className="mt-3 text-sm text-zinc-400">Source not included this week</p>
              ) : s ? (
                <>
                  <p className="mt-2 text-2xl font-bold tabular">#{s.rank}</p>
                  <p className="mt-1 text-sm text-zinc-500">
                    {s.value != null ? (
                      <><Num value={s.value} unit={s.valueKind ?? ""} className="font-medium text-zinc-800 dark:text-zinc-200" /> real {s.valueKind}</>
                    ) : (
                      <>Ranks only · {s.points.toFixed(1)} chart points</>
                    )}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm text-zinc-400">Not on this chart</p>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-zinc-500">Artist positions per platform are derived by adding up the artist&apos;s lead-credit songs on that platform&apos;s chart.</p>

      {/* History */}
      <h2 className="mt-10 text-lg font-semibold">Rank history <span className="text-sm font-normal text-zinc-500">· {charted} of {tracked} tracked weeks</span></h2>
      <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <RankHistoryChart history={history} />
      </div>

      {/* Songs */}
      <h2 className="mt-10 text-lg font-semibold">Songs this week <span className="text-sm font-normal text-zinc-500">· {songs.length}</span></h2>
      {songs.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No songs found for this week.</p>
      ) : (
        <ol className="mt-3 divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800/60 dark:border-zinc-800 dark:bg-zinc-900">
          {songs.map((e, i) => {
            const s = week.songs[e.songId];
            const others = s.artistIds.filter((a) => a !== id).map((a) => week.artists[a]).filter(Boolean);
            const isLead = s.artistIds[0] === id;
            return (
              <li key={e.songId} className="flex items-center gap-3 px-4 py-3">
                <span className={`w-6 text-center text-sm font-bold tabular ${topIds.has(e.songId) ? "text-accent" : "text-zinc-400"}`}>{i + 1}</span>
                <Avatar id={s.id} name={s.title} image={s.image} size={40} rounded="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{s.title}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {isLead ? "Lead artist" : "Featured"}
                    {others.length > 0 && (
                      <> · with {others.map((a, j) => (
                        <span key={a.id}>{j > 0 && ", "}<Link href={`/artist/${a.id}/`} className="hover:underline">{a.name}</Link></span>
                      ))}</>
                    )}
                  </p>
                  <div className="mt-1 sm:hidden"><PlatformBadges platforms={e.platforms} /></div>
                </div>
                <div className="hidden sm:block"><PlatformBadges platforms={e.platforms} /></div>
                <div className="w-24 text-right text-sm">
                  {e.chartRank != null ? (
                    <p className="font-semibold tabular" title="Combined song chart position">#{e.chartRank}</p>
                  ) : (
                    <p className="text-xs text-zinc-400" title="Not in the combined Top 100">Outside Top 100</p>
                  )}
                  <p className="text-xs text-zinc-500"><Num value={e.platforms.spotify?.value} unit="Spotify streams" /> <span className="text-zinc-400">SP</span></p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-2 text-xs text-zinc-500">Highlighted: this artist&apos;s top 3 songs this week by Combined Score, including features and songs outside the Top 100.</p>
    </div>
  );
}

function Stat({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <div className="mt-2 text-2xl font-bold tabular">{value}</div>
    </div>
  );
}
