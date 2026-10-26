import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAppleWorldwide, parseSpotifyWeekly, parseYoutubeCountry, parseYoutubeCountryList } from "../lib/pipeline/kworb-parse";

const fixture = (f: string) => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");

describe("kworb parsers (trimmed real pages from 2026-10-25)", () => {
  it("parses the Spotify weekly chart with IDs and real streams", () => {
    const p = parseSpotifyWeekly(fixture("kworb-spotify-weekly.html"));
    expect(p.chartDate).toBe("2026-10-22");
    expect(p.rows.length).toBe(8);
    expect(p.rows[0]).toMatchObject({ rank: 1, title: "Housewife", artists: ["Tate McRae"], value: 39124791, spotifyTrackId: "2sFepQNyl1WjpROruP8bJ0" });
    // "(w/ Judeline, rusowsky)" collaborators come from the artist links
    expect(p.rows[1].artists).toEqual(["KAROL G", "Judeline", "rusowsky"]);
    expect(p.rows[1].spotifyArtistIds).toHaveLength(3);
    expect(p.rows[2].artists).toEqual(["ADÉLA"]);
  });

  it("parses the Apple Music worldwide chart as ranks only", () => {
    const p = parseAppleWorldwide(fixture("kworb-apple.html"));
    expect(p.chartDate).toBe("2026-10-25");
    expect(p.rows[0]).toMatchObject({ rank: 1, title: "Housewife", artists: ["Tate McRae"], value: null });
    expect(p.rows[2].artists).toEqual(["KAROL G", "Judeline", "rusowsky"]);
  });

  it("parses a YouTube country chart with views", () => {
    const p = parseYoutubeCountry(fixture("kworb-youtube-us.html"));
    expect(p.chartDate).toBe("2026-10-15");
    expect(p.rows[0]).toMatchObject({ rank: 1, title: "Choosin' Texas", artists: ["Ella Langley"], value: 5304467 });
    const wtf = p.rows.find((r) => r.title.startsWith("WTF"));
    expect(wtf?.title).toBe("WTF GOIN (feat. 21 Savage)");
  });

  it("finds country links on the YouTube index", () => {
    expect(parseYoutubeCountryList('<a href="us.html">US</a><a href="br.html">BR</a><a href="/youtube">x</a>')).toEqual(["br", "us"]);
  });

  it("returns no rows (instead of garbage) for a changed layout", () => {
    expect(parseSpotifyWeekly("<html><body>maintenance</body></html>").rows).toEqual([]);
  });
});
