import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateContentMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn(function GoogleGenAIMock(this: { models: { generateContent: typeof generateContentMock } }) {
    this.models = {
      generateContent: generateContentMock,
    };
  }),
  Type: {
    OBJECT: "OBJECT",
    ARRAY: "ARRAY",
    STRING: "STRING",
    INTEGER: "INTEGER",
  },
}));

import { BadRequestError, UpstreamServiceError } from "../src/domain/youtube/errors";
import { formatTranscriptWithGemini } from "../src/server/gemini-transcript-formatter";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv, GEMINI_API_KEY: "test-key" };
  vi.clearAllMocks();
});

describe("formatTranscriptWithGemini", () => {
  it("keeps the original transcript text and only inserts headings and blank lines", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        title: "整形済み台本",
        sections: [
          {
            heading: "導入",
            startLine: 1,
            endLine: 3,
            speakerBreakLines: [2],
          },
        ],
      }),
    });

    await expect(
      formatTranscriptWithGemini({
        title: "テスト動画",
        transcript: "00:01 これは元の台本です。\n00:02 話者が切り替わります。\n00:03 そのまま続きます。",
      }),
    ).resolves.toEqual({
      title: "整形済み台本",
      sections: [
        {
          heading: "導入",
          body: "00:01 これは元の台本です。\n\n00:02 話者が切り替わります。\n00:03 そのまま続きます。",
        },
      ],
    });
  });

  it("falls back to a single section when Gemini returns invalid ranges", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        title: "整形済み台本",
        sections: [
          {
            heading: "導入",
            startLine: 2,
            endLine: 2,
            speakerBreakLines: [],
          },
        ],
      }),
    });

    await expect(
      formatTranscriptWithGemini({
        title: "テスト動画",
        transcript: "00:01 A\n00:02 B",
      }),
    ).resolves.toEqual({
      title: "Gemini整形版",
      sections: [
        {
          heading: "本文",
          body: "00:01 A\n00:02 B",
        },
      ],
    });
  });

  it("throws when transcript is empty", async () => {
    await expect(
      formatTranscriptWithGemini({
        title: "テスト動画",
        transcript: "   ",
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("throws when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(
      formatTranscriptWithGemini({
        title: "テスト動画",
        transcript: "これは元の台本です。",
      }),
    ).rejects.toBeInstanceOf(UpstreamServiceError);
  });
});
