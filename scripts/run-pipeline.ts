// CLI for the weekly pipeline.
//   npm run pipeline                 build the latest week (skips if already built)
//   npm run pipeline -- --force      rebuild the latest week from stored raw data
//   npm run pipeline -- --offline    never touch the network; use data/raw only
//   npm run pipeline -- --no-enrich  skip Spotify Web API / MusicBrainz lookups

import fs from "node:fs";
import { runPipeline } from "../lib/pipeline/run";

for (const f of [".env.local", ".env"]) if (fs.existsSync(f)) process.loadEnvFile(f);

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

runPipeline({
  force: flag("force"),
  offline: flag("offline"),
  skipEnrich: flag("no-enrich"),
  week: value("week"),
})
  .then((r) => {
    writeSummary(`### Chart update: ${r.status}\n\n${r.summary.map((s) => `- ${s}`).join("\n")}${r.warnings.length ? `\n\n**Warnings**\n${r.warnings.map((w) => `- ${w}`).join("\n")}` : ""}\n`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `status=${r.status}\nweek=${r.week}\nexcluded=${r.excluded.join(", ")}\n`);
  })
  .catch((e: Error) => {
    console.error(`\n✖ Pipeline failed: ${e.message}`);
    fs.mkdirSync("data/logs", { recursive: true });
    fs.writeFileSync("data/logs/last-error.txt", `${new Date().toISOString()}\n${e.stack ?? e.message}\n`);
    writeSummary(`### Chart update failed\n\n\`\`\`\n${e.message}\n\`\`\`\n`);
    process.exit(1);
  });

function writeSummary(md: string) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}
