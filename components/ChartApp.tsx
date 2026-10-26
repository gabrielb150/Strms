"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { countryName, dateTime, flag, PLATFORM_LABEL, score as fmtScore, shortDate, weekRange } from "@/lib/format";
import type { ArtistEntry, PlatformId, SongEntry, WeekFile } from "@/lib/types";
import { PLATFORMS } from "@/lib/types";
import { Avatar, InfoTip, Movement, Num, PlatformBadges } from "./ui";

type Tab = "artists" | "songs";
type SortKey = "combined" | PlatformId;

interface Props {
  initialWeek: WeekFile;
  weeks: string[]; // newest first
}

export default function ChartApp({ initialWeek, weeks }: Props) {
  const [data, setData] = useState<WeekFile>(initialWeek);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("artists");
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [country, setCountry] = useState("");
  const [newOnly, setNewOnly] = useState(false);
  const [allThree, setAllThree] = useState(false);
  const [sort, setSort] = useState<SortKey>("combined");

  // Read ?week= and ?tab= once on load so links to past weeks are shareable.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get("tab");
    if (t === "songs" || t === "artists") setTab(t);
    const w = params.get("week");
    if (w && w !== initialWeek.week && weeks.includes(w)) void loadWeek(w);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (data.week !== weeks[0]) params.set("week", data.week);
    if (tab !== "artists") params.set("tab", tab);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [data.week, tab, weeks]);

  async function loadWeek(week: string) {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data/weeks/${week}.json`);
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as WeekFile);
    } catch (e) {
      console.error("Could not load week", week, e);
    } finally {
      setLoading(false);
    }
  }

  const genres = useMemo(() => [...new Set(Object.values(data.artists).flatMap((a) => a.genres))].sort(), [data]);
  const countries = useMemo(
    () => [...new Set(Object.values(data.artists).map((a) => a.country).filter(Boolean) as string[])].sort((a, b) => countryName(a).localeCompare(countryName(b))),
    [data],
  );

  const included = data.sources.filter((s) => s.included).map((s) => s.platform);
  const isStreams = data.scoreMode === "combined_streams";

  return (
    <div className="pt-6">
      {data.isMock && (
        <div className="mb-4 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <strong>Mock data.</strong> Fictional artists and numbers for previewing the design. Real data replaces this once the pipeline runs.
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Weekly chart · {weekRange(data.week)}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Global Top 100</h1>
          <p className="mt-1 text-sm text-zinc-500">Last updated {dateTime(data.generatedAt)}</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-zinc-500">Chart week</span>
          <select
            value={data.week}
            onChange={(e) => void loadWeek(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 font-medium shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {weeks.map((w, i) => (
              <option key={w} value={w}>
                {weekRange(w)}
                {i === 0 ? " (latest)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SourcesBar data={data} />

      <div className={loading ? "pointer-events-none opacity-50 transition-opacity" : "transition-opacity"}>
        <SummaryCards data={data} tab={tab} />

        {/* Tabs */}
        <div className="mt-8 flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800">
          {(["artists", "songs"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold capitalize ${
                tab === t ? "border-accent text-zinc-900 dark:text-zinc-50" : "border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
              }`}
            >
              Top {t}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tab === "artists" ? "Search artists" : "Search songs or artists"}
                className="w-full rounded-lg border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm shadow-sm placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900"
              />
            </div>
            <SortToggle sort={sort} setSort={setSort} included={included} />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Select value={genre} onChange={setGenre} label="All genres" options={genres.map((g) => [g, g])} />
            <Select value={country} onChange={setCountry} label="All countries" options={countries.map((c) => [c, `${flag(c)} ${countryName(c)}`])} />
            <Check checked={newOnly} onChange={setNewOnly} label="New entries only" />
            <Check checked={allThree} onChange={setAllThree} label="On all 3 platforms" />
            {(query || genre || country || newOnly || allThree || sort !== "combined") && (
              <button
                onClick={() => {
                  setQuery(""); setGenre(""); setCountry(""); setNewOnly(false); setAllThree(false); setSort("combined");
                }}
                className="px-2 py-1 text-zinc-500 underline-offset-2 hover:underline"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {tab === "artists" ? (
          <ArtistTable data={data} filters={{ query, genre, country, newOnly, allThree }} sort={sort} isStreams={isStreams} />
        ) : (
          <SongTable data={data} filters={{ query, genre, country, newOnly, allThree }} sort={sort} isStreams={isStreams} />
        )}
      </div>
    </div>
  );
}

/* ---------- Sources ---------- */

function SourcesBar({ data }: { data: WeekFile }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
      <span className="text-zinc-500">Sources this week:</span>
      {data.sources.map((s) => (
        <span
          key={s.id}
          title={s.warning ?? `${s.label} · ${s.scope}`}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 ring-inset ${
            s.included
              ? "bg-white text-zinc-700 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800"
              : "bg-rose-50 text-rose-700 line-through decoration-rose-400/60 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30"
          }`}
        >
          <span className={`size-1.5 rounded-full ${s.included ? "bg-emerald-500" : "bg-rose-500"}`} />
          {PLATFORM_LABEL[s.platform]}
          <span className="text-zinc-400 no-underline">
            {s.dataType === "ranks_only" ? "ranks only" : s.dataType === "real_streams" ? "real streams" : "real views"}
          </span>
          {s.included && s.chartWeek && s.platform !== "apple" && s.chartWeek !== data.week && (
            <span className="text-amber-600 dark:text-amber-400">· week ending {shortDate(s.chartWeek).replace(/, \d{4}$/, "")}</span>
          )}
        </span>
      ))}
      {data.sources.some((s) => s.reconstructed) && (
        <span className="text-amber-700 dark:text-amber-400" title="Rebuilt from Internet Archive snapshots of the source pages">Reconstructed week (archived snapshots).</span>
      )}
      {data.sources.some((s) => !s.included) && (
        <span className="text-rose-600 dark:text-rose-400">Some sources were unavailable; the chart uses the rest.</span>
      )}
    </div>
  );
}

/* ---------- Summary cards ---------- */

function SummaryCards({ data, tab }: { data: WeekFile; tab: Tab }) {
  const h = data.highlights;
  const cards =
    tab === "artists"
      ? [
          { label: "#1 Artist", hl: h.topArtist },
          { label: "#1 Song", hl: h.topSong },
          { label: "Biggest gainer", hl: h.biggestGainerArtist },
          { label: "Top new entry", hl: h.topNewArtist },
        ]
      : [
          { label: "#1 Song", hl: h.topSong },
          { label: "#1 Artist", hl: h.topArtist },
          { label: "Biggest gainer", hl: h.biggestGainerSong },
          { label: "Top new entry", hl: h.topNewSong },
        ];
  return (
    <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map(({ label, hl }) => {
        if (!hl) {
          return (
            <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
              <p className="mt-3 text-sm text-zinc-400">None this week</p>
            </div>
          );
        }
        const isArtist = hl.kind === "artist";
        const artist = isArtist ? data.artists[hl.id] : data.artists[data.songs[hl.id].artistIds[0]];
        const song = isArtist ? null : data.songs[hl.id];
        const title = song ? song.title : artist.name;
        const sub = song ? song.artistIds.map((a) => data.artists[a]?.name).join(", ") : artist.genres.join(" · ");
        return (
          <Link
            key={label}
            href={`/artist/${artist.id}/`}
            className="group rounded-xl border border-zinc-200 bg-white p-4 transition hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
            <div className="mt-3 flex items-center gap-3">
              <Avatar id={song?.id ?? artist.id} name={title} image={song?.image ?? artist.image} size={44} rounded={song ? "md" : "full"} />
              <div className="min-w-0">
                <p className="truncate font-semibold group-hover:underline">{title}</p>
                <p className="truncate text-xs text-zinc-500">{sub}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-zinc-500 tabular">
              #{hl.rank}
              {hl.movement != null && hl.movement > 0 && <span className="ml-2 font-semibold text-emerald-600 dark:text-emerald-400">▲ {hl.movement} {hl.movement === 1 ? "place" : "places"}</span>}
              {label === "Top new entry" && <span className="ml-2 font-semibold text-accent">New this week</span>}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

/* ---------- Controls ---------- */

function SortToggle({ sort, setSort, included }: { sort: SortKey; setSort: (s: SortKey) => void; included: PlatformId[] }) {
  const options: [SortKey, string][] = [["combined", "Combined"], ...PLATFORMS.map((p) => [p, PLATFORM_LABEL[p]] as [SortKey, string])];
  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-sm text-zinc-500 md:inline">Sort by</span>
      <div role="radiogroup" aria-label="Sort by" className="flex overflow-x-auto rounded-lg border border-zinc-300 bg-white p-0.5 text-sm shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
        {options.map(([k, label]) => {
          const disabled = k !== "combined" && !included.includes(k);
          return (
            <button
              key={k}
              role="radio"
              aria-checked={sort === k}
              disabled={disabled}
              onClick={() => setSort(k)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                sort === k ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Select({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: [string, string][] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={`rounded-lg border bg-white px-2.5 py-1.5 capitalize shadow-sm dark:bg-zinc-900 ${value ? "border-accent text-accent" : "border-zinc-300 dark:border-zinc-700"}`}
    >
      <option value="">{label}</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label
      className={`flex cursor-pointer select-none items-center gap-2 rounded-lg border px-2.5 py-1.5 shadow-sm ${
        checked ? "border-accent bg-accent/10 text-accent" : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
      }`}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[#7c5cff]" />
      {label}
    </label>
  );
}

/* ---------- Tables ---------- */

interface Filters {
  query: string;
  genre: string;
  country: string;
  newOnly: boolean;
  allThree: boolean;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function sortEntries<T extends ArtistEntry | SongEntry>(rows: T[], sort: SortKey): T[] {
  if (sort === "combined") return rows;
  return [...rows].sort((a, b) => (a.platforms[sort]?.rank ?? Infinity) - (b.platforms[sort]?.rank ?? Infinity) || a.rank - b.rank);
}

function passesCommon(e: ArtistEntry | SongEntry, f: Filters) {
  if (f.newOnly && e.status !== "new") return false;
  if (f.allThree && PLATFORMS.some((p) => !e.platforms[p])) return false;
  return true;
}

function ScoreHeader({ isStreams }: { isStreams: boolean }) {
  return isStreams ? (
    <>Streams<InfoTip text="Real combined streams across platforms" /></>
  ) : (
    <>Score<InfoTip text="Calculated chart points (not streams). See About the data." /></>
  );
}

const TH = "px-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500";
const TD = "px-2 py-2.5 align-middle";

function ArtistTable({ data, filters, sort, isStreams }: { data: WeekFile; filters: Filters; sort: SortKey; isStreams: boolean }) {
  const q = norm(filters.query.trim());
  const rows = sortEntries(
    data.artistChart.filter((e) => {
      const a = data.artists[e.artistId];
      if (q && !norm(a.name).includes(q)) return false;
      if (filters.genre && !a.genres.includes(filters.genre)) return false;
      if (filters.country && a.country !== filters.country) return false;
      return passesCommon(e, filters);
    }),
    sort,
  );

  return (
    <TableShell count={rows.length} total={data.artistChart.length}>
      <thead>
        <tr className="border-b border-zinc-200 dark:border-zinc-800">
          <th className={`${TH} w-10 text-center`}>#</th>
          <th className={`${TH} w-12`}><span className="sr-only">Movement</span></th>
          <th className={TH}>Artist</th>
          <th className={`${TH} w-20 text-right`}><ScoreHeader isStreams={isStreams} /></th>
          <th className={`${TH} hidden w-48 md:table-cell`}>Platform ranks</th>
          <th className={`${TH} hidden w-40 whitespace-nowrap text-right lg:table-cell`}>Spotify streams<InfoTip text="Real streams: sum of this artist's lead-credit songs in the Spotify weekly top 200" /></th>
          <th className={`${TH} hidden w-40 whitespace-nowrap text-right lg:table-cell`}>YouTube views<InfoTip text="Real views: sum of this artist's lead-credit songs across YouTube country charts" /></th>
          <th className={`${TH} hidden w-14 text-right sm:table-cell`}>Wks</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => {
          const a = data.artists[e.artistId];
          return (
            <tr key={e.artistId} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40">
              <td className={`${TD} text-center text-base font-bold tabular`}>{e.rank}</td>
              <td className={TD}><Movement entry={e} /></td>
              <td className={TD}>
                <Link href={`/artist/${a.id}/`} className="group flex min-w-0 items-center gap-3">
                  <Avatar id={a.id} name={a.name} image={a.image} size={40} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold group-hover:underline">{a.name}</p>
                    <p className="truncate text-xs capitalize text-zinc-500">
                      {flag(a.country)} {a.genres.join(" · ")}
                    </p>
                    <div className="mt-1 md:hidden"><PlatformBadges platforms={e.platforms} derived /></div>
                  </div>
                </Link>
              </td>
              <td className={`${TD} text-right font-semibold tabular`}>{isStreams ? <Num value={e.score} unit="streams" /> : fmtScore(e.score)}</td>
              <td className={`${TD} hidden md:table-cell`}><PlatformBadges platforms={e.platforms} derived /></td>
              <td className={`${TD} hidden text-right lg:table-cell`}><Num value={e.platforms.spotify?.value} unit="streams" /></td>
              <td className={`${TD} hidden text-right lg:table-cell`}><Num value={e.platforms.youtube?.value} unit="views" /></td>
              <td className={`${TD} hidden text-right text-zinc-500 tabular sm:table-cell`}>{e.weeksOnChart}</td>
            </tr>
          );
        })}
      </tbody>
    </TableShell>
  );
}

function SongTable({ data, filters, sort, isStreams }: { data: WeekFile; filters: Filters; sort: SortKey; isStreams: boolean }) {
  const q = norm(filters.query.trim());
  const rows = sortEntries(
    data.songChart.filter((e) => {
      const s = data.songs[e.songId];
      const credited = s.artistIds.map((id) => data.artists[id]).filter(Boolean);
      if (q && !norm(s.title).includes(q) && !credited.some((a) => norm(a.name).includes(q))) return false;
      if (filters.genre && !credited.some((a) => a.genres.includes(filters.genre))) return false;
      if (filters.country && !credited.some((a) => a.country === filters.country)) return false;
      return passesCommon(e, filters);
    }),
    sort,
  );

  return (
    <TableShell count={rows.length} total={data.songChart.length}>
      <thead>
        <tr className="border-b border-zinc-200 dark:border-zinc-800">
          <th className={`${TH} w-10 text-center`}>#</th>
          <th className={`${TH} w-12`}><span className="sr-only">Movement</span></th>
          <th className={TH}>Song</th>
          <th className={`${TH} w-20 text-right`}><ScoreHeader isStreams={isStreams} /></th>
          <th className={`${TH} hidden w-48 md:table-cell`}>Platform ranks</th>
          <th className={`${TH} hidden w-40 whitespace-nowrap text-right lg:table-cell`}>Spotify streams<InfoTip text="Real weekly streams, Spotify global chart" /></th>
          <th className={`${TH} hidden w-40 whitespace-nowrap text-right lg:table-cell`}>YouTube views<InfoTip text="Real weekly views, summed across YouTube country charts" /></th>
          <th className={`${TH} hidden w-14 text-right sm:table-cell`}>Wks</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => {
          const s = data.songs[e.songId];
          const [lead, ...feat] = s.artistIds.map((id) => data.artists[id]).filter(Boolean);
          return (
            <tr key={e.songId} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40">
              <td className={`${TD} text-center text-base font-bold tabular`}>{e.rank}</td>
              <td className={TD}><Movement entry={e} /></td>
              <td className={TD}>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar id={s.id} name={s.title} image={s.image} size={40} rounded="md" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.title}</p>
                    <p className="truncate text-xs text-zinc-500">
                      <Link href={`/artist/${lead.id}/`} className="hover:underline">{lead.name}</Link>
                      {feat.map((a, i) => (
                        <span key={a.id}>
                          {i === 0 ? " feat. " : ", "}
                          <Link href={`/artist/${a.id}/`} className="hover:underline">{a.name}</Link>
                        </span>
                      ))}
                    </p>
                    <div className="mt-1 md:hidden"><PlatformBadges platforms={e.platforms} /></div>
                  </div>
                </div>
              </td>
              <td className={`${TD} text-right font-semibold tabular`}>{isStreams ? <Num value={e.score} unit="streams" /> : fmtScore(e.score)}</td>
              <td className={`${TD} hidden md:table-cell`}><PlatformBadges platforms={e.platforms} /></td>
              <td className={`${TD} hidden text-right lg:table-cell`}><Num value={e.platforms.spotify?.value} unit="streams" /></td>
              <td className={`${TD} hidden text-right lg:table-cell`}><Num value={e.platforms.youtube?.value} unit="views" /></td>
              <td className={`${TD} hidden text-right text-zinc-500 tabular sm:table-cell`}>{e.weeksOnChart}</td>
            </tr>
          );
        })}
      </tbody>
    </TableShell>
  );
}

function TableShell({ children, count, total }: { children: React.ReactNode; count: number; total: number }) {
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs text-zinc-500">
        {count === total ? `${total} entries` : `Showing ${count} of ${total}`}
      </p>
      <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        {count === 0 ? (
          <p className="p-8 text-center text-sm text-zinc-500">Nothing matches these filters.</p>
        ) : (
          <table className="w-full table-fixed text-sm">
            {children}
          </table>
        )}
      </div>
    </div>
  );
}
