import { describe, expect, it } from "vitest";

import { buildAiExtractSheetRows, buildScriptDbRows } from "../src/server/google-sheets";
import type { ExtractVideoResponse } from "../src/domain/youtube/types";

describe("buildAiExtractSheetRows", () => {
  it("maps extract results to the AI抽出 sheet columns", () => {
    const items: ExtractVideoResponse[] = [
      {
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
          transcript: [],
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
          transcript: [{ stage: "watch-page", success: true }],
          comments: [{ stage: "innertube", success: true }],
        },
      },
    ];

    expect(
      buildAiExtractSheetRows(items, [
        {
          scriptId: "abc123-script",
          transcriptUrl: "https://example.com/scripts/abc123-script?tab=transcript",
          commentsUrl: "https://example.com/scripts/abc123-script?tab=comments",
        },
      ]),
    ).toEqual([
      [
        "https://www.youtube.com/watch?v=abc123",
        '=IMAGE("https://i.ytimg.com/vi/abc123/hqdefault.jpg",4,162,288)',
        "Test Title",
        1234,
        "2024-01-01T00:00:00Z",
        1,
        "Test Channel",
        999,
        "abc123-script",
        '=HYPERLINK("https://example.com/scripts/abc123-script?tab=transcript","台本を見る")',
        '=HYPERLINK("https://example.com/scripts/abc123-script?tab=comments","コメントを見る")',
      ],
    ]);
  });
});

describe("buildScriptDbRows", () => {
  it("creates meta, transcript, and comment rows for the script database sheet", () => {
    const items: ExtractVideoResponse[] = [
      {
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
          transcript: [
            { time: "00:01", text: "hello" },
            { time: "00:02", text: "world" },
          ],
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
          transcript: [{ stage: "watch-page", success: true }],
          comments: [{ stage: "innertube", success: true }],
        },
      },
    ];

    expect(
      buildScriptDbRows(
        items,
        [
          {
            scriptId: "abc123-script",
            transcriptUrl: "https://example.com/scripts/abc123-script?tab=transcript",
            commentsUrl: "https://example.com/scripts/abc123-script?tab=comments",
          },
        ],
        "2026-03-07T00:00:00.000Z",
      ),
    ).toEqual([
      [
        "abc123-script",
        "abc123",
        "https://www.youtube.com/watch?v=abc123",
        "Test Title",
        "meta",
        "0",
        JSON.stringify({
          channelName: "Test Channel",
          publishedAt: "2024-01-01T00:00:00Z",
          views: 1234,
          subscribers: 999,
          thumbnailUrl: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
        }),
        "2026-03-07T00:00:00.000Z",
      ],
      [
        "abc123-script",
        "abc123",
        "https://www.youtube.com/watch?v=abc123",
        "Test Title",
        "transcript",
        "0",
        "00:01 hello\n00:02 world",
        "2026-03-07T00:00:00.000Z",
      ],
      [
        "abc123-script",
        "abc123",
        "https://www.youtube.com/watch?v=abc123",
        "Test Title",
        "comments",
        "0",
        "a: b",
        "2026-03-07T00:00:00.000Z",
      ],
    ]);
  });
});
