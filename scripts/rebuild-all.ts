// Rebuild every stored week from its saved raw responses (no network for chart data), oldest first.
// Use after changing config/scoring.json weights or the matching rules, so all history uses the same logic.
//   npm run rebuild

import fs from "node:fs";
import path from "node:path";
import { runPipeline } from "../lib/pipeline/run";
import type { WeekFile } from "../lib/types";

for (const f of [".env.local", ".env"]) if (fs.existsSync(f)) process.loadEnvFile(f);

const dir = path.join(process.cwd(), "data", "weeks");

async function main() {
  const weeks = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  for (const f of weeks) {
    const old = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as WeekFile;
    if (old.isMock) continue;
    console.log(`\n=== Rebuilding ${old.week}`);
    await runPipeline({ week: old.week, force: true, offline: true, reconstructed: old.sources.some((s) => s.reconstructed), now: new Date(old.generatedAt) });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
