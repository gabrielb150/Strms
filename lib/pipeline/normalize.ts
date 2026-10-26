// Name normalization for cross-platform matching. Deliberately conservative:
// it removes formatting differences, never meaning (a remix stays a remix).

/** Lowercase, strip accents, unify symbols, drop punctuation, collapse spaces. */
export function basicNormalize(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // accents: "ADÉLA" → "ADELA"
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s*&\s*|\s*\+\s*/g, " and ")
    .replace(/\$/g, "s") // "$uicideboy$" ↔ "Suicideboys"-style spellings
    .replace(/'/g, "") // "Ain't" ↔ "Aint"
    .replace(/[^\p{L}\p{N}]+/gu, " ") // other punctuation → space (keeps CJK, Cyrillic, etc.)
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFC"); // recompose scripts like Hangul that NFKD split into parts
}

export function normalizeArtist(name: string): string {
  return basicNormalize(name).replace(/^the /, "");
}

// Things that describe a video/upload, not a different recording.
const NOISE_TAGS =
  /\b(official (music )?video|official audio|official lyric video|lyric video|lyrics?|visuali[sz]er|audio|mv|m\/v|official mv|official visualizer|video oficial|clipe oficial|videoclip oficial|official|hd|4k)\b/gi;

// Tags that DO mean a different recording. Kept in the key so "Song" and "Song (Remix)" never merge.
// Each maps to one canonical word, so "(Sped Up Version)" and "- sped up" agree.
// Remasters and radio edits are treated as the same song.
const VERSION_CANON: [RegExp, string][] = [
  [/\bremix(ed)?\b|\bmix\b/i, "remix"],
  [/\bsped up\b|\bspeed up\b/i, "sped up"],
  [/\bslowed\b/i, "slowed"],
  [/\bacoustic\b/i, "acoustic"],
  [/\blive\b|\bao vivo\b|\ben vivo\b/i, "live"],
  [/\bextended\b/i, "extended"],
  [/\binstrumental\b/i, "instrumental"],
  [/\bdemo\b/i, "demo"],
  [/\bcover\b/i, "cover"],
  [/\b\w+'?s version\b/i, "artist version"], // "Taylor's Version"
];
const VERSION_TAGS = new RegExp(VERSION_CANON.map(([r]) => r.source).join("|"), "i");

export interface ParsedTitle {
  /** Title without featured-artist credits or video noise, normalized. */
  key: string;
  /** Normalized version qualifier, e.g. "remix" or "sped up". Empty for the original. */
  version: string;
  /** Artists credited inside the title: "(feat. X)", "(with Y)", "(w/ Z)". */
  featured: string[];
}

export function parseTitle(title: string): ParsedTitle {
  const featured: string[] = [];
  // YouTube titles sometimes use "|" to append credits or film names: keep the first segment.
  let t = title.split("|")[0];
  // Trailing upload labels outside brackets: "'DESERVE' M/V", "Song Official MV".
  t = t.replace(/\s+(?:official\s+)?(?:m\/v|mv)\s*$/i, "");

  // (feat. X) / [ft. X] / (with X) / (w/ X)  →  featured credits
  t = t.replace(/[([]\s*(?:feat\.?|ft\.?|featuring|with|w\/)\s+([^)\]]+)[)\]]/gi, (_, who: string) => {
    featured.push(...splitNames(who));
    return " ";
  });
  // trailing " feat. X" without brackets
  t = t.replace(/\s+(?:feat\.?|ft\.?|featuring)\s+(.+)$/i, (_, who: string) => {
    featured.push(...splitNames(who));
    return "";
  });

  // Bracketed and dash-separated qualifiers: decide whether each is noise or a real version.
  const versions: string[] = [];
  t = t.replace(/[([]([^)\]]*)[)\]]/g, (_, inner: string) => {
    if (VERSION_TAGS.test(inner)) versions.push(inner);
    return " ";
  });
  const dash = t.split(/\s+-\s+/);
  if (dash.length > 1) {
    t = dash[0];
    for (const part of dash.slice(1)) if (VERSION_TAGS.test(part)) versions.push(part);
  }

  const version = [...new Set(versions.flatMap((v) => VERSION_CANON.filter(([r]) => r.test(v.replace(NOISE_TAGS, " "))).map(([, c]) => c)))]
    .sort()
    .join(" ");
  return { key: basicNormalize(t), version, featured };
}

export function songKey(leadArtist: string, title: string): string {
  const p = parseTitle(title);
  return `${normalizeArtist(leadArtist)}|${p.key}${p.version ? `|${p.version}` : ""}`;
}

function splitNames(s: string): string[] {
  return s
    .split(/\s*,\s*|\s+&\s+|\s+and\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Stable, URL-safe slug for ids of artists/songs that have no platform ID. */
export function slugify(s: string): string {
  return basicNormalize(s).replace(/\s+/g, "-").slice(0, 80) || "unknown";
}

/** Title for display when a song has no Spotify record: drops "(Official Video)", "| extra" and feat. credits. */
export function cleanDisplayTitle(title: string): string {
  let t = title.split("|")[0];
  t = t.replace(/[([]\s*(?:feat\.?|ft\.?|featuring|with|w\/)\s+[^)\]]+[)\]]/gi, " ");
  const noise = new RegExp(NOISE_TAGS.source, "i"); // non-global copy: .test() on a /g regex is stateful
  t = t.replace(/[([]([^)\]]*)[)\]]/g, (m, inner: string) => (noise.test(inner) && !VERSION_TAGS.test(inner) ? " " : m));
  t = t.replace(/\s+(?:official\s+)?(?:m\/v|mv)\s*$/i, "");
  return t.replace(/\s+/g, " ").trim() || title.trim();
}
