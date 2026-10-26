import { describe, expect, it } from "vitest";
import { lastThursdayBefore } from "../lib/pipeline/run";
import { applyRedirects, Registry } from "../lib/pipeline/registry";
import type { WeekFile } from "../lib/types";

describe("Registry redirects", () => {
  it("moves a name-only artist and song onto their Spotify ids and rewrites old weeks", () => {
    const reg = new Registry();
    reg.upsertArtist("n-ella", { name: "Ella", platformIds: {} });
    reg.upsertSong("n-ella--song", { title: "Song", artistIds: ["n-ella"], isrc: null, platformIds: {} });
    reg.redirectArtist("n-ella", "SPOTIFYID0000000000001");
    reg.redirectSong("n-ella--song", "sp-TRACK");
    expect(reg.artistId("n-ella")).toBe("SPOTIFYID0000000000001");
    expect(reg.songId("n-ella--song")).toBe("sp-TRACK");

    const week = {
      artistChart: [{ artistId: "n-ella", topSongIds: ["n-ella--song"], topSongs: [] }],
      songChart: [{ songId: "n-ella--song" }],
      artists: { "n-ella": { id: "n-ella", name: "Ella" } },
      songs: { "n-ella--song": { id: "n-ella--song", artistIds: ["n-ella"] } },
      highlights: { topArtist: { kind: "artist", id: "n-ella" }, topSong: { kind: "song", id: "n-ella--song" } },
    } as unknown as WeekFile;
    expect(applyRedirects(week, reg.data.redirects)).toBe(true);
    expect(week.artistChart[0].artistId).toBe("SPOTIFYID0000000000001");
    expect(week.songChart[0].songId).toBe("sp-TRACK");
    expect(Object.keys(week.songs)).toEqual(["sp-TRACK"]);
    expect(week.songs["sp-TRACK"].artistIds).toEqual(["SPOTIFYID0000000000001"]);
    expect(week.highlights.topArtist!.id).toBe("SPOTIFYID0000000000001");
    expect(applyRedirects(week, reg.data.redirects)).toBe(false);
  });
});

describe("lastThursdayBefore", () => {
  it("returns the end of the last complete chart week", () => {
    expect(lastThursdayBefore(new Date("2026-10-23T18:00:00Z"))).toBe("2026-10-22"); // Friday run
    expect(lastThursdayBefore(new Date("2026-10-25T10:00:00Z"))).toBe("2026-10-22"); // Sunday
    expect(lastThursdayBefore(new Date("2026-10-22T23:00:00Z"))).toBe("2026-10-15"); // Thursday itself is not complete
  });
});
