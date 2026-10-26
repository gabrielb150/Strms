import { describe, expect, it } from "vitest";
import { buildWeek, type PlatformInput } from "../lib/build-week";
import { chooseScoreMode, fitRankExponent, normalizeWeights, rankPoints, valuePoints, type ScoringConfig } from "../lib/scoring";
import type { Artist, Song, SourceStatus, WeekFile } from "../lib/types";
import scoring from "../config/scoring.json";

const config = scoring as unknown as ScoringConfig;

describe("scoring", () => {
  it("renormalizes weights over included platforms", () => {
    const w = normalizeWeights({ spotify: 0.45, youtube: 0.3, apple: 0.25 }, ["spotify", "apple"]);
    expect(w.spotify! + w.apple!).toBeCloseTo(1);
    expect(w.youtube).toBeUndefined();
    expect(w.spotify! / w.apple!).toBeCloseTo(0.45 / 0.25);
  });
  it("fits the rank curve exponent to real streams", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ rank: i + 1, value: 1e6 * Math.pow(i + 1, -0.32) }));
    expect(fitRankExponent(rows, config.rankCurve)).toBeCloseTo(0.32, 2);
    expect(fitRankExponent([], config.rankCurve)).toBe(config.rankCurve.fallbackExponent);
  });
  it("gives the #1 100 points either way", () => {
    expect(valuePoints(500, 500)).toBe(100);
    expect(rankPoints(1, 0.3)).toBe(100);
    expect(rankPoints(10, 0.3)).toBeCloseTo(50.1, 1);
  });
  it("switches to combined streams only when every platform reports streams", () => {
    expect(chooseScoreMode(["streams", "views", null])).toBe("combined_score");
    expect(chooseScoreMode(["streams", "views"])).toBe("combined_score");
    expect(chooseScoreMode(["streams", "streams", "streams"])).toBe("combined_streams");
    expect(chooseScoreMode(["streams"])).toBe("combined_score"); // one platform is not "combined"
  });
});

describe("buildWeek", () => {
  const artists: Record<string, Artist> = Object.fromEntries(
    ["a", "b", "c"].map((id) => [id, { id, name: id.toUpperCase(), image: null, country: null, genres: [], platformIds: {} }]),
  );
  const songs: Record<string, Song> = {
    s1: { id: "s1", title: "One", artistIds: ["a"], isrc: null, image: null, platformIds: {} },
    s2: { id: "s2", title: "Two", artistIds: ["b", "a"], isrc: null, image: null, platformIds: {} },
    s3: { id: "s3", title: "Three", artistIds: ["c"], isrc: null, image: null, platformIds: {} },
  };
  const src = (platform: SourceStatus["platform"], included = true): SourceStatus => ({
    id: platform, label: platform, platform, included, dataType: "real_streams", scope: "", chartWeek: null, fetchedAt: null, warning: null, reconstructed: false,
  });
  const input = (week: string, sp: [string, number, number][], prev: WeekFile[] = [], appleUp = true): Parameters<typeof buildWeek>[0] => ({
    week, generatedAt: `${week}T00:00:00Z`, isMock: false, artists, songs, previousWeeks: prev, config: { ...config, chartSize: 2 },
    platforms: [
      { platform: "spotify", valueKind: "streams", source: src("spotify"), songRows: sp.map(([songId, rank, value]) => ({ songId, rank, value })) },
      { platform: "apple", valueKind: null, source: src("apple", appleUp), songRows: appleUp ? [{ songId: "s3", rank: 1, value: null }] : [] },
    ] as PlatformInput[],
  });

  it("ranks, tracks movement, new entries, re-entries, peaks and weeks on chart", () => {
    const w1 = buildWeek(input("2026-10-01", [["s1", 1, 100], ["s2", 2, 50]], [], false));
    expect(w1.songChart.map((e) => [e.songId, e.status])).toEqual([["s1", "new"], ["s2", "new"]]);
    expect(w1.sources.find((s) => s.platform === "apple")!.included).toBe(false);
    expect(w1.weights.spotify).toBe(1); // Apple missing → Spotify weight renormalized to 1

    const w2 = buildWeek(input("2026-10-08", [["s2", 1, 100], ["s1", 2, 90]], [w1], false));
    expect(w2.songChart[0]).toMatchObject({ songId: "s2", status: "up", movement: 1, peak: 1, weeksOnChart: 2 });
    expect(w2.songChart[1]).toMatchObject({ songId: "s1", status: "down", movement: -1, peak: 1 });
    expect(w2.highlights.biggestGainerSong?.id).toBe("s2");

    const w3 = buildWeek(input("2026-10-15", [["s1", 1, 100], ["s2", 2, 10]], [w1, w2]));
    expect(w3.songChart.map((e) => e.songId)).toEqual(["s1", "s3"]); // s3 is #1 on Apple (100 pts × 0.25 weight)
    expect(w3.songChart[1].status).toBe("new");

    const w4 = buildWeek(input("2026-10-22", [["s2", 1, 100], ["s1", 2, 99]], [w1, w2, w3], false));
    expect(w4.songChart[0]).toMatchObject({ songId: "s2", status: "re-entry", movement: null, weeksOnChart: 3, peak: 1 });
  });

  it("does not compare against a non-adjacent week when one is missing", () => {
    const w1 = buildWeek(input("2026-10-01", [["s1", 1, 100], ["s2", 2, 50]], [], false));
    const w3 = buildWeek(input("2026-10-15", [["s2", 1, 100], ["s1", 2, 90]], [w1], false));
    expect(w3.songChart[0]).toMatchObject({ songId: "s2", status: "no-data", movement: null, previousRank: null, weeksOnChart: 2 });
    expect(w3.highlights.biggestGainerSong).toBeNull();
  });

  it("credits songs to the lead artist and lists top songs incl. features", () => {
    const w = buildWeek(input("2026-10-01", [["s1", 1, 100], ["s2", 2, 60]]));
    const a = w.artistChart.find((e) => e.artistId === "a")!;
    const b = w.artistChart.find((e) => e.artistId === "b");
    expect(a.platforms.spotify!.value).toBe(100); // only s1: a is lead there, featured on s2
    expect(b?.platforms.spotify!.value).toBe(60);
    expect(a.topSongIds).toEqual(["s1", "s2"]);
  });

  it("never labels the score as streams in combined_score mode", () => {
    const w = buildWeek(input("2026-10-01", [["s1", 1, 100]]));
    expect(w.scoreMode).toBe("combined_score");
    expect(w.songChart.every((e) => e.combinedStreams === null)).toBe(true);
  });
});
