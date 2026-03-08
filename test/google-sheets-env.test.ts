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

import {
  appendAiExtractRows,
  deleteStoredCommentAnalysis,
  saveStoredCommentAnalysis,
} from "../src/server/google-sheets";

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
  "sentiment",
  "viewer_type",
  "psychology",
  "note",
  "analysis_updated_at",
];

const commentSheetHeader = [
  "コメントID",
  "動画タイトル",
  "動画リンク",
  "チャンネル名",
  "投稿者",
  "コメント本文",
  "感情タグ",
  "視聴者像",
  "心理",
  "個別フィードバック",
  "分析更新日時",
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
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        data: {
          updates: {
            updatedRange: "動画分析!A2:K2",
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
                title: "動画分析",
              },
            },
            {
              properties: {
                sheetId: 123456789,
                title: "コメントDB",
                gridProperties: {
                  columnCount: 17,
                },
              },
            },
            {
              properties: {
                sheetId: 987654321,
                title: "コメント分析",
                gridProperties: {
                  columnCount: 11,
                },
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
                title: "動画分析",
              },
            },
            {
              properties: {
                sheetId: 123456789,
                title: "コメントDB",
                gridProperties: {
                  columnCount: 17,
                },
              },
            },
            {
              properties: {
                sheetId: 987654321,
                title: "コメント分析",
                gridProperties: {
                  columnCount: 11,
                },
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
                title: "動画分析",
              },
            },
          ],
        },
    });
    valueGetMock
      .mockResolvedValueOnce({
        data: {
          values: [],
        },
      })
      .mockResolvedValueOnce({
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
    process.env.GOOGLE_SHEETS_COMMENT_SHEET_NAME = "コメントシート\n";

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
    expect(appendMock).toHaveBeenCalledTimes(4);
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
        range: "コメントDB!A:Q",
      }),
    );
    expect(appendMock).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
        range: "コメント分析!A:K",
      }),
    );

    const fourthCall = appendMock.mock.calls[3]?.[0];
    expect(fourthCall).toEqual(
      expect.objectContaining({
        spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
        range: "動画分析!A:K",
      }),
    );
    expect(fourthCall?.requestBody?.values?.[0]?.[9]).toMatch(/^=HYPERLINK\("https:\/\/example\.com\/scripts\//);
    expect(fourthCall?.requestBody?.values?.[0]?.[10]).toMatch(/^=HYPERLINK\("https:\/\/example\.com\/scripts\//);
    expect(fourthCall?.requestBody?.values?.[0]?.[1]).toBe(
      '=IMAGE("https://i.ytimg.com/vi/abc123/hqdefault.jpg",4,162,288)',
    );
    expect(valueGetMock).toHaveBeenNthCalledWith(1, {
      spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
      range: "コメントDB!A1:Q1",
    });
    expect(valueGetMock).toHaveBeenNthCalledWith(2, {
      spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
      range: "コメント分析!A1:K1",
    });
    expect(valueUpdateMock).toHaveBeenNthCalledWith(1, {
      spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
      range: "コメントDB!A1:Q1",
      valueInputOption: "RAW",
      requestBody: {
        values: [commentDbHeader],
      },
    });
    expect(valueUpdateMock).toHaveBeenNthCalledWith(2, {
      spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
      range: "コメント分析!A1:K1",
      valueInputOption: "RAW",
      requestBody: {
        values: [commentSheetHeader],
      },
    });
    expect(spreadsheetGetMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
        fields: "sheets(properties(sheetId,title,gridProperties(columnCount)))",
      }),
    );
    expect(spreadsheetGetMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
        fields: "sheets(properties(sheetId,title,gridProperties(columnCount)))",
      }),
    );
    expect(spreadsheetGetMock).toHaveBeenNthCalledWith(
      3,
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

  it("creates the comment sheets when they do not exist yet", async () => {
    appendMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        data: {
          updates: {
            updatedRange: "動画分析!A2:K2",
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
                title: "動画分析",
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
                title: "動画分析",
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
                title: "動画分析",
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
                    columnCount: 17,
                  },
                },
              },
            },
          ],
        },
      }),
    );
    expect(batchUpdateMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: "コメント分析",
                  gridProperties: {
                    rowCount: 1000,
                    columnCount: 11,
                  },
                },
              },
            },
          ],
        },
      }),
    );
    expect(valueUpdateMock).toHaveBeenNthCalledWith(1, {
      spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
      range: "コメントDB!A1:Q1",
      valueInputOption: "RAW",
      requestBody: {
        values: [commentDbHeader],
      },
    });
    expect(valueUpdateMock).toHaveBeenNthCalledWith(2, {
      spreadsheetId: "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME",
      range: "コメント分析!A1:K1",
      valueInputOption: "RAW",
      requestBody: {
        values: [commentSheetHeader],
      },
    });
  });
});

describe("comment analysis sheet sync", () => {
  it("writes per-comment analysis columns into コメントDB and コメント分析 on save", async () => {
    valueGetMock
      .mockResolvedValueOnce({
        data: {
          values: [
            ["script-1", "video-1", "https://example.com/watch?v=1", "Title", "meta", "0", JSON.stringify({
              channelName: "Test Channel",
              publishedAt: "2024-01-01T00:00:00Z",
            }), "2026-03-08T00:00:00.000Z"],
            ["script-1", "video-1", "https://example.com/watch?v=1", "Title", "comments", "0", "A: one", "2026-03-08T00:00:00.000Z"],
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          values: [commentDbHeader],
        },
      })
      .mockResolvedValueOnce({
        data: {
          values: [
            commentDbHeader,
            [
              "script-1:1",
              "script-1",
              "video-1",
              "https://example.com/watch?v=1",
              "Title",
              "Test Channel",
              "2024-01-01T00:00:00Z",
              "1",
              "A",
              "one",
              "3",
              "2026-03-08T00:00:00.000Z",
            ],
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          values: [commentSheetHeader],
        },
      })
      .mockResolvedValueOnce({
        data: {
          values: [
            commentSheetHeader,
            [
              "script-1:1",
              "Title",
              "https://example.com/watch?v=1",
              "Test Channel",
              "A",
              "one",
            ],
          ],
        },
      });
    spreadsheetGetMock.mockResolvedValue({
      data: {
        sheets: [
          {
            properties: {
              sheetId: 123456789,
              title: "コメントDB",
              gridProperties: {
                columnCount: 17,
              },
            },
          },
          {
            properties: {
              sheetId: 987654321,
              title: "コメント分析",
              gridProperties: {
                columnCount: 11,
              },
            },
          },
        ],
      },
    });
    appendMock.mockResolvedValue({});
    valueUpdateMock.mockResolvedValue({});
    batchUpdateMock.mockResolvedValue({});
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({
      client_email: "service-account@example.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
    });

    await saveStoredCommentAnalysis("script-1", {
      title: "コメント分析結果",
      overview: "overview",
      positivePercent: 100,
      neutralPercent: 0,
      negativePercent: 0,
      audienceSummary: "audience",
      psychologySummary: "psychology",
      positiveThemes: [],
      negativeThemes: [],
      items: [
        {
          commentIndex: 1,
          sentiment: "positive",
          viewerType: "視聴者像",
          psychology: "心理",
          note: "メモ",
        },
      ],
    });

    expect(appendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        range: "台本DB!A:H",
      }),
    );
    expect(valueUpdateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        range: "コメントDB!M2:Q2",
        valueInputOption: "RAW",
        requestBody: {
          values: [[
            "positive",
            "視聴者像",
            "心理",
            "メモ",
            expect.any(String),
          ]],
        },
      }),
    );
    expect(valueUpdateMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        range: "コメント分析!G2:K2",
        valueInputOption: "RAW",
        requestBody: {
          values: [[
            "positive",
            "視聴者像",
            "心理",
            "メモ",
            expect.any(String),
          ]],
        },
      }),
    );
  });

  it("clears per-comment analysis columns in コメントDB and コメント分析 on delete", async () => {
    valueGetMock
      .mockResolvedValueOnce({
        data: {
          values: [],
        },
      })
      .mockResolvedValueOnce({
        data: {
          values: [commentDbHeader],
        },
      })
      .mockResolvedValueOnce({
        data: {
          values: [
            commentDbHeader,
            [
              "script-1:1",
              "script-1",
              "video-1",
              "https://example.com/watch?v=1",
              "Title",
              "Test Channel",
              "2024-01-01T00:00:00Z",
              "1",
              "A",
              "one",
              "3",
              "2026-03-08T00:00:00.000Z",
              "positive",
              "視聴者像",
              "心理",
              "メモ",
              "2026-03-08T12:00:00.000Z",
            ],
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          values: [commentSheetHeader],
        },
      })
      .mockResolvedValueOnce({
        data: {
          values: [
            commentSheetHeader,
            [
              "script-1:1",
              "Title",
              "https://example.com/watch?v=1",
              "Test Channel",
              "A",
              "one",
              "positive",
              "視聴者像",
              "心理",
              "メモ",
              "2026-03-08T12:00:00.000Z",
            ],
          ],
        },
      });
    spreadsheetGetMock.mockResolvedValue({
      data: {
        sheets: [
          {
            properties: {
              sheetId: 123456789,
              title: "コメントDB",
              gridProperties: {
                columnCount: 17,
              },
            },
          },
          {
            properties: {
              sheetId: 987654321,
              title: "コメント分析",
              gridProperties: {
                columnCount: 11,
              },
            },
          },
        ],
      },
    });
    valueUpdateMock.mockResolvedValue({});
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({
      client_email: "service-account@example.com",
      private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n",
    });

    await deleteStoredCommentAnalysis("script-1");

    expect(valueUpdateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        range: "コメントDB!M2:Q2",
        valueInputOption: "RAW",
        requestBody: {
          values: [["", "", "", "", ""]],
        },
      }),
    );
    expect(valueUpdateMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        range: "コメント分析!G2:K2",
        valueInputOption: "RAW",
        requestBody: {
          values: [["", "", "", "", ""]],
        },
      }),
    );
  });
});
