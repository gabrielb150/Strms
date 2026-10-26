// Combined chart scoring. Used by the weekly pipeline and the mock data generator,
// so the numbers you see in the mock UI come from exactly the same formula.

import type { PlatformId, ScoreMode, ValueKind } from "./types";

export interface ScoringConfig {
  weights: Partial<Record<PlatformId, number>>;
  rankCurve: {
    fitToReference: PlatformId | null;
    fallbackExponent: number;
    minExponent: number;
    maxExponent: number;
  };
  chartSize: number;
  combinedStreams: { youtubeViewFactor: number };
}

export interface RankedRow {
  rank: number;
  value: number | null;
}

/** Keep only the weights of included platforms and rescale them to sum to 1. */
export function normalizeWeights(
  weights: Partial<Record<PlatformId, number>>,
  included: PlatformId[],
): Partial<Record<PlatformId, number>> {
  const total = included.reduce((sum, p) => sum + (weights[p] ?? 0), 0);
  const out: Partial<Record<PlatformId, number>> = {};
  for (const p of included) out[p] = total > 0 ? (weights[p] ?? 0) / total : 1 / included.length;
  return out;
}

/**
 * Fit k in value(rank) ≈ value(1) * rank^(-k) by least squares on log–log data.
 * This tells us how steeply real streams fall off with rank this week, so ranks-only
 * platforms (Apple Music) are converted to points on the same curve.
 */
export function fitRankExponent(rows: RankedRow[], cfg: ScoringConfig["rankCurve"], maxRank = 100): number {
  const pts = rows
    .filter((r) => r.value != null && r.value > 0 && r.rank <= maxRank)
    .map((r) => [Math.log(r.rank), Math.log(r.value as number)] as const);
  if (pts.length < 10) return cfg.fallbackExponent;
  const n = pts.length;
  const mx = pts.reduce((s, [x]) => s + x, 0) / n;
  const my = pts.reduce((s, [, y]) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (const [x, y] of pts) {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  }
  if (den === 0) return cfg.fallbackExponent;
  const k = -num / den;
  return clamp(k, cfg.minExponent, cfg.maxExponent);
}

/** Points for a real number: share of that platform's #1, scaled to 100. */
export function valuePoints(value: number, topValue: number): number {
  return topValue > 0 ? (100 * value) / topValue : 0;
}

/** Points for a rank-only position: 100 * rank^(-k). */
export function rankPoints(rank: number, exponent: number): number {
  return 100 * Math.pow(rank, -exponent);
}

/**
 * The chart switches to real combined streams only when at least two platforms are included and every
 * one of them reports streams. A single platform is never presented as "combined".
 */
export function chooseScoreMode(kinds: ValueKind[]): ScoreMode {
  return kinds.length >= 2 && kinds.every((k) => k === "streams") ? "combined_streams" : "combined_score";
}

export function weightedScore(
  points: Partial<Record<PlatformId, number>>,
  weights: Partial<Record<PlatformId, number>>,
): number {
  let s = 0;
  for (const [p, w] of Object.entries(weights) as [PlatformId, number][]) s += w * (points[p] ?? 0);
  return round1(s);
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
