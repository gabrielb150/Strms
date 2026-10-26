// Shared data model for the weekly chart files in /data/weeks/<YYYY-MM-DD>.json.
// The pipeline writes these files and the website only reads them.

export type PlatformId = "spotify" | "apple" | "youtube";
export const PLATFORMS: PlatformId[] = ["spotify", "apple", "youtube"];

/** What a real number on a platform measures. `null` means the platform gives ranks only. */
export type ValueKind = "streams" | "views" | null;

/** How the combined chart was ranked this week. */
export type ScoreMode =
  | "combined_score" // weighted chart points (free data: not a stream count)
  | "combined_streams"; // true sum of per-platform streams (when every platform reports streams)

export interface PlatformStat {
  /** Position on that platform's chart, or null if derived (e.g. artist totals) and unranked. */
  rank: number | null;
  /** Real reported number (streams or views), or null if the platform only gives ranks. */
  value: number | null;
  valueKind: ValueKind;
  /** Chart points (0–100) used for the Combined Score. Always calculated, never a stream count. */
  points: number;
}

export type PlatformStats = Partial<Record<PlatformId, PlatformStat>>;

export interface Artist {
  id: string;
  name: string;
  image: string | null;
  country: string | null; // ISO 3166-1 alpha-2
  genres: string[];
  platformIds: Partial<Record<PlatformId, string>>;
}

/** "no-data": charted before, but the previous week is missing from the archive, so movement is unknown. */
export type EntryStatus = "up" | "down" | "same" | "new" | "re-entry" | "no-data";

export interface ChartPosition {
  rank: number;
  previousRank: number | null;
  /** Positive = moved up. Null for new entries and re-entries. */
  movement: number | null;
  status: EntryStatus;
  peak: number;
  weeksOnChart: number;
  /** Combined Score (calculated). In combined_streams mode this equals combinedStreams. */
  score: number;
  /** Real combined streams, only set when scoreMode is "combined_streams". */
  combinedStreams: number | null;
  platforms: PlatformStats;
}

export interface ArtistTopSong {
  songId: string;
  /** Position on this week's combined song chart, or null if outside the Top 100. */
  chartRank: number | null;
  score: number;
  platforms: PlatformStats;
}

export interface ArtistEntry extends ChartPosition {
  artistId: string;
  /** This artist's 3 best songs this week (lead or featured), including songs outside the Top 100. */
  topSongIds: string[];
  topSongs: ArtistTopSong[];
}

export interface Song {
  id: string;
  title: string;
  /** Lead artist first, then featured / collaborating artists. */
  artistIds: string[];
  isrc: string | null;
  image: string | null;
  platformIds: Partial<Record<PlatformId, string>>;
}

export interface SongEntry extends ChartPosition {
  songId: string;
}

export interface SourceStatus {
  id: string;
  label: string;
  platform: PlatformId;
  included: boolean;
  /** What the numbers from this source are: real counts or ranks only. */
  dataType: "real_streams" | "real_views" | "ranks_only";
  /** Plain-language scope note, e.g. "Sum of ~60 country charts". */
  scope: string;
  /** The week (or day, for daily charts) this source's data covers. May lag the chart week. */
  chartWeek: string | null;
  fetchedAt: string | null;
  warning: string | null;
  /** True when this week was rebuilt from archived snapshots instead of a live fetch. */
  reconstructed: boolean;
}

export interface Highlight {
  kind: "artist" | "song";
  id: string;
  rank: number;
  movement: number | null;
}

export interface WeekFile {
  schemaVersion: 1;
  /** Chart week end date (YYYY-MM-DD). Spotify and YouTube weeks end on Thursday. */
  week: string;
  generatedAt: string;
  isMock: boolean;
  scoreMode: ScoreMode;
  /** Weights actually applied this week (already renormalized over included sources). */
  weights: Partial<Record<PlatformId, number>>;
  /** Exponent of the rank → points curve used for rank-only platforms this week. */
  rankCurveExponent: number;
  sources: SourceStatus[];
  artists: Record<string, Artist>;
  songs: Record<string, Song>;
  artistChart: ArtistEntry[];
  songChart: SongEntry[];
  highlights: {
    topArtist: Highlight | null;
    topSong: Highlight | null;
    biggestGainerArtist: Highlight | null;
    biggestGainerSong: Highlight | null;
    topNewArtist: Highlight | null;
    topNewSong: Highlight | null;
  };
}

export interface WeekIndex {
  latest: string | null;
  weeks: string[]; // newest first
}
