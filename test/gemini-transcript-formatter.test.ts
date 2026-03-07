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
  it("returns structured sections from Gemini JSON output", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        title: "整形済み台本",
        sections: [
          {
            heading: "導入",
            body: "読みやすく整形した本文です。",
          },
        ],
      }),
    });

    await expect(
      formatTranscriptWithGemini({
        title: "テスト動画",
        transcript: "これは元の台本です。",
      }),
    ).resolves.toEqual({
      title: "整形済み台本",
      sections: [
        {
          heading: "導入",
          body: "読みやすく整形した本文です。",
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
