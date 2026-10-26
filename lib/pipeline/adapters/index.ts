import { chartmetric } from "./chartmetric";
import { kworbApple } from "./kworb-apple";
import { kworbSpotify } from "./kworb-spotify";
import { kworbYoutube } from "./kworb-youtube";
import { luminate } from "./luminate";
import type { SourceAdapter } from "./types";

export const ADAPTERS: Record<string, SourceAdapter> = {
  luminate,
  chartmetric,
  "kworb-spotify": kworbSpotify,
  "kworb-apple": kworbApple,
  "kworb-youtube": kworbYoutube,
};
