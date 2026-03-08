import { afterEach, describe, expect, it, vi } from "vitest";

import type { ExtractVideoResponse } from "../src/domain/youtube/types";

const {
  appendMock,
  batchUpdateMock,
  spreadsheetGetMock,
  valueGetMock,
  valueUpdateMock,
  googleAuthMock,
  sheetsFactoryMock,
} = vi.hoisted(() => ({
  appendMock: vi.fn(),
  batchUpdateMock: vi.fn(),
  spreadsheetGetMock: vi.fn(),
  valueGetMock: vi.fn(),
  valueUpdateMock: vi.fn(),
  googleAuthMock: vi.fn(function GoogleAuthMock(this: { mocked: boolean }) {
    this.mocked = true;
  }),
  sheetsFactoryMock: vi.fn(() => ({
    spreadsheets: {
      values: {
        append: appendMock,
        get: valueGetMock,
        update: valueUpdateMock,
      },
      batchUpdate: batchUpdateMock,
      get: spreadsheetGetMock,
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

const commentDbHeader = [
  "comment_id",
  "script_id",
  "video_id",
  "video_url",
  "title",
  "channel_name",
  "published_at",
  "comment_index",
  "author",
  "comment_text",
  "likes",
  "created_at",
];

afterEach(() => {
  process.env = { ...originalEnv };
  vi.clearAllMocks();
});

describe("appendAiExtractRows", () => {
  it("trims spreadsheet settings loaded from environment variables", async () => {
    appendMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        data: {
          updates: {
            updatedRange: "AI抽出!A2:K2",
          },
        },
      });
    spreadsheetGetMock
      .mockResolvedValueOnce({
        data: {
          sheets: [
            {
              properties: {
                sheetId: 916855654,
                title: "AI抽出",
              },
            },
            {
              properties: {
                sheetId: 123456789,
                title: "コメントDB",
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          sheets: [
            {
              properties: {
                sheetId: 916855654,
                title: "AI抽出",
              },
            },
          ],
        },
      });
    valueGetMock.mockResolvedValue({
      data: {
        values: [],
      },
    });
    valueUpdateMock.mockResolvedValue({});
    batchUpdateMock.mockResolvedValue({});
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({
      client_email: "service-account@example.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
    });
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME\n";
    process.env.GOOGLE_SHEETS_SHEET_NAME = "AI抽出\n";
    process.env.GOOGLE_SHEETS_SCRIPT_DB_SHEET_NAME = "台本DB\n";
    process.env.GOOGLE_SHEETS_COMMENT_DB_SHEET_NAME = "コメントDB\n";

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
    expect(appendMock).toHaveBeenCalledTimes(3);
    expect(appendMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
        range: "台本DB!A:H",
      }),
    );
    expect(appendMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
        range: "コメントDB!A:L",
      }),
    );

    const thirdCall = appendMock.mock.calls[2]?.[0];
    expect(thirdCall).toEqual(
      expect.objectContaining({
        spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
        range: "AI抽出!A:K",
      }),
    );
    expect(thirdCall?.requestBody?.values?.[0]?.[9]).toMatch(/^=HYPERLINK\("https:\/\/example\.com\/scripts\//);
    expect(thirdCall?.requestBody?.values?.[0]?.[10]).toMatch(/^=HYPERLINK\("https:\/\/example\.com\/scripts\//);
    expect(thirdCall?.requestBody?.values?.[0]?.[1]).toBe(
      '=IMAGE("https://i.ytimg.com/vi/abc123/hqdefault.jpg",4,162,288)',
    );
    expect(valueGetMock).toHaveBeenCalledWith({
      spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
      range: "コメントDB!A1:L1",
    });
    expect(valueUpdateMock).toHaveBeenCalledWith({
      spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
      range: "コメントDB!A1:L1",
      valueInputOption: "RAW",
      requestBody: {
        values: [commentDbHeader],
      },
    });
    expect(spreadsheetGetMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
        fields: "sheets(properties(sheetId,title))",
      }),
    );
    expect(spreadsheetGetMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
        fields: "sheets(properties(sheetId,title))",
      }),
    );
    expect(batchUpdateMock).toHaveBeenCalledWith({
      spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
      requestBody: {
        requests: [
          {
            updateDimensionProperties: {
              range: {
                sheetId: 916855654,
                dimension: "ROWS",
                startIndex: 1,
                endIndex: 2,
              },
              properties: {
                pixelSize: 178,
              },
              fields: "pixelSize",
            },
          },
          {
            updateDimensionProperties: {
              range: {
                sheetId: 916855654,
                dimension: "COLUMNS",
                startIndex: 1,
                endIndex: 2,
              },
              properties: {
                pixelSize: 304,
              },
              fields: "pixelSize",
            },
          },
        ],
      },
    });
  });

  it("creates the comment sheet when it does not exist yet", async () => {
    appendMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        data: {
          updates: {
            updatedRange: "AI抽出!A2:K2",
          },
        },
      });
    spreadsheetGetMock
      .mockResolvedValueOnce({
        data: {
          sheets: [
            {
              properties: {
                sheetId: 916855654,
                title: "AI抽出",
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          sheets: [
            {
              properties: {
                sheetId: 916855654,
                title: "AI抽出",
              },
            },
          ],
        },
      });
    valueUpdateMock.mockResolvedValue({});
    batchUpdateMock.mockResolvedValue({});
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({
      client_email: "service-account@example.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
    });

    await appendAiExtractRows({
      items: [item],
      viewerBaseUrl: "https://example.com/",
    });

    expect(batchUpdateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: "コメントDB",
                  gridProperties: {
                    rowCount: 1000,
                    columnCount: 12,
                  },
                },
              },
            },
          ],
        },
      }),
    );
    expect(valueUpdateMock).toHaveBeenCalledWith({
      spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
      range: "コメントDB!A1:L1",
      valueInputOption: "RAW",
      requestBody: {
        values: [commentDbHeader],
      },
    });
  });
});
