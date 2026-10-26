import { describe, expect, it } from "vitest";
import { splitArtistTitle, splitCredits } from "../lib/pipeline/kworb-parse";
import { ArtistResolver, artistsOverlap, SongMatcher } from "../lib/pipeline/match";
import { normalizeArtist, parseTitle, songKey } from "../lib/pipeline/normalize";

describe("normalizeArtist", () => {
  it("strips accents and case", () => {
    expect(normalizeArtist("ADÉLA")).toBe(normalizeArtist("Adela"));
    expect(normalizeArtist("Beyoncé")).toBe("beyonce");
    expect(normalizeArtist("Rosalía")).toBe("rosalia");
  });
  it("treats & and 'and' the same", () => {
    expect(normalizeArtist("Simon & Garfunkel")).toBe(normalizeArtist("Simon and Garfunkel"));
  });
  it("drops a leading 'The'", () => {
    expect(normalizeArtist("The Weeknd")).toBe(normalizeArtist("Weeknd"));
  });
  it("handles symbols in names", () => {
    expect(normalizeArtist("$uicideboy$")).toBe("suicideboys");
    expect(normalizeArtist("HUNTR/X")).toBe(normalizeArtist("HUNTR X"));
  });
  it("keeps non-Latin scripts", () => {
    expect(normalizeArtist("에이티즈")).toBe("에이티즈");
    expect(normalizeArtist("Хамдам Собиров")).toBe("хамдам собиров");
  });
});

describe("parseTitle", () => {
  it("pulls featured artists out of the title", () => {
    const p = parseTitle("WTF GOIN (feat. 21 Savage)");
    expect(p.key).toBe("wtf goin");
    expect(p.featured).toEqual(["21 Savage"]);
  });
  it("handles with, w/, ft. and brackets", () => {
    expect(parseTitle("Die With A Smile (with Bruno Mars)").featured).toEqual(["Bruno Mars"]);
    expect(parseTitle("Song [ft. A & B]").featured).toEqual(["A", "B"]);
    expect(parseTitle("Song (w/ Judeline, rusowsky)").featured).toEqual(["Judeline", "rusowsky"]);
    expect(parseTitle("Song feat. Someone").featured).toEqual(["Someone"]);
  });
  it("does not treat 'with' inside the title as a credit", () => {
    expect(parseTitle("Die With A Smile").key).toBe("die with a smile");
  });
  it("ignores apostrophes and punctuation", () => {
    expect(parseTitle("Ain't In LA").key).toBe(parseTitle("Aint In LA").key);
    expect(parseTitle("Stop The Wedding!").key).toBe(parseTitle("Stop The Wedding").key);
    expect(parseTitle("misery.").key).toBe("misery");
  });
  it("removes video noise", () => {
    expect(parseTitle("Tarantino (Official Music Video)").key).toBe("tarantino");
    expect(parseTitle("'DESERVE' M/V").key).toBe("deserve");
    expect(parseTitle("Dai Dai (Official Video)").version).toBe("");
  });
  it("keeps remix and other versions distinct, in canonical form", () => {
    expect(parseTitle("Golden (Remix)").version).toBe("remix");
    expect(parseTitle("Golden - Remix").version).toBe("remix");
    expect(parseTitle("Golden (Sped Up Version)").version).toBe("sped up");
    expect(parseTitle("Golden - sped up").version).toBe("sped up");
    expect(parseTitle("Pós (Ao Vivo)").version).toBe("live");
    expect(parseTitle("Love Story (Taylor's Version)").version).toBe("artist version");
  });
  it("treats remasters and radio edits as the same song", () => {
    expect(songKey("Katy Perry", "The One That Got Away - Remastered 2021")).toBe(songKey("Katy Perry", "The One That Got Away"));
    expect(songKey("X", "Song (Radio Edit)")).toBe(songKey("X", "Song"));
  });
  it("drops YouTube pipe suffixes", () => {
    expect(parseTitle("So Swaezy | Yo Yo Honey Singh | Full Song").key).toBe("so swaezy");
  });
});

describe("splitCredits / splitArtistTitle", () => {
  it("splits comma and ampersand lists", () => {
    expect(splitCredits("KAROL G, Judeline & rusowsky")).toEqual(["KAROL G", "Judeline", "rusowsky"]);
    expect(splitCredits("Shakira & Burna Boy")).toEqual(["Shakira", "Burna Boy"]);
  });
  it("keeps known '&' names whole", () => {
    const r = new ArtistResolver([["Simon & Garfunkel", "x"], ["Earth, Wind & Fire", "y"]]);
    expect(splitCredits("Simon & Garfunkel", r.isKnown)).toEqual(["Simon & Garfunkel"]);
    expect(splitCredits("Earth, Wind & Fire", r.isKnown)).toEqual(["Earth, Wind & Fire"]);
    expect(splitCredits("Simon & Garfunkel, Someone", r.isKnown)).toEqual(["Simon & Garfunkel", "Someone"]);
  });
  it("splits on the first ' - ' so titles may contain dashes", () => {
    expect(splitArtistTitle("Katy Perry - Song - Remix")).toEqual({ artist: "Katy Perry", title: "Song - Remix" });
    expect(splitArtistTitle("no separator")).toBeNull();
  });
});

describe("artistsOverlap", () => {
  it("matches spacing variants and whole-word containment", () => {
    expect(artistsOverlap(["karol g"], ["karolg"])).toBe(true);
    expect(artistsOverlap(["sean paul"], ["sean paul and dua lipa"])).toBe(true);
  });
  it("does not match short fragments or partial words", () => {
    expect(artistsOverlap(["eve"], ["steve lacy"])).toBe(false);
    expect(artistsOverlap(["lana"], ["lana del rey"])).toBe(true);
    expect(artistsOverlap(["ado"], ["adele"])).toBe(false);
  });
});

describe("SongMatcher", () => {
  const spotify = new SongMatcher([
    { id: "sp-bby", title: "BbY WOW", artistNames: ["KAROL G", "Judeline", "rusowsky"], spotifyTrackId: "3h5T5JypYU7huFiVYhv1dr", isrc: "USUM72500001" },
    { id: "sp-nicole", title: "Nicole Kidman", artistNames: ["ADÉLA"] },
    { id: "sp-aint", title: "Ain't In LA", artistNames: ["ADÉLA"] },
    { id: "sp-dws", title: "Die With A Smile", artistNames: ["Lady Gaga", "Bruno Mars"] },
    { id: "sp-golden", title: "Golden", artistNames: ["HUNTR/X", "EJAE", "AUDREY NUNA", "REI AMI"] },
    { id: "sp-golden-remix", title: "Golden - Remix", artistNames: ["HUNTR/X"] },
    { id: "sp-wtf", title: "WTF GOIN (feat. 21 Savage)", artistNames: ["Belly Gang Kushington"] },
    { id: "sp-stop", title: "Stop The Wedding!", artistNames: ["Ashe"] },
    { id: "sp-expect", title: "expectations", artistNames: ["Olivia Rodrigo", "Chappell Roan"] },
    { id: "sp-other-golden", title: "Golden", artistNames: ["Harry Styles"] },
  ]);

  it("matches by ISRC first", () => {
    expect(spotify.match({ title: "Totally different", artists: ["Nobody"], isrc: "usum72500001" })).toEqual({ songId: "sp-bby", method: "isrc" });
  });
  it("matches by Spotify track ID", () => {
    expect(spotify.match({ title: "x", artists: ["y"], spotifyTrackId: "3h5T5JypYU7huFiVYhv1dr" }).songId).toBe("sp-bby");
  });
  it("matches Apple-style credit strings exactly", () => {
    const r = spotify.match({ title: "BbY WOW", artists: splitCredits("KAROL G, Judeline & rusowsky") });
    expect(r).toEqual({ songId: "sp-bby", method: "exact" });
  });
  it("matches accent and punctuation variants", () => {
    expect(spotify.match({ title: "Nicole Kidman", artists: ["ADELA"] }).songId).toBe("sp-nicole");
    expect(spotify.match({ title: "Aint In LA", artists: ["Adéla"] }).songId).toBe("sp-aint");
    expect(spotify.match({ title: "Stop The Wedding", artists: ["Ashe"] }).songId).toBe("sp-stop");
  });
  it("matches when a featured artist is listed first", () => {
    expect(spotify.match({ title: "Die With A Smile", artists: ["Bruno Mars", "Lady Gaga"] }).songId).toBe("sp-dws");
  });
  it("matches YouTube titles with feat. in the title", () => {
    expect(spotify.match({ title: "WTF GOIN (feat. 21 Savage)", artists: ["Belly Gang Kushington"] }).songId).toBe("sp-wtf");
    expect(spotify.match({ title: "WTF GOIN", artists: ["Belly Gang Kushington", "21 Savage"] }).songId).toBe("sp-wtf");
  });
  it("does not merge a remix into the original", () => {
    expect(spotify.match({ title: "Golden", artists: ["HUNTR/X"] }).songId).toBe("sp-golden");
    expect(spotify.match({ title: "Golden (Remix)", artists: ["HUNTR/X"] }).songId).toBe("sp-golden-remix");
  });
  it("does not merge same-title songs by different artists", () => {
    expect(spotify.match({ title: "Golden", artists: ["Harry Styles"] }).songId).toBe("sp-other-golden");
    expect(spotify.match({ title: "Golden", artists: ["Jill Scott"] })).toEqual({ songId: null, reason: "no_candidate", candidates: [] });
  });
  it("fuzzy-matches loose artist spellings on the same title", () => {
    const r = spotify.match({ title: "expectations", artists: ["Olivia Rodrigo and Chappell Roan"] });
    expect(r.songId).toBe("sp-expect");
  });
  it("fuzzy-matches a one-letter title typo only with the same lead artist", () => {
    expect(spotify.match({ title: "Nicole Kidmann", artists: ["ADÉLA"] })).toMatchObject({ songId: "sp-nicole", method: "fuzzy" });
    expect(spotify.match({ title: "Nicole Kidmann", artists: ["Someone Else"] }).songId).toBeNull();
  });
  it("reports unknown songs as unmatched", () => {
    expect(spotify.match({ title: "Mangal Rang", artists: ["AR Rahman"] }).songId).toBeNull();
  });
  it("matches newly added songs (e.g. the same YouTube song in a second country)", () => {
    const m = new SongMatcher();
    m.add({ id: "n-1", title: "Peshta", artistNames: ["Xamdam Sobirov"] });
    expect(m.match({ title: "Peshta", artists: ["Xamdam Sobirov"] }).songId).toBe("n-1");
  });
});

describe("ArtistResolver", () => {
  it("prefers Spotify IDs over name-only ids", () => {
    const r = new ArtistResolver();
    r.add("Tate McRae", "n-tate-mcrae");
    r.add("Tate McRae", "45dkTj5sMRSjrmBSBeiHym");
    expect(r.resolve("TATE MCRAE")).toBe("45dkTj5sMRSjrmBSBeiHym");
    r.add("Tate McRae", "n-other");
    expect(r.resolve("Tate McRae")).toBe("45dkTj5sMRSjrmBSBeiHym");
  });
});
