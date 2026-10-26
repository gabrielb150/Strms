// Copies data/weeks/*.json into public/data/weeks/ (so the browser can load past weeks)
// and writes public/data/index.json with the list of available weeks.

import fs from "node:fs";
import path from "node:path";
import { overlayMeta } from "../lib/meta-overlay";
import type { WeekFile, WeekIndex } from "../lib/types";

const SRC = path.join(process.cwd(), "data", "weeks");
const DEST = path.join(process.cwd(), "public", "data");

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(path.join(DEST, "weeks"), { recursive: true });

const weeks = fs.existsSync(SRC)
  ? fs.readdirSync(SRC).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort().reverse()
  : [];
const metaFile = path.join(process.cwd(), "data", "meta", "spotify.json");
const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : null;
for (const w of weeks) {
  const file = overlayMeta(JSON.parse(fs.readFileSync(path.join(SRC, `${w}.json`), "utf8")) as WeekFile, meta);
  fs.writeFileSync(path.join(DEST, "weeks", `${w}.json`), JSON.stringify(file));
}

const index: WeekIndex = { latest: weeks[0] ?? null, weeks };
fs.writeFileSync(path.join(DEST, "index.json"), JSON.stringify(index));
console.log(`synced ${weeks.length} week(s) to public/data`);
