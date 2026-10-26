// PLACEHOLDER: Luminate (paid). Fill in fetch() once you have API access.
//
// 1. Add LUMINATE_API_KEY (and LUMINATE_API_SECRET if issued) to .env.local and the GitHub repo secrets.
// 2. Implement fetch(): request weekly on-demand audio/video streams per platform for the chart week
//    (ctx.expectedWeek). Map rows to AdapterSongRow with isrc set — Luminate is ISRC-based, so
//    matching will be exact.
// 3. Return one PlatformChart per platform with valueKind "streams". With real streams on every
//    platform the chart switches to "Combined Streams" automatically.
// 4. Enable it in config/pipeline.json and put it first in `priority`.

import type { SourceAdapter } from "./types";
import { SourceNotImplementedError } from "./types";

export const luminate: SourceAdapter = {
  id: "luminate",
  label: "Luminate",
  platforms: ["spotify", "apple", "youtube"],
  isConfigured: () => Boolean(process.env.LUMINATE_API_KEY),
  async fetch() {
    throw new SourceNotImplementedError("Luminate adapter is a placeholder. See lib/pipeline/adapters/luminate.ts");
  },
};
