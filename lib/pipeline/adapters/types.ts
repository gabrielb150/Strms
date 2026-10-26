// Every data source is an adapter with the same output shape.
// To add a source: create a file in this folder, implement SourceAdapter, register it in ./index.ts.

import type { PlatformId, SourceStatus, ValueKind } from "../../types";

export interface AdapterSongRow {
  rank: number;
  title: string;
  /** Credited artist names, lead first. */
  artists: string[];
  /** Real number reported by the source (streams or views), or null for ranks only. */
  value: number | null;
  /** Original text as the source printed it, for the review logs. */
  raw: string;
  isrc?: string;
  spotifyTrackId?: string;
  spotifyArtistIds?: string[];
  appleId?: string;
  youtubeVideoId?: string;
}

export interface AdapterArtistRow {
  rank: number;
  name: string;
  value: number | null;
  spotifyArtistId?: string;
}

/** One platform's chart as delivered by a source. A paid source may return several platforms. */
export interface PlatformChart {
  platform: PlatformId;
  valueKind: ValueKind;
  dataType: SourceStatus["dataType"];
  /** Week end date (or snapshot date) the data covers, YYYY-MM-DD. */
  chartWeek: string | null;
  scope: string;
  songs: AdapterSongRow[];
  /** Official artist chart, if the source has one. Otherwise artist totals are derived from songs. */
  artists?: AdapterArtistRow[];
  /**
   * Optional: several sub-charts whose rows should be summed per song (e.g. YouTube country charts).
   * When set, `songs` is ignored and the pipeline aggregates these after matching.
   */
  subCharts?: { id: string; songs: AdapterSongRow[] }[];
}

export interface AdapterContext {
  /** The chart week we expect to build (YYYY-MM-DD, a Thursday). */
  expectedWeek: string;
  /** Folder for this adapter's raw responses, e.g. data/raw/2026-10-22/kworb-spotify. */
  rawDir: string;
  /** Use only stored raw responses, never the network. */
  offline: boolean;
  log: (msg: string) => void;
  warn: (msg: string) => void;
}

export interface SourceAdapter {
  id: string;
  label: string;
  /** Platforms this adapter can supply. */
  platforms: PlatformId[];
  /** False when required API keys are missing; the pipeline then skips it quietly. */
  isConfigured(): boolean;
  fetch(ctx: AdapterContext): Promise<PlatformChart[]>;
}

export class SourceNotImplementedError extends Error {}
