// Generates 8 weeks of realistic-looking MOCK chart data with fictional artists,
// pushed through the real scoring code (lib/build-week.ts). Run: npm run mock
// Every file it writes has "isMock": true and the site shows a "Mock data" banner.

import fs from "node:fs";
import path from "node:path";
import { buildWeek, type PlatformInput } from "../lib/build-week";
import type { ScoringConfig } from "../lib/scoring";
import type { Artist, PlatformId, Song, SourceStatus, WeekFile } from "../lib/types";
import scoring from "../config/scoring.json";

const OUT = path.join(process.cwd(), "data", "weeks");
const WEEKS = ["2026-09-03", "2026-09-10", "2026-09-17", "2026-09-24", "2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22"];

// Small seeded RNG so the mock data is stable between runs.
let seed = 20261022;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pickOne = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const noise = (spread: number) => 1 + (rand() * 2 - 1) * spread;

const FIRST = ["Mara", "Luca", "Inés", "Theo", "Noa", "Kenji", "Zara", "Milo", "Aurelie", "Dante", "Sol", "Yuna", "Rafa", "Elif", "Jonah", "Priya", "Ezra", "Lior", "Camila", "Otis", "Nadia", "Kai", "Bianca", "Felix", "Amara", "Joaquín", "Sienna", "Malik", "Hana", "Rocco", "Vera", "Tomás", "Leila", "August", "Ximena", "Idris", "Maëlle", "Bo", "Saoirse", "Arjun"];
const LAST = ["Vale", "Moreau", "Okafor", "Lindqvist", "Santos", "Halloway", "Park", "Rivera", "Castell", "Nakamura", "Dubois", "Achebe", "Ferraro", "Kowalski", "Reyes", "Holm", "Sato", "Mendes", "Quinn", "Varga", "Ashby", "Del Mar", "Ng", "Kaur", "Brandt", "Solís", "Oyelaran", "Marchetti", "Lowe", "Ibarra"];
const BAND_A = ["Neon", "Velvet", "Paper", "Silver", "Midnight", "Glass", "Wild", "Golden", "Static", "Lunar", "Coral", "Echo", "Polar", "Saint", "Honey"];
const BAND_B = ["Harbor", "Tigers", "Satellites", "Parade", "Ghosts", "Season", "Signals", "Rivers", "Club", "Machines", "Orchard", "Sirens", "Hours", "Frontier"];
const GENRES: [string, Partial<Record<PlatformId, number>>, string[]][] = [
  ["pop", { spotify: 1, apple: 1.05, youtube: 0.9 }, ["US", "GB", "CA", "AU", "SE"]],
  ["hip hop", { spotify: 1, apple: 1.2, youtube: 0.9 }, ["US", "GB", "CA"]],
  ["latin", { spotify: 1.05, apple: 0.6, youtube: 1.4 }, ["CO", "PR", "MX", "AR", "ES"]],
  ["k-pop", { spotify: 0.8, apple: 0.5, youtube: 1.6 }, ["KR"]],
  ["country", { spotify: 0.8, apple: 1.5, youtube: 0.7 }, ["US"]],
  ["afrobeats", { spotify: 0.9, apple: 0.7, youtube: 1.2 }, ["NG", "GH"]],
  ["indie", { spotify: 1.1, apple: 0.8, youtube: 0.6 }, ["GB", "US", "IE"]],
  ["r&b", { spotify: 1, apple: 1.1, youtube: 0.8 }, ["US", "GB"]],
  ["electronic", { spotify: 1.1, apple: 0.8, youtube: 0.7 }, ["NL", "DE", "FR", "SE"]],
  ["bollywood", { spotify: 0.6, apple: 0.3, youtube: 2.2 }, ["IN"]],
  ["sertanejo", { spotify: 0.8, apple: 0.3, youtube: 1.5 }, ["BR"]],
];
const WORDS_A = ["Midnight", "Paper", "Golden", "Slow", "Electric", "Lonely", "Sweet", "Broken", "Summer", "Velvet", "Heavy", "Little", "Wild", "Silent", "Neon", "Falling", "Cherry", "Ocean", "Second", "Last"];
const WORDS_B = ["Hearts", "Lights", "Roads", "Mirror", "Fever", "Dreams", "Signal", "Heaven", "Habits", "Kisses", "Weather", "Secrets", "Motion", "Promises", "Gravity", "Frequency", "Rodeo", "Diamonds", "Letters", "Escape"];

function slug(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
function fakeId(len: number) {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  return Array.from({ length: len }, () => chars[Math.floor(rand() * chars.length)]).join("");
}

// --- Artists ---
interface MockArtist extends Artist {
  star: number; // overall popularity 0..1
  affinity: Partial<Record<PlatformId, number>>;
}
const artists: MockArtist[] = [];
const usedNames = new Set<string>();
while (artists.length < 320) {
  const name = rand() < 0.2 ? `${pickOne(BAND_A)} ${pickOne(BAND_B)}` : rand() < 0.15 ? pickOne(FIRST).toUpperCase() : `${pickOne(FIRST)} ${pickOne(LAST)}`;
  if (usedNames.has(name)) continue;
  usedNames.add(name);
  const [genre, affinity, countries] = pickOne(GENRES);
  const second = rand() < 0.4 ? [pickOne(GENRES)[0]].filter((g) => g !== genre) : [];
  artists.push({
    id: slug(name),
    name,
    image: null,
    country: pickOne(countries),
    genres: [genre, ...second],
    platformIds: { spotify: fakeId(22), apple: String(1e9 + Math.floor(rand() * 9e8)), youtube: "UC" + fakeId(22) },
    star: Math.pow(rand(), 1.8),
    affinity,
  });
}

// --- Songs ---
interface MockSong extends Song {
  base: number;
  releaseWeek: number; // index into WEEKS; negative = released before the window
  halfLife: number; // weeks
}
const songs: MockSong[] = [];
const usedTitles = new Set<string>();
for (const a of artists) {
  const count = 1 + Math.floor(a.star * 5 + rand() * 2);
  for (let i = 0; i < count; i++) {
    let title = rand() < 0.35 ? pickOne(WORDS_B) : `${pickOne(WORDS_A)} ${pickOne(WORDS_B)}`;
    if (rand() < 0.06) title += " (Remix)";
    if (usedTitles.has(title + a.id)) continue;
    usedTitles.add(title + a.id);
    const feats = rand() < 0.22 ? [pickOne(artists).id].filter((id) => id !== a.id) : [];
    songs.push({
      id: `${slug(title)}--${a.id}`,
      title,
      artistIds: [a.id, ...feats],
      isrc: `US${fakeId(3).toUpperCase()}26${String(Math.floor(rand() * 1e5)).padStart(5, "0")}`,
      image: null,
      platformIds: { spotify: fakeId(22), apple: String(1e9 + Math.floor(rand() * 9e8)), youtube: fakeId(11) },
      base: a.star * (0.4 + rand()),
      releaseWeek: Math.floor(rand() * 30) - 22,
      halfLife: 3 + rand() * 20,
    });
  }
}
const artistById = new Map(artists.map((a) => [a.id, a]));

function popularity(s: MockSong, w: number): number {
  if (w < s.releaseWeek) return 0;
  const age = w - s.releaseWeek;
  const debutBoost = age === 0 ? 1.6 : age === 1 ? 1.2 : 1;
  return s.base * debutBoost * Math.pow(0.5, age / s.halfLife) * noise(0.08);
}

function platformRows(w: number, p: PlatformId, size: number) {
  const scored = songs
    .map((s) => ({ s, v: popularity(s, w) * (artistById.get(s.artistIds[0])!.affinity[p] ?? 1) * noise(0.25) }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, size);
  return scored.map((x, i) => {
    const rank = i + 1;
    const value =
      p === "spotify" ? Math.round(38_000_000 * Math.pow(rank, -0.34) * noise(0.04))
      : p === "youtube" ? Math.round(64_000_000 * Math.pow(rank, -0.5) * noise(0.06))
      : null;
    return { songId: x.s.id, rank, value };
  });
}

function source(id: string, label: string, platform: PlatformId, dataType: SourceStatus["dataType"], scope: string, included: boolean, week: string): SourceStatus {
  return {
    id, label, platform, included, dataType, scope,
    chartWeek: included ? week : null,
    fetchedAt: included ? `${week}T18:00:00.000Z` : null,
    warning: included ? null : "Source unavailable this week (mock failure). Chart built from the other sources.",
    reconstructed: false,
  };
}

const config = scoring as unknown as ScoringConfig;
const allArtists = Object.fromEntries(artists.map(({ star, affinity, ...a }) => [a.id, a]));
const allSongs = Object.fromEntries(songs.map(({ base, releaseWeek, halfLife, ...s }) => [s.id, s]));
const built: WeekFile[] = [];

// Never overwrite real chart data with mock data.
const real = fs.existsSync(OUT) && fs.readdirSync(OUT).some((f) => !(JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")) as WeekFile).isMock);
if (real) {
  console.error("data/weeks already contains real chart weeks; refusing to replace them with mock data.");
  process.exit(1);
}
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

WEEKS.forEach((week, w) => {
  const youtubeUp = week !== "2026-09-24"; // one week with a failed source, to show the fallback
  const platforms: PlatformInput[] = [
    { platform: "spotify", valueKind: "streams", songRows: platformRows(w, "spotify", 200),
      source: source("kworb-spotify", "Spotify Weekly Global (via kworb)", "spotify", "real_streams", "Global top 200", true, week) },
    { platform: "apple", valueKind: null, songRows: platformRows(w, "apple", 100),
      source: source("kworb-apple", "Apple Music Worldwide (via kworb)", "apple", "ranks_only", "Worldwide top 100, ranks only", true, week) },
    { platform: "youtube", valueKind: "views", songRows: youtubeUp ? platformRows(w, "youtube", 300) : [],
      source: source("kworb-youtube", "YouTube Weekly (via kworb)", "youtube", "real_views", "YouTube overall — sum of ~60 country charts", youtubeUp, week) },
  ];
  const file = buildWeek({
    week, generatedAt: `${week}T18:05:00.000Z`, isMock: true,
    artists: allArtists, songs: allSongs, platforms, previousWeeks: built, config,
  });
  built.push(file);
  fs.writeFileSync(path.join(OUT, `${week}.json`), JSON.stringify(file, null, 1));
  console.log(`wrote ${week}.json  (${file.songChart.length} songs, ${file.artistChart.length} artists)`);
});
