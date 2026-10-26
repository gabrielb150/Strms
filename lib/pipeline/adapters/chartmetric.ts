// PLACEHOLDER: Chartmetric (paid). Fill in fetch() once you have API access.
//
// 1. Add CHARTMETRIC_REFRESH_TOKEN to .env.local (locally) and to the GitHub repo secrets.
// 2. Implement fetch(): get an access token, then call the chart endpoints you are licensed for
//    (e.g. Spotify / Apple Music / YouTube weekly charts). Map each row to AdapterSongRow,
//    filling isrc and the platform IDs whenever Chartmetric provides them — matching uses them first.
// 3. Return one PlatformChart per platform. If you return real stream counts for every platform
//    (valueKind: "streams"), the site switches to "Combined Streams" automatically.
// 4. Enable it in config/pipeline.json and list it before the kworb sources in `priority`,
//    so its data replaces the free source for the same platform.

import type { SourceAdapter } from "./types";
import { SourceNotImplementedError } from "./types";

export const chartmetric: SourceAdapter = {
  id: "chartmetric",
  label: "Chartmetric",
  platforms: ["spotify", "apple", "youtube"],
  isConfigured: () => Boolean(process.env.CHARTMETRIC_REFRESH_TOKEN),
  async fetch() {
    throw new SourceNotImplementedError("Chartmetric adapter is a placeholder. See lib/pipeline/adapters/chartmetric.ts");
  },
};
