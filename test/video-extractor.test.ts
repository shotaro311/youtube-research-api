import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchTranscriptMock, getSubtitlesMock } = vi.hoisted(() => ({
  fetchTranscriptMock: vi.fn(),
  getSubtitlesMock: vi.fn(),
}));

vi.mock("youtube-caption-extractor", () => ({
  getSubtitles: getSubtitlesMock,
}));

vi.mock("youtube-transcript-plus", () => ({
  fetchTranscript: fetchTranscriptMock,
}));

vi.mock("youtubei.js", () => ({
  Innertube: {
    create: vi.fn(),
  },
}));

import { formatTranscriptTime, parseDurationToSeconds } from "../src/domain/youtube/shared";
import { extractVideoResearchRaw, parseVideoUrl } from "../src/domain/youtube/video-extractor";

function createJsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn<(input: string | URL | Request) => Promise<Response>>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  process.env.VERCEL = "1";
  process.env.YOUTUBE_API_KEY = "test-api-key";

  fetchMock.mockImplementation(async (input) => {
    const url = String(input);

    if (url.startsWith("https://www.googleapis.com/youtube/v3/videos?")) {
      return createJsonResponse({
        items: [
          {
            snippet: {
              title: "Test Video",
              publishedAt: "2024-01-01T00:00:00Z",
              channelTitle: "Test Channel",
              channelId: "channel-1",
            },
            statistics: {
              viewCount: "1234",
            },
            contentDetails: {
              duration: "PT10M0S",
            },
          },
        ],
      });
    }

    if (url.startsWith("https://www.googleapis.com/youtube/v3/channels?")) {
      return createJsonResponse({
        items: [
          {
            snippet: {
              publishedAt: "2020-01-01T00:00:00Z",
            },
            statistics: {
              subscriberCount: "999",
            },
          },
        ],
      });
    }

    throw new Error(`Unexpected fetch in test: ${url}`);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  delete process.env.VERCEL;
  delete process.env.YOUTUBE_API_KEY;
});

describe("parseVideoUrl", () => {
  it("extracts video id from watch url", () => {
    expect(parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts video id from youtu.be url", () => {
    expect(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("extracts video id from shorts url", () => {
    expect(parseVideoUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("rejects non youtube urls", () => {
    expect(parseVideoUrl("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});

describe("shared helpers", () => {
  it("parses ISO 8601 durations", () => {
    expect(parseDurationToSeconds("PT1H2M3S")).toBe(3723);
  });

  it("formats transcript timestamps", () => {
    expect(formatTranscriptTime(65)).toBe("01:05");
    expect(formatTranscriptTime(3723)).toBe("01:02:03");
  });
});

describe("extractVideoResearchRaw transcript selection", () => {
  it("prefers a fuller transcript from a later fallback stage", async () => {
    getSubtitlesMock.mockImplementation(async ({ lang }: { lang?: string }) => {
      if (lang === "ja") {
        return [
          { start: "0", text: "冒頭" },
          { start: "120", text: "途中まで" },
        ];
      }
      return [];
    });

    fetchTranscriptMock.mockImplementation(async (videoId: string, options?: { lang?: string }) => {
      if (videoId === "dQw4w9WgXcQ" && options?.lang === "ja") {
        return [
          { offset: 0, text: "冒頭" },
          { offset: 240, text: "中盤" },
          { offset: 580, text: "終盤" },
        ];
      }
      return [];
    });

    const result = await extractVideoResearchRaw({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      includeComments: false,
    });

    expect(result.rawData.transcript).toEqual([
      { time: "00:00", text: "冒頭" },
      { time: "04:00", text: "中盤" },
      { time: "09:40", text: "終盤" },
    ]);
    expect(result.diagnostics.transcript).toEqual([
      { stage: "yt-dlp", success: false, error: "No segments returned" },
      { stage: "caption-extractor", success: true },
      { stage: "transcript-plus", success: true },
    ]);
  });

  it("retries transcript-plus with an alternate browser profile when the first one returns nothing", async () => {
    getSubtitlesMock.mockResolvedValue([]);

    const userAgents: string[] = [];
    fetchTranscriptMock.mockImplementation(async (_videoId: string, options?: { lang?: string; userAgent?: string }) => {
      userAgents.push(options?.userAgent || "missing");

      if (options?.userAgent?.includes("Chrome/120")) {
        return [];
      }

      if (options?.lang === "ja") {
        return [
          { offset: 0, text: "冒頭" },
          { offset: 580, text: "終盤" },
        ];
      }

      return [];
    });

    const result = await extractVideoResearchRaw({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      includeComments: false,
    });

    expect(userAgents.some((value) => value.includes("Chrome/120"))).toBe(true);
    expect(userAgents.some((value) => value.includes("Chrome/131"))).toBe(true);
    expect(result.rawData.transcript).toEqual([
      { time: "00:00", text: "冒頭" },
      { time: "09:40", text: "終盤" },
    ]);
    expect(result.diagnostics.transcript).toEqual([
      { stage: "yt-dlp", success: false, error: "No segments returned" },
      { stage: "caption-extractor", success: false, error: "No segments returned" },
      { stage: "transcript-plus", success: true },
    ]);
  });

  it("chooses the fullest transcript across languages inside the same stage", async () => {
    getSubtitlesMock.mockImplementation(async ({ lang }: { lang?: string }) => {
      if (lang === "ja") {
        return [
          { start: "0", text: "冒頭" },
          { start: "90", text: "短い字幕" },
        ];
      }
      if (lang === "en") {
        return [
          { start: "0", text: "intro" },
          { start: "210", text: "middle" },
          { start: "575", text: "ending" },
        ];
      }
      return [];
    });

    const result = await extractVideoResearchRaw({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      includeComments: false,
    });

    expect(result.rawData.transcript).toEqual([
      { time: "00:00", text: "intro" },
      { time: "03:30", text: "middle" },
      { time: "09:35", text: "ending" },
    ]);
    expect(fetchTranscriptMock).not.toHaveBeenCalled();
    expect(result.diagnostics.transcript).toEqual([
      { stage: "yt-dlp", success: false, error: "No segments returned" },
      { stage: "caption-extractor", success: true },
    ]);
  });

  it("falls back to json3 caption tracks from the watch page when xml is unavailable", async () => {
    getSubtitlesMock.mockResolvedValue([]);
    fetchTranscriptMock.mockResolvedValue([]);

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);

      if (url.startsWith("https://www.googleapis.com/youtube/v3/videos?")) {
        return createJsonResponse({
          items: [
            {
              snippet: {
                title: "Test Video",
                publishedAt: "2024-01-01T00:00:00Z",
                channelTitle: "Test Channel",
                channelId: "channel-1",
              },
              statistics: {
                viewCount: "1234",
              },
              contentDetails: {
                duration: "PT10M0S",
              },
            },
          ],
        });
      }

      if (url.startsWith("https://www.googleapis.com/youtube/v3/channels?")) {
        return createJsonResponse({
          items: [
            {
              snippet: {
                publishedAt: "2020-01-01T00:00:00Z",
              },
              statistics: {
                subscriberCount: "999",
              },
            },
          ],
        });
      }

      if (url.startsWith("https://www.youtube.com/watch?v=")) {
        return {
          ok: true,
          text: async () =>
            'var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"languageCode":"ja","baseUrl":"https://example.com/api/timedtext?v=test123"}]}}};',
        } as Response;
      }

      if (url.startsWith("https://example.com/api/timedtext") && url.includes("fmt=json3")) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              events: [
                { tStartMs: 0, segs: [{ utf8: "冒頭" }] },
                { tStartMs: 240000, segs: [{ utf8: "中盤" }] },
                { tStartMs: 580000, segs: [{ utf8: "終盤" }] },
              ],
            }),
        } as Response;
      }

      if (url.startsWith("https://example.com/api/timedtext")) {
        return {
          ok: true,
          text: async () => "",
        } as Response;
      }

      throw new Error(`Unexpected fetch in test: ${url}`);
    });

    const result = await extractVideoResearchRaw({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      includeComments: false,
    });

    expect(result.rawData.transcript).toEqual([
      { time: "00:00", text: "冒頭" },
      { time: "04:00", text: "中盤" },
      { time: "09:40", text: "終盤" },
    ]);
    expect(result.diagnostics.transcript).toEqual([
      { stage: "yt-dlp", success: false, error: "No segments returned" },
      { stage: "caption-extractor", success: false, error: "No segments returned" },
      { stage: "transcript-plus", success: false, error: "No segments returned" },
      { stage: "innertube-android", success: false, error: "No segments returned" },
      { stage: "watch-page", success: true },
    ]);
  });

  it("resolves caption tracks exposed as signatureCipher", async () => {
    getSubtitlesMock.mockResolvedValue([]);
    fetchTranscriptMock.mockResolvedValue([]);

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);

      if (url.startsWith("https://www.googleapis.com/youtube/v3/videos?")) {
        return createJsonResponse({
          items: [
            {
              snippet: {
                title: "Test Video",
                publishedAt: "2024-01-01T00:00:00Z",
                channelTitle: "Test Channel",
                channelId: "channel-1",
              },
              statistics: {
                viewCount: "1234",
              },
              contentDetails: {
                duration: "PT10M0S",
              },
            },
          ],
        });
      }

      if (url.startsWith("https://www.googleapis.com/youtube/v3/channels?")) {
        return createJsonResponse({
          items: [
            {
              snippet: {
                publishedAt: "2020-01-01T00:00:00Z",
              },
              statistics: {
                subscriberCount: "999",
              },
            },
          ],
        });
      }

      if (url.startsWith("https://www.youtube.com/watch?v=")) {
        return {
          ok: true,
          text: async () =>
            'var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[{"languageCode":"ja","signatureCipher":"url=https%3A%2F%2Fexample.com%2Fapi%2Ftimedtext%3Fv%3Dtest123&sig=test-signature&sp=signature"}]}}};',
        } as Response;
      }

      if (url.startsWith("https://example.com/api/timedtext") && url.includes("fmt=json3")) {
        expect(url).toContain("signature=test-signature");
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              events: [
                { tStartMs: 0, segs: [{ utf8: "冒頭" }] },
                { tStartMs: 120000, segs: [{ utf8: "中盤" }] },
              ],
            }),
        } as Response;
      }

      if (url.startsWith("https://example.com/api/timedtext")) {
        return {
          ok: true,
          text: async () => "",
        } as Response;
      }

      throw new Error(`Unexpected fetch in test: ${url}`);
    });

    const result = await extractVideoResearchRaw({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      includeComments: false,
    });

    expect(result.rawData.transcript).toEqual([
      { time: "00:00", text: "冒頭" },
      { time: "02:00", text: "中盤" },
    ]);
    expect(result.diagnostics.transcript).toEqual([
      { stage: "yt-dlp", success: false, error: "No segments returned" },
      { stage: "caption-extractor", success: false, error: "No segments returned" },
      { stage: "transcript-plus", success: false, error: "No segments returned" },
      { stage: "innertube-android", success: false, error: "No segments returned" },
      { stage: "watch-page", success: true },
    ]);
  });
});
