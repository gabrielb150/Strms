// Polite HTTP: one request at a time, a delay between requests to the same host,
// a descriptive user agent, and every raw response saved to disk so a week is never fetched twice.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import pipelineConfig from "../../config/pipeline.json";

const lastRequestAt = new Map<string, number>();

export interface FetchOptions {
  /** Where to save the raw body. If the file already exists it is returned without any network request. */
  cacheFile?: string;
  headers?: Record<string, string>;
  method?: string;
  body?: string;
  /** Minimum gap between requests to the same host. Defaults to config/pipeline.json requestDelayMs. */
  delayMs?: number;
  /** Throw instead of fetching when the cache file is missing (used with --offline). */
  offline?: boolean;
  retries?: number;
}

export class HttpError extends Error {
  constructor(public url: string, public status: number, body: string) {
    super(`HTTP ${status} for ${url}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
}

export async function politeFetch(url: string, opts: FetchOptions = {}): Promise<string> {
  if (opts.cacheFile && fs.existsSync(opts.cacheFile)) return readCache(opts.cacheFile);
  if (opts.offline) throw new Error(`Offline mode: no cached copy of ${url} at ${opts.cacheFile}`);

  const host = new URL(url).host;
  const delay = opts.delayMs ?? pipelineConfig.requestDelayMs;
  const retries = opts.retries ?? 2;

  for (let attempt = 0; ; attempt++) {
    const wait = (lastRequestAt.get(host) ?? 0) + delay - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt.set(host, Date.now());

    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        body: opts.body,
        headers: { "User-Agent": userAgent(), Accept: "text/html,application/json;q=0.9,*/*;q=0.8", ...opts.headers },
        signal: AbortSignal.timeout(30_000),
      });
      const text = await res.text();
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number(res.headers.get("retry-after")) || 0;
        if (attempt < retries) {
          await sleep(Math.max(retryAfter * 1000, 5000 * (attempt + 1)));
          continue;
        }
      }
      if (!res.ok) throw new HttpError(url, res.status, text);
      if (opts.cacheFile) {
        writeCache(opts.cacheFile, text);
      }
      return text;
    } catch (e) {
      if (e instanceof HttpError || attempt >= retries) throw e;
      await sleep(5000 * (attempt + 1));
    }
  }
}

export function userAgent(): string {
  return process.env.PIPELINE_USER_AGENT || pipelineConfig.userAgent;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Raw responses are stored gzipped when the file name ends in .gz (kworb pages shrink ~10x). */
export function readCache(file: string): string {
  const buf = fs.readFileSync(file);
  return file.endsWith(".gz") ? zlib.gunzipSync(buf).toString("utf8") : buf.toString("utf8");
}

export function writeCache(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, file.endsWith(".gz") ? zlib.gzipSync(text, { level: 9 }) : text);
}
