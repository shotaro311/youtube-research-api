import { execFile as execFileCb } from "child_process";
import { existsSync } from "fs";
import { readFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";

import { glob } from "glob";
import { getSubtitles, type Subtitle } from "youtube-caption-extractor";
import { fetchTranscript } from "youtube-transcript-plus";
import { Innertube } from "youtubei.js";

import { BadRequestError, UpstreamServiceError } from "./errors";
import {
  formatTranscriptTime,
  isValidVideoId,
  LANGUAGE_PREFERENCE,
  normalizeYouTubeUrl,
  parseDurationToSeconds,
  secondsToIsoDuration,
} from "./shared";
import type { CommentItem, ExtractVideoInput, ExtractVideoResponse, StageDiagnostic, VideoMetadata } from "./types";

const execFile = promisify(execFileCb);

const TRANSCRIPT_EXTRACTOR_TIMEOUT_MS = 10000;
const TRANSCRIPT_FALLBACK_TIMEOUT_MS = 10000;
const TRANSCRIPT_PLUS_TIMEOUT_MS = 12000;
const COMMENTS_TIMEOUT_MS = 10000;
const YT_DLP_TIMEOUT_MS = 30000;
const YT_DLP_VERSION_TIMEOUT_MS = 20000;
const BUNDLED_YT_DLP_BINARY = join(process.cwd(), "vendor", "yt-dlp", "yt-dlp");
const YT_DLP_BINARY = process.env.YT_DLP_PATH || (existsSync(BUNDLED_YT_DLP_BINARY) ? BUNDLED_YT_DLP_BINARY : "yt-dlp");
const YT_DLP_JS_RUNTIME = process.env.YT_DLP_JS_RUNTIME || "node";
const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const DESKTOP_USER_AGENT_ALT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const ANDROID_USER_AGENT = "com.google.android.youtube/19.44.38 (Linux; U; Android 14) gzip";
const ANDROID_CLIENT_VERSION = "19.44.38";
const ANDROID_SDK_VERSION = 34;
const TRANSCRIPT_PLUS_USER_AGENTS = [DESKTOP_USER_AGENT, DESKTOP_USER_AGENT_ALT];

type CaptionTrack = {
  languageCode?: string;
  baseUrl?: string;
  url?: string;
  signatureCipher?: string;
  cipher?: string;
};

type WatchPagePlayerResponse = {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
};

type InnertubePlayerResponse = {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
};

type Json3Event = {
  tStartMs?: number;
  segs?: Array<{ utf8?: string }>;
};

type TranscriptSegmentRow = {
  start: number;
  text: string;
};

type ChannelExtra = {
  channelId: string;
  subscribers: number;
  channelCreatedAt: string;
};

type YouTubeDataApiVideoResponse = {
  items?: Array<{
    snippet?: {
      channelId?: string;
      title?: string;
      publishedAt?: string;
      channelTitle?: string;
      thumbnails?: {
        maxres?: { url?: string };
        standard?: { url?: string };
        high?: { url?: string };
        medium?: { url?: string };
        default?: { url?: string };
      };
    };
    statistics?: {
      viewCount?: string;
    };
    contentDetails?: {
      duration?: string;
    };
  }>;
};

type YouTubeChannelResponse = {
  items?: Array<{
    snippet?: {
      publishedAt?: string;
    };
    statistics?: {
      subscriberCount?: string;
    };
  }>;
};

type CommentShape = {
  author?: { name?: string };
  content?: { toString(): string };
  like_count?: number | string;
};

type CommentThreadItem = {
  snippet?: {
    topLevelComment?: {
      snippet?: {
        authorDisplayName?: string;
        textDisplay?: string;
        textOriginal?: string;
        likeCount?: number;
      };
    };
  };
};

let ytDlpAvailableCache: boolean | null = null;

function getApiKey(): string {
  const apiKey = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new UpstreamServiceError("API key is not configured. Please set YOUTUBE_API_KEY or GOOGLE_API_KEY.");
  }
  return apiKey;
}

export function parseVideoUrl(urlRaw: string): string | null {
  try {
    const url = new URL(normalizeYouTubeUrl(urlRaw));
    const host = url.hostname.toLowerCase();
    if (!["www.youtube.com", "youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(host)) {
      return null;
    }

    if (host === "youtu.be") {
      const shortId = url.pathname.split("/").filter(Boolean)[0] || "";
      return isValidVideoId(shortId) ? shortId : null;
    }

    if (url.pathname === "/watch") {
      const watchId = url.searchParams.get("v") || "";
      return isValidVideoId(watchId) ? watchId : null;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && ["shorts", "embed", "live"].includes(parts[0])) {
      return isValidVideoId(parts[1]) ? parts[1] : null;
    }

    return null;
  } catch {
    return null;
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms);
    }),
  ]) as Promise<T>;
}

function getLanguagePreferenceIndex(languageCode: string): number {
  const normalized = (languageCode || "").toLowerCase();
  for (let index = 0; index < LANGUAGE_PREFERENCE.length; index += 1) {
    const preferred = LANGUAGE_PREFERENCE[index].toLowerCase();
    if (
      normalized === preferred ||
      normalized.startsWith(`${preferred}-`) ||
      normalized === `a.${preferred}` ||
      normalized.startsWith(`a.${preferred}-`)
    ) {
      return index;
    }
  }
  return LANGUAGE_PREFERENCE.length;
}

function sortCaptionTracksByPreference(tracks: CaptionTrack[]): CaptionTrack[] {
  return [...tracks].sort(
    (left, right) => getLanguagePreferenceIndex(left.languageCode ?? "") - getLanguagePreferenceIndex(right.languageCode ?? ""),
  );
}

function buildAcceptLanguage(language?: string): string {
  return language ? `${language},ja-JP;q=0.9,ja;q=0.8,en-US;q=0.7,en;q=0.6` : "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7";
}

function buildWatchPageUrl(videoId: string): string {
  const url = new URL("https://www.youtube.com/watch");
  url.searchParams.set("v", videoId);
  url.searchParams.set("hl", "ja");
  url.searchParams.set("persist_hl", "1");
  url.searchParams.set("bpctr", "9999999999");
  url.searchParams.set("has_verified", "1");
  return url.toString();
}

function toStringHeaders(source: unknown): Record<string, string> {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {};
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === "string") {
      headers[key] = value;
    }
  }
  return headers;
}

function buildYouTubeRequestHeaders(
  videoId: string,
  userAgent: string,
  language?: string,
  extraHeaders: Record<string, string> = {},
): Record<string, string> {
  return {
    Accept: "*/*",
    "Accept-Language": buildAcceptLanguage(language),
    Cookie: "PREF=hl=ja&gl=JP; CONSENT=YES+cb.20210328-17-p0.en+FX",
    Origin: "https://www.youtube.com",
    Referer: `https://www.youtube.com/watch?v=${videoId}`,
    "User-Agent": userAgent,
    ...extraHeaders,
  };
}

function replaceTrackFormat(baseUrl: string, format: string): string {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("fmt", format);
    return url.toString();
  } catch {
    if (baseUrl.includes("fmt=")) {
      return baseUrl.replace(/([?&])fmt=[^&]*/u, `$1fmt=${format}`);
    }
    return `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}fmt=${format}`;
  }
}

function resolveCaptionTrackUrl(track: CaptionTrack): string | null {
  if (track.baseUrl) {
    return track.baseUrl;
  }

  if (track.url) {
    return track.url;
  }

  const cipher = track.signatureCipher || track.cipher;
  if (!cipher) {
    return null;
  }

  const params = new URLSearchParams(cipher);
  const rawUrl = params.get("url");
  if (!rawUrl || params.get("s")) {
    return null;
  }

  try {
    const url = new URL(rawUrl);
    const signature = params.get("sig") || params.get("signature") || params.get("lsig");
    if (signature) {
      url.searchParams.set(params.get("sp") || "signature", signature);
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function decodeCaptionText(text: string): string {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseCaptionXml(xml: string): { start: number; text: string }[] {
  const segments: { start: number; text: string }[] = [];
  const textRegex = /<text start="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let match: RegExpExecArray | null = null;

  while ((match = textRegex.exec(xml)) !== null) {
    const raw = match[2].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();
    if (!raw) continue;
    segments.push({ start: parseFloat(match[1]), text: decodeCaptionText(raw) });
  }

  if (segments.length > 0) return segments;

  const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  while ((match = pRegex.exec(xml)) !== null) {
    const attrs = match[1] || "";
    const timeMatch = attrs.match(/\bt="([\d.]+)"/);
    if (!timeMatch) continue;

    const startMs = Number(timeMatch[1]);
    if (!Number.isFinite(startMs)) continue;

    const raw = match[2]
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?s[^>]*>/gi, "")
      .replace(/<[^>]+>/g, "")
      .trim();

    if (!raw) continue;
    segments.push({ start: startMs / 1000, text: decodeCaptionText(raw) });
  }

  return segments;
}

function normalizeTranscriptSegments(segments: TranscriptSegmentRow[]): TranscriptSegmentRow[] {
  const normalized = segments
    .map((segment) => ({
      start: Number(segment.start),
      text: typeof segment.text === "string" ? segment.text.trim() : "",
    }))
    .filter((segment) => Number.isFinite(segment.start) && segment.text.length > 0)
    .sort((left, right) => left.start - right.start || left.text.localeCompare(right.text));

  const deduped: TranscriptSegmentRow[] = [];
  for (const segment of normalized) {
    const previous = deduped[deduped.length - 1];
    if (previous && Math.abs(previous.start - segment.start) < 0.01 && previous.text === segment.text) {
      continue;
    }
    deduped.push(segment);
  }

  return deduped;
}

function getTranscriptCoverageSeconds(segments: TranscriptSegmentRow[]): number {
  return segments.length > 0 ? segments[segments.length - 1].start : 0;
}

function getTranscriptTextLength(segments: TranscriptSegmentRow[]): number {
  return segments.reduce((total, segment) => total + segment.text.length, 0);
}

function compareTranscriptCandidates(
  left: TranscriptSegmentRow[],
  right: TranscriptSegmentRow[],
  expectedDurationSeconds = 0,
): number {
  const coverageTolerance = expectedDurationSeconds > 0 ? Math.max(5, Math.min(60, expectedDurationSeconds * 0.03)) : 5;
  const coverageDiff = getTranscriptCoverageSeconds(left) - getTranscriptCoverageSeconds(right);
  if (Math.abs(coverageDiff) > coverageTolerance) {
    return coverageDiff;
  }

  const segmentCountDiff = left.length - right.length;
  if (Math.abs(segmentCountDiff) > 2) {
    return segmentCountDiff;
  }

  return getTranscriptTextLength(left) - getTranscriptTextLength(right);
}

function isTranscriptLikelyComplete(segments: TranscriptSegmentRow[], expectedDurationSeconds: number): boolean {
  if (segments.length === 0 || expectedDurationSeconds <= 0) return false;

  const allowedGapSeconds = Math.max(15, Math.min(90, expectedDurationSeconds * 0.1));
  return getTranscriptCoverageSeconds(segments) >= Math.max(0, expectedDurationSeconds - allowedGapSeconds);
}

function tryExtractJsonObject(source: string, marker: string): string | null {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return null;

  const start = source.indexOf("{", markerIndex);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const current = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (current === "\\") {
        escaped = true;
      } else if (current === '"') {
        inString = false;
      }
      continue;
    }

    if (current === '"') {
      inString = true;
      continue;
    }
    if (current === "{") {
      depth += 1;
      continue;
    }
    if (current === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  return null;
}

function extractInnertubeWebApiKey(source: string): string | null {
  const match = source.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
  return match?.[1] || null;
}

async function fetchFirstAvailableTrackSegments(videoId: string, tracks: CaptionTrack[]): Promise<TranscriptSegmentRow[]> {
  const sortedTracks = sortCaptionTracksByPreference(tracks);
  let bestSegments: TranscriptSegmentRow[] = [];

  for (const track of sortedTracks) {
    const resolvedTrackUrl = resolveCaptionTrackUrl(track);
    if (!resolvedTrackUrl) continue;
    try {
      const candidates = [
        { url: replaceTrackFormat(resolvedTrackUrl, "json3"), parser: parseJson3Subtitles },
        { url: resolvedTrackUrl, parser: parseCaptionXml },
      ];

      for (const candidate of candidates) {
        const response = await fetch(candidate.url, {
          headers: buildYouTubeRequestHeaders(videoId, DESKTOP_USER_AGENT),
        });
        if (!response.ok) continue;

        const content = await response.text();
        if (!content) continue;

        const segments = normalizeTranscriptSegments(candidate.parser(content));
        if (segments.length === 0) continue;
        if (compareTranscriptCandidates(segments, bestSegments) > 0) {
          bestSegments = segments;
        }
      }
    } catch {
      // try next track
    }
  }
  return bestSegments;
}

function mapTranscriptPlusRows(rows: unknown): TranscriptSegmentRow[] {
  return normalizeTranscriptSegments(
    (Array.isArray(rows) ? rows : []).map((row) => ({
      start: Number.isFinite((row as { offset?: unknown }).offset) ? Number((row as { offset: number }).offset) : 0,
      text: typeof (row as { text?: unknown }).text === "string" ? (row as { text: string }).text : "",
    })),
  );
}

async function fetchTranscriptWithBrowserHeaders(
  videoId: string,
  language?: string,
  userAgent = DESKTOP_USER_AGENT,
): Promise<TranscriptSegmentRow[]> {
  const rows = await fetchTranscript(videoId, {
    ...(language ? { lang: language } : {}),
    userAgent,
    videoFetch: ({ url, lang, userAgent: requestUserAgent }) =>
      fetch(url, {
        headers: buildYouTubeRequestHeaders(videoId, requestUserAgent || userAgent, lang),
      }),
    playerFetch: ({ url, method, body, headers, lang, userAgent: requestUserAgent }) =>
      fetch(url, {
        method,
        body,
        headers: buildYouTubeRequestHeaders(videoId, requestUserAgent || userAgent, lang, {
          ...toStringHeaders(headers),
          "X-Youtube-Client-Name": "3",
          "X-Youtube-Client-Version": ANDROID_CLIENT_VERSION,
        }),
      }),
    transcriptFetch: ({ url, lang, userAgent: requestUserAgent }) =>
      fetch(url, {
        headers: buildYouTubeRequestHeaders(videoId, requestUserAgent || userAgent, lang),
      }),
  }).catch((error) => {
    throw error instanceof Error ? error : new Error(String(error));
  });

  return mapTranscriptPlusRows(rows);
}

async function fetchTranscriptFromCaptionExtractor(videoId: string): Promise<TranscriptSegmentRow[]> {
  const fetchCore = async () => {
    let bestSegments: TranscriptSegmentRow[] = [];

    for (const language of LANGUAGE_PREFERENCE) {
      const subtitles: Subtitle[] = (await getSubtitles({ videoID: videoId, lang: language }).catch(() => [])) || [];
      const segments = normalizeTranscriptSegments(
        subtitles.map((subtitle) => ({
          start: parseFloat(subtitle.start),
          text: subtitle.text,
        })),
      );
      if (segments.length > 0 && compareTranscriptCandidates(segments, bestSegments) > 0) {
        bestSegments = segments;
      }
    }

    const fallbackSubtitles = (((await getSubtitles({ videoID: videoId }).catch(() => [])) || []) as Subtitle[]).map((subtitle) => ({
      start: parseFloat(subtitle.start),
      text: subtitle.text,
    }));
    const fallbackSegments = normalizeTranscriptSegments(fallbackSubtitles);
    if (fallbackSegments.length > 0 && compareTranscriptCandidates(fallbackSegments, bestSegments) > 0) {
      bestSegments = fallbackSegments;
    }

    return bestSegments;
  };

  return withTimeout(fetchCore(), TRANSCRIPT_EXTRACTOR_TIMEOUT_MS, "Caption extractor fetch timed out");
}

async function fetchTranscriptFromTranscriptPlus(videoId: string): Promise<TranscriptSegmentRow[]> {
  const fetchCore = async () => {
    let bestSegments: TranscriptSegmentRow[] = [];
    let lastError: Error | null = null;

    for (const userAgent of TRANSCRIPT_PLUS_USER_AGENTS) {
      for (const language of LANGUAGE_PREFERENCE) {
        const segments = await fetchTranscriptWithBrowserHeaders(videoId, language, userAgent).catch((error) => {
          lastError = error instanceof Error ? error : new Error(String(error));
          return [];
        });
        if (segments.length > 0 && compareTranscriptCandidates(segments, bestSegments) > 0) {
          bestSegments = segments;
        }
      }

      const fallbackSegments = await fetchTranscriptWithBrowserHeaders(videoId, undefined, userAgent).catch((error) => {
        lastError = error instanceof Error ? error : new Error(String(error));
        return [];
      });
      if (fallbackSegments.length > 0 && compareTranscriptCandidates(fallbackSegments, bestSegments) > 0) {
        bestSegments = fallbackSegments;
      }

      if (bestSegments.length > 0) {
        return bestSegments;
      }
    }

    if (lastError) {
      throw lastError;
    }

    return bestSegments;
  };

  return withTimeout(fetchCore(), TRANSCRIPT_PLUS_TIMEOUT_MS, "Transcript plus fetch timed out");
}

async function fetchTranscriptFromWatchPage(videoId: string): Promise<TranscriptSegmentRow[]> {
  const fetchCore = async () => {
    const watchResponse = await fetch(buildWatchPageUrl(videoId), {
      headers: buildYouTubeRequestHeaders(videoId, DESKTOP_USER_AGENT, "ja"),
    });
    if (!watchResponse.ok) return [];

    const html = await watchResponse.text();
    const playerJson =
      tryExtractJsonObject(html, "var ytInitialPlayerResponse =") || tryExtractJsonObject(html, "ytInitialPlayerResponse =");
    if (!playerJson) return [];

    const parsed = JSON.parse(playerJson) as WatchPagePlayerResponse;
    const tracks = parsed.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks || tracks.length === 0) return [];
    return fetchFirstAvailableTrackSegments(videoId, tracks);
  };

  return withTimeout(fetchCore(), TRANSCRIPT_FALLBACK_TIMEOUT_MS, "Transcript fallback fetch timed out");
}

async function fetchTranscriptFromInnertubeAndroid(videoId: string): Promise<TranscriptSegmentRow[]> {
  const fetchCore = async () => {
    const watchResponse = await fetch(buildWatchPageUrl(videoId), {
      headers: buildYouTubeRequestHeaders(videoId, DESKTOP_USER_AGENT, "ja"),
    });
    if (!watchResponse.ok) return [];

    const html = await watchResponse.text();
    const apiKey = extractInnertubeWebApiKey(html);
    if (!apiKey) return [];

    const playerResponse = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}&prettyPrint=false`, {
      method: "POST",
      headers: buildYouTubeRequestHeaders(videoId, ANDROID_USER_AGENT, "ja", {
        "Content-Type": "application/json",
        "X-Youtube-Client-Name": "3",
        "X-Youtube-Client-Version": ANDROID_CLIENT_VERSION,
      }),
      body: JSON.stringify({
        context: {
          client: {
            clientName: "ANDROID",
            clientVersion: ANDROID_CLIENT_VERSION,
            androidSdkVersion: ANDROID_SDK_VERSION,
            hl: "ja",
            gl: "JP",
          },
        },
        videoId,
        racyCheckOk: true,
        contentCheckOk: true,
      }),
    });
    if (!playerResponse.ok) return [];

    const playerJson = (await playerResponse.json()) as InnertubePlayerResponse;
    const tracks = playerJson.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!tracks || tracks.length === 0) return [];
    return fetchFirstAvailableTrackSegments(videoId, tracks);
  };

  return withTimeout(fetchCore(), TRANSCRIPT_FALLBACK_TIMEOUT_MS, "Transcript android fallback fetch timed out");
}

async function isYtDlpAvailable(): Promise<boolean> {
  if (ytDlpAvailableCache !== null) return ytDlpAvailableCache;

  try {
    await execFile(YT_DLP_BINARY, ["--version"], { timeout: YT_DLP_VERSION_TIMEOUT_MS });
    ytDlpAvailableCache = true;
  } catch {
    ytDlpAvailableCache = false;
  }
  return ytDlpAvailableCache;
}

function parseJson3Subtitles(json3Content: string): TranscriptSegmentRow[] {
  const parsed = JSON.parse(json3Content) as { events?: Json3Event[] };
  const events = parsed.events;
  if (!Array.isArray(events)) return [];

  const segments: { start: number; text: string }[] = [];
  for (const event of events) {
    if (!event.segs || typeof event.tStartMs !== "number") continue;
    const text = event.segs
      .map((segment) => segment.utf8 || "")
      .join("")
      .trim();
    if (!text || text === "\n") continue;
    segments.push({ start: event.tStartMs / 1000, text });
  }
  return segments;
}

function chooseThumbnailUrl(videoId: string, metadataThumbnailUrl?: string): string {
  return metadataThumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

async function fetchTranscriptFromYtDlp(videoId: string): Promise<TranscriptSegmentRow[]> {
  if (!(await isYtDlpAvailable())) return [];

  const tempDir = await mkdtemp(join(tmpdir(), "ytdlp-"));
  try {
    const outputTemplate = join(tempDir, "%(id)s");
    const args = [
      "--skip-download",
      "--write-sub",
      "--write-auto-sub",
      "--sub-lang",
      "ja,ja-orig,en,en-orig",
      "--sub-format",
      "json3",
      "--js-runtimes",
      YT_DLP_JS_RUNTIME,
      "-o",
      outputTemplate,
      `https://www.youtube.com/watch?v=${videoId}`,
    ];

    let execError: Error | null = null;
    try {
      await execFile(YT_DLP_BINARY, args, { timeout: YT_DLP_TIMEOUT_MS });
    } catch (error) {
      execError = error instanceof Error ? error : new Error(String(error));
    }

    let bestSegments: TranscriptSegmentRow[] = [];
    const languagePriority = ["ja", "ja-orig", "en", "en-orig"];
    for (const language of languagePriority) {
      const subtitlePath = join(tempDir, `${videoId}.${language}.json3`);
      try {
        const content = await readFile(subtitlePath, "utf-8");
        const segments = normalizeTranscriptSegments(parseJson3Subtitles(content));
        if (segments.length > 0 && compareTranscriptCandidates(segments, bestSegments) > 0) {
          bestSegments = segments;
        }
      } catch {
        // try next file
      }
    }

    const allFiles = await glob("*.json3", { cwd: tempDir });
    for (const file of allFiles) {
      try {
        const content = await readFile(join(tempDir, file), "utf-8");
        const segments = normalizeTranscriptSegments(parseJson3Subtitles(content));
        if (segments.length > 0 && compareTranscriptCandidates(segments, bestSegments) > 0) {
          bestSegments = segments;
        }
      } catch {
        // skip invalid file
      }
    }

    if (bestSegments.length === 0 && execError) {
      throw execError;
    }

    return bestSegments;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function fetchTranscriptDiagnostics(videoId: string): Promise<{
  segments: TranscriptSegmentRow[];
  diagnostics: StageDiagnostic[];
}> {
  return fetchTranscriptDiagnosticsWithDuration(videoId, 0);
}

async function fetchTranscriptDiagnosticsWithDuration(videoId: string, expectedDurationSeconds: number): Promise<{
  segments: TranscriptSegmentRow[];
  diagnostics: StageDiagnostic[];
}> {
  const diagnostics: StageDiagnostic[] = [];
  let bestSegments: TranscriptSegmentRow[] = [];

  const stages = [
    { stage: "yt-dlp", run: () => fetchTranscriptFromYtDlp(videoId) },
    { stage: "caption-extractor", run: () => fetchTranscriptFromCaptionExtractor(videoId) },
    { stage: "transcript-plus", run: () => fetchTranscriptFromTranscriptPlus(videoId) },
    { stage: "innertube-android", run: () => fetchTranscriptFromInnertubeAndroid(videoId) },
    { stage: "watch-page", run: () => fetchTranscriptFromWatchPage(videoId) },
  ];

  for (const candidate of stages) {
    try {
      const segments = normalizeTranscriptSegments(await candidate.run());
      if (segments.length > 0) {
        diagnostics.push({ stage: candidate.stage, success: true });
        if (compareTranscriptCandidates(segments, bestSegments, expectedDurationSeconds) > 0) {
          bestSegments = segments;
        }
        if (isTranscriptLikelyComplete(bestSegments, expectedDurationSeconds)) {
          return { segments: bestSegments, diagnostics };
        }
        continue;
      }
      diagnostics.push({ stage: candidate.stage, success: false, error: "No segments returned" });
    } catch (error) {
      diagnostics.push({
        stage: candidate.stage,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { segments: bestSegments, diagnostics };
}

async function loadVideoMetadata(videoId: string): Promise<{
  metadata: VideoMetadata;
  durationSeconds: number;
}> {
  const apiKey = getApiKey();

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${apiKey}`,
  );
  if (!response.ok) {
    throw new UpstreamServiceError(`YouTube Data API videos error: ${response.status}`);
  }

  const json = (await response.json()) as YouTubeDataApiVideoResponse;
  const item = json.items?.[0];
  if (!item) {
    throw new UpstreamServiceError("Could not retrieve video metadata from YouTube Data API.");
  }

  return {
    metadata: {
      title: item.snippet?.title || "Unknown Title",
      thumbnailUrl:
        item.snippet?.thumbnails?.maxres?.url ||
        item.snippet?.thumbnails?.standard?.url ||
        item.snippet?.thumbnails?.high?.url ||
        item.snippet?.thumbnails?.medium?.url ||
        item.snippet?.thumbnails?.default?.url ||
        "",
      viewCount: item.statistics?.viewCount || "0",
      publishDate: item.snippet?.publishedAt || "",
      author: item.snippet?.channelTitle || "Unknown Author",
    },
    durationSeconds: parseDurationToSeconds(item.contentDetails?.duration),
  };
}

async function fetchChannelExtra(videoId: string): Promise<ChannelExtra | null> {
  const apiKey = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  try {
    const videoResponse = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`);
    if (!videoResponse.ok) throw new Error(`YouTube Data API videos error: ${videoResponse.status}`);
    const videoJson = (await videoResponse.json()) as YouTubeDataApiVideoResponse;
    const channelId = videoJson.items?.[0]?.snippet?.channelId;
    if (!channelId) return null;

    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${apiKey}`,
    );
    if (!channelResponse.ok) throw new Error(`YouTube Data API channels error: ${channelResponse.status}`);

    const channelJson = (await channelResponse.json()) as YouTubeChannelResponse;
    const channelItem = channelJson.items?.[0];
    if (!channelItem) return null;

    return {
      channelId,
      subscribers: Number(channelItem.statistics?.subscriberCount || "0") || 0,
      channelCreatedAt: channelItem.snippet?.publishedAt || "",
    };
  } catch {
    return null;
  }
}

async function fetchCommentsFromDataApi(videoId: string): Promise<CommentItem[]> {
  const apiKey = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return [];

  const response = await fetch(
    `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=100&textFormat=plainText&order=time&key=${apiKey}`,
  );
  if (!response.ok) {
    throw new Error(`YouTube Data API commentThreads error: ${response.status}`);
  }

  const json = (await response.json()) as { items?: CommentThreadItem[] };
  return (json.items || [])
    .map((item) => {
      const snippet = item.snippet?.topLevelComment?.snippet;
      if (!snippet) return null;
      const author = snippet.authorDisplayName || "Unknown";
      const text = snippet.textDisplay || snippet.textOriginal || "";
      const likes = typeof snippet.likeCount === "number" ? snippet.likeCount : 0;
      if (!text) return null;
      return { author, text, likes };
    })
    .filter((comment): comment is CommentItem => comment !== null);
}

async function fetchCommentsFromInnertube(videoId: string): Promise<CommentItem[]> {
  const fetchCore = async () => {
    const youtube = await Innertube.create({ lang: "ja", location: "JP" });
    const commentsResponse = await youtube.getComments(videoId);
    const comments: CommentItem[] = [];
    if (!commentsResponse?.contents) return comments;

    let count = 0;
    for await (const comment of commentsResponse.contents) {
      if (comment.type !== "Comment" && comment.type !== "CommentThread") continue;
      const commentData = (comment.type === "CommentThread" ? comment.comment : comment) as CommentShape;
      const author = commentData.author?.name || "Unknown";
      const text = commentData.content?.toString() || "";
      const likesRaw = commentData.like_count;
      const likes = typeof likesRaw === "string" ? Number(likesRaw.replace(/[^0-9]/g, "")) || 0 : likesRaw || 0;
      if (!text) continue;
      comments.push({ author, text, likes });
      count += 1;
      if (count >= 500) break;
    }
    return comments;
  };

  return withTimeout(fetchCore(), COMMENTS_TIMEOUT_MS, "Comments fetch timed out");
}

async function loadComments(videoId: string, includeComments: boolean): Promise<{
  comments: CommentItem[];
  diagnostics: StageDiagnostic[];
}> {
  if (!includeComments) {
    return {
      comments: [],
      diagnostics: [{ stage: "comments-skipped", success: true }],
    };
  }

  const diagnostics: StageDiagnostic[] = [];
  try {
    const comments = await withTimeout(fetchCommentsFromDataApi(videoId), COMMENTS_TIMEOUT_MS, "Comments fetch timed out");
    if (comments.length > 0) {
      diagnostics.push({ stage: "data-api", success: true });
      return { comments, diagnostics };
    }
    diagnostics.push({ stage: "data-api", success: false, error: "No comments returned" });
  } catch (error) {
    diagnostics.push({ stage: "data-api", success: false, error: error instanceof Error ? error.message : String(error) });
  }

  try {
    const comments = await fetchCommentsFromInnertube(videoId);
    if (comments.length > 0) {
      diagnostics.push({ stage: "innertube", success: true });
      return { comments, diagnostics };
    }
    diagnostics.push({ stage: "innertube", success: false, error: "No comments returned" });
  } catch (error) {
    diagnostics.push({ stage: "innertube", success: false, error: error instanceof Error ? error.message : String(error) });
  }

  return { comments: [], diagnostics };
}

function buildRawVideoData(params: {
  videoId: string;
  url: string;
  metadata: VideoMetadata;
  durationSeconds: number;
  comments: CommentItem[];
  transcriptSegments: { start: number; text: string }[];
  channelExtra: ChannelExtra | null;
}) {
  return {
    videoId: params.videoId,
    url: params.url,
    thumbnailUrl: chooseThumbnailUrl(params.videoId, params.metadata.thumbnailUrl),
    title: params.metadata.title,
    channelId: params.channelExtra?.channelId ?? "",
    channelName: params.metadata.author,
    subscribers: params.channelExtra?.subscribers ?? 0,
    channelCreatedAt: params.channelExtra?.channelCreatedAt ?? "",
    publishedAt: params.metadata.publishDate,
    views: Number(params.metadata.viewCount) || 0,
    duration: params.durationSeconds > 0 ? secondsToIsoDuration(params.durationSeconds) : "",
    transcript: params.transcriptSegments.map((segment) => ({
      time: formatTranscriptTime(segment.start),
      text: segment.text,
    })),
    comments: params.comments,
  };
}

export async function extractVideoResearchRaw(input: ExtractVideoInput): Promise<ExtractVideoResponse> {
  const normalizedUrl = normalizeYouTubeUrl(input.url || "");
  const videoId = parseVideoUrl(normalizedUrl);
  if (!normalizedUrl || !videoId) {
    throw new BadRequestError("Invalid YouTube URL");
  }

  const includeTranscript = input.includeTranscript ?? true;
  const includeComments = input.includeComments ?? true;

  const metadataDiagnostics: StageDiagnostic[] = [];
  const channelExtraPromise = fetchChannelExtra(videoId);
  const metadataResult = await loadVideoMetadata(videoId);
  metadataDiagnostics.push({ stage: "data-api", success: true });

  const transcriptResult = includeTranscript
    ? await fetchTranscriptDiagnosticsWithDuration(videoId, metadataResult.durationSeconds)
    : { segments: [], diagnostics: [{ stage: "transcript-skipped", success: true }] };
  const commentsResult = await loadComments(videoId, includeComments);
  const channelExtra = await channelExtraPromise;

  return {
    rawData: buildRawVideoData({
      videoId,
      url: normalizedUrl,
      metadata: metadataResult.metadata,
      durationSeconds: metadataResult.durationSeconds,
      comments: commentsResult.comments,
      transcriptSegments: transcriptResult.segments,
      channelExtra,
    }),
    metadata: metadataResult.metadata,
    diagnostics: {
      transcript: transcriptResult.diagnostics,
      comments: commentsResult.diagnostics,
      metadata: metadataDiagnostics,
    },
  };
}
