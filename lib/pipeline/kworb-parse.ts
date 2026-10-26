// Pure HTML parsers for kworb.net chart tables. No network here, so they are easy to test
// against saved pages in tests/fixtures.

export interface KworbRow {
  rank: number;
  /** Credited artist names as shown, lead first. */
  artists: string[];
  title: string;
  /** Raw "Artist - Title" text, kept for the unmatched-items log. */
  raw: string;
  value: number | null;
  spotifyTrackId?: string;
  spotifyArtistIds?: string[];
}

export interface KworbPage {
  /** Chart date in YYYY-MM-DD as printed on the page. */
  chartDate: string | null;
  rows: KworbRow[];
}

/** Spotify weekly chart: artist and track links carry Spotify IDs. */
export function parseSpotifyWeekly(html: string): KworbPage {
  const chartDate = matchDate(html, /Spotify Weekly Chart - Global - (\d{4})\/(\d{2})\/(\d{2})/);
  const rows: KworbRow[] = [];
  const header = headerCells(html);
  const streamsCol = header.indexOf("Streams");
  for (const cells of tableRows(html)) {
    const rank = toInt(text(cells[0]));
    const cell = cells[2] ?? "";
    const track = /<a href="\.\.\/track\/([A-Za-z0-9]{22})\.html">([\s\S]*?)<\/a>/.exec(cell);
    if (!rank || !track) continue;
    const artistLinks = [...cell.matchAll(/<a href="\.\.\/artist\/([A-Za-z0-9]{22})\.html">([\s\S]*?)<\/a>/g)];
    rows.push({
      rank,
      artists: artistLinks.map((m) => decode(m[2])),
      title: decode(track[2]),
      raw: text(cell),
      value: streamsCol >= 0 ? toInt(text(cells[streamsCol])) : null,
      spotifyTrackId: track[1],
      spotifyArtistIds: artistLinks.map((m) => m[1]),
    });
  }
  return { chartDate, rows };
}

/** Worldwide Apple Music song chart. Ranks only: kworb's "Pts" are its own formula, not streams. */
export function parseAppleWorldwide(html: string): KworbPage {
  const chartDate = matchDate(html, /Worldwide Apple Music Song Chart - (\d{4})\/(\d{2})\/(\d{2})/);
  const rows: KworbRow[] = [];
  for (const cells of tableRows(html)) {
    const rank = toInt(text(cells[0]));
    const raw = text(cells[2] ?? "");
    const split = splitArtistTitle(raw);
    if (!rank || !split) continue;
    rows.push({ rank, artists: splitCredits(split.artist), title: split.title, raw, value: null });
  }
  return { chartDate, rows };
}

/** One YouTube weekly country chart (kworb labels the column "Streams"; they are YouTube views). */
export function parseYoutubeCountry(html: string): KworbPage {
  const chartDate = matchDate(html, /Week ending (\d{4})\/(\d{2})\/(\d{2})/);
  const header = headerCells(html);
  const viewsCol = header.indexOf("Streams");
  const rows: KworbRow[] = [];
  for (const cells of tableRows(html)) {
    const rank = toInt(text(cells[0]));
    const raw = text(cells[2] ?? "");
    const split = splitArtistTitle(raw);
    if (!rank || !split) continue;
    rows.push({ rank, artists: splitCredits(split.artist), title: split.title, raw, value: viewsCol >= 0 ? toInt(text(cells[viewsCol])) : null });
  }
  return { chartDate, rows };
}

/** Country codes linked from the YouTube insights index (e.g. "us", "br"). */
export function parseYoutubeCountryList(html: string): string[] {
  return [...new Set([...html.matchAll(/href="([a-z]{2})\.html"/g)].map((m) => m[1]))].sort();
}

/** "Artist A & Artist B - Title - Remix" → artist "Artist A & Artist B", title "Title - Remix". */
export function splitArtistTitle(raw: string): { artist: string; title: string } | null {
  const i = raw.indexOf(" - ");
  if (i <= 0) return null;
  return { artist: raw.slice(0, i).trim(), title: raw.slice(i + 3).trim() };
}

/**
 * Split a credit string like "KAROL G, Judeline & rusowsky" into names.
 * Names that legitimately contain "&" (e.g. "Simon & Garfunkel") are kept whole when
 * `knownNames` (normalized) contains them; matching handles the rest.
 */
export function splitCredits(credit: string, isKnown: (name: string) => boolean = () => false): string[] {
  if (isKnown(credit)) return [credit];
  const parts = credit
    .split(/\s*,\s*|\s+&\s+|\s+(?:feat\.?|ft\.?|featuring|with|x|X)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  // Re-join neighbours that form a known name ("Simon", "Garfunkel" → "Simon & Garfunkel").
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const pair = i + 1 < parts.length ? `${parts[i]} & ${parts[i + 1]}` : null;
    if (pair && isKnown(pair)) {
      out.push(pair);
      i++;
    } else out.push(parts[i]);
  }
  return out;
}

// --- tiny HTML helpers (kworb tables are simple and consistent) ---

function tableRows(html: string): string[][] {
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(html)?.[1] ?? "";
  return [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]));
}

function headerCells(html: string): string[] {
  const head = /<thead>([\s\S]*?)<\/thead>/.exec(html)?.[1] ?? "";
  return [...head.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => text(m[1]));
}

export function text(html: string): string {
  return decode(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

export function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function toInt(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[,+\s]/g, ""));
  return Number.isFinite(n) && s.trim() !== "" ? n : null;
}

function matchDate(html: string, re: RegExp): string | null {
  const m = re.exec(html);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
