import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExtractVideoResponse } from "../src/domain/youtube/types";

const { appendMock, googleAuthMock, sheetsFactoryMock } = vi.hoisted(() => ({
  appendMock: vi.fn(),
  googleAuthMock: vi.fn(function GoogleAuthMock(this: { mocked: boolean }) {
    this.mocked = true;
  }),
  sheetsFactoryMock: vi.fn(() => ({
    spreadsheets: {
      values: {
        append: appendMock,
      },
    },
  })),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      GoogleAuth: googleAuthMock,
    },
    sheets: sheetsFactoryMock,
  },
}));

import { appendAiExtractRows } from "../src/server/google-sheets";

const originalEnv = { ...process.env };

const item: ExtractVideoResponse = {
  rawData: {
    videoId: "abc123",
    url: "https://www.youtube.com/watch?v=abc123",
    thumbnailUrl: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    title: "Test Title",
    channelId: "channel-1",
    channelName: "Test Channel",
    subscribers: 999,
    channelCreatedAt: "2020-01-01T00:00:00Z",
    publishedAt: "2024-01-01T00:00:00Z",
    views: 1234,
    duration: "PT10M",
    transcript: [{ time: "00:01", text: "hello" }],
    comments: [{ author: "a", text: "b", likes: 1 }],
  },
  metadata: {
    title: "Test Title",
    thumbnailUrl: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
    viewCount: "1234",
    publishDate: "2024-01-01T00:00:00Z",
    author: "Test Channel",
  },
  diagnostics: {
    metadata: [{ stage: "data-api", success: true }],
    transcript: [{ stage: "yt-dlp", success: true }],
    comments: [{ stage: "data-api", success: true }],
  },
};

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe("appendAiExtractRows", () => {
  it("trims spreadsheet settings loaded from environment variables", async () => {
    appendMock.mockResolvedValue({});
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({
      client_email: "service-account@example.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
    });
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME\n";
    process.env.GOOGLE_SHEETS_SHEET_NAME = "AI抽出\n";
    process.env.GOOGLE_SHEETS_SCRIPT_DB_SHEET_NAME = "台本DB\n";

    await appendAiExtractRows({
      items: [item],
      viewerBaseUrl: "https://example.com/\n",
    });

    expect(googleAuthMock).toHaveBeenCalledWith({
      credentials: {
        client_email: "service-account@example.com",
        private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    expect(appendMock).toHaveBeenCalledTimes(2);
    expect(appendMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
        range: "台本DB!A:H",
      }),
    );

    const secondCall = appendMock.mock.calls[1]?.[0];
    expect(secondCall).toEqual(
      expect.objectContaining({
        spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
        range: "AI抽出!A:K",
      }),
    );
    expect(secondCall?.requestBody?.values?.[0]?.[9]).toMatch(/^=HYPERLINK\("https:\/\/example\.com\/scripts\//);
    expect(secondCall?.requestBody?.values?.[0]?.[10]).toMatch(/^=HYPERLINK\("https:\/\/example\.com\/scripts\//);
  });
});
