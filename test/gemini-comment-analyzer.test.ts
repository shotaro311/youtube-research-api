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
import { analyzeCommentsWithGemini } from "../src/server/gemini-comment-analyzer";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv, GEMINI_API_KEY: "test-key" };
  vi.clearAllMocks();
});

describe("analyzeCommentsWithGemini", () => {
  it("returns overall analysis and per-comment results", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        title: "コメント分析結果",
        overview: "共感と実体験ベースの反応が多く、全体として好意的です。",
        positivePercent: 60,
        neutralPercent: 30,
        negativePercent: 10,
        audienceSummary: "当事者意識の高い視聴者が多そうです。",
        psychologySummary: "役立ちそうか、自分事として当てはまるかを見ています。",
        positiveThemes: ["共感", "参考になる"],
        negativeThemes: ["個人差がある"],
        items: [
          {
            commentIndex: 1,
            sentiment: "positive",
            viewerType: "当事者意識がある視聴者",
            psychology: "自分にも役立つ情報かを見ている",
            note: "共感と感謝が中心です。",
          },
          {
            commentIndex: 2,
            sentiment: "neutral",
            viewerType: "慎重に判断したい視聴者",
            psychology: "一般化しすぎないかを気にしている",
            note: "否定ではなく留保を置いています。",
          },
        ],
      }),
    });

    await expect(
      analyzeCommentsWithGemini({
        title: "テスト動画",
        comments: [
          { author: "A", text: "とても参考になりました。" },
          { author: "B", text: "人によって違う気もします。" },
        ],
      }),
    ).resolves.toEqual({
      title: "コメント分析結果",
      overview: "共感と実体験ベースの反応が多く、全体として好意的です。",
      positivePercent: 50,
      neutralPercent: 50,
      negativePercent: 0,
      audienceSummary: "当事者意識の高い視聴者が多そうです。",
      psychologySummary: "役立ちそうか、自分事として当てはまるかを見ています。",
      positiveThemes: ["共感", "参考になる"],
      negativeThemes: ["個人差がある"],
      items: [
        {
          commentIndex: 1,
          sentiment: "positive",
          viewerType: "当事者意識がある視聴者",
          psychology: "自分にも役立つ情報かを見ている",
          note: "共感と感謝が中心です。",
        },
        {
          commentIndex: 2,
          sentiment: "neutral",
          viewerType: "慎重に判断したい視聴者",
          psychology: "一般化しすぎないかを気にしている",
          note: "否定ではなく留保を置いています。",
        },
      ],
    });
  });

  it("fills missing items and recalculates percentages when needed", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        overview: "評価は割れています。",
        positivePercent: 10,
        neutralPercent: 10,
        negativePercent: 10,
        audienceSummary: "視聴者像は分かれています。",
        psychologySummary: "受け止め方が割れています。",
        positiveThemes: [],
        negativeThemes: [],
        items: [
          {
            commentIndex: 1,
            sentiment: "negative",
            viewerType: "懐疑的な視聴者",
            psychology: "誇張がないかを見ている",
            note: "不満が先に出ています。",
          },
        ],
      }),
    });

    await expect(
      analyzeCommentsWithGemini({
        title: "テスト動画",
        comments: [
          { author: "A", text: "違和感があります。" },
          { author: "B", text: "一旦保留です。" },
        ],
      }),
    ).resolves.toEqual({
      title: "コメント分析結果",
      overview: "評価は割れています。",
      positivePercent: 0,
      neutralPercent: 50,
      negativePercent: 50,
      audienceSummary: "視聴者像は分かれています。",
      psychologySummary: "受け止め方が割れています。",
      positiveThemes: [],
      negativeThemes: [],
      items: [
        {
          commentIndex: 1,
          sentiment: "negative",
          viewerType: "懐疑的な視聴者",
          psychology: "誇張がないかを見ている",
          note: "不満が先に出ています。",
        },
        {
          commentIndex: 2,
          sentiment: "neutral",
          viewerType: "判断保留",
          psychology: "コメントだけでは判断を保留",
          note: "分析結果を補完できませんでした。",
        },
      ],
    });
  });

  it("throws when comments are empty", async () => {
    await expect(
      analyzeCommentsWithGemini({
        title: "テスト動画",
        comments: [],
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("throws when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(
      analyzeCommentsWithGemini({
        title: "テスト動画",
        comments: [{ author: "A", text: "コメントです。" }],
      }),
    ).rejects.toBeInstanceOf(UpstreamServiceError);
  });
});
