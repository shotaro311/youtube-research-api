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
import { analyzeTranscriptWithGemini } from "../src/server/gemini-transcript-analyzer";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv, GEMINI_API_KEY: "test-key" };
  vi.clearAllMocks();
});

describe("analyzeTranscriptWithGemini", () => {
  it("returns transcript analysis with flow and viewer evaluation", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        title: "台本分析結果",
        flowStages: [
          {
            stage: "導入",
            summary: "問題提起から動画のテーマを明示しています。",
            viewerPsychology: "自分にも関係がある話かを見極め始めます。",
          },
          {
            stage: "本題",
            summary: "具体例を交えながら主張を深めています。",
            viewerPsychology: "納得感が高まり、続きを聞く姿勢になります。",
          },
        ],
        empathyMoments: ["3行目付近で不安に寄り添う表現があります。"],
        creatorIntent: "悩みを持つ視聴者に安心感を与えつつ、情報を整理して届けたい意図です。",
        viewerStrengths: ["導入が分かりやすい", "具体例で理解しやすい"],
        viewerImprovements: ["締めの行動導線がやや弱い"],
        overallScore: 4,
        overallVerdict: "高評価",
        overallEvaluation: "再生数やコメント数も踏まえると、視聴者の関心をしっかり捉えた動画です。",
      }),
    });

    await expect(
      analyzeTranscriptWithGemini({
        title: "テスト動画",
        transcript: "00:01 導入です。\n00:05 本題です。",
        channelName: "テストチャンネル",
        publishedAt: "2026-03-01T00:00:00.000Z",
        views: 12345,
        subscribers: 67890,
        commentCount: 12,
      }),
    ).resolves.toEqual({
      title: "台本分析結果",
      flowStages: [
        {
          stage: "導入",
          summary: "問題提起から動画のテーマを明示しています。",
          viewerPsychology: "自分にも関係がある話かを見極め始めます。",
        },
        {
          stage: "本題",
          summary: "具体例を交えながら主張を深めています。",
          viewerPsychology: "納得感が高まり、続きを聞く姿勢になります。",
        },
      ],
      empathyMoments: ["3行目付近で不安に寄り添う表現があります。"],
      creatorIntent: "悩みを持つ視聴者に安心感を与えつつ、情報を整理して届けたい意図です。",
      viewerStrengths: ["導入が分かりやすい", "具体例で理解しやすい"],
      viewerImprovements: ["締めの行動導線がやや弱い"],
      overallScore: 4,
      overallVerdict: "高評価",
      overallEvaluation: "再生数やコメント数も踏まえると、視聴者の関心をしっかり捉えた動画です。",
    });
  });

  it("falls back when Gemini omits required analysis blocks", async () => {
    generateContentMock.mockResolvedValue({
      text: JSON.stringify({
        title: "台本分析結果",
        flowStages: [],
      }),
    });

    await expect(
      analyzeTranscriptWithGemini({
        title: "テスト動画",
        transcript: "00:01 導入です。\n00:05 本題です。",
        commentCount: 0,
      }),
    ).resolves.toEqual({
      title: "台本分析結果",
      flowStages: [
        {
          stage: "全体",
          summary: "保存されている 2 行の台本をもとに動画全体を確認します。",
          viewerPsychology: "台本全体の流れは確認できますが、詳細な分析は補完が必要です。",
        },
      ],
      empathyMoments: [],
      creatorIntent: "テスト動画では、台本に沿って情報提供または訴求を行う意図があると考えられます。",
      viewerStrengths: ["情報の流れは確認可能"],
      viewerImprovements: ["分析結果を補完できませんでした"],
      overallScore: 3,
      overallVerdict: "判断保留",
      overallEvaluation: "台本は確認できますが、分析結果を十分に組み立てられなかったため中間評価としています。",
    });
  });

  it("throws when transcript is empty", async () => {
    await expect(
      analyzeTranscriptWithGemini({
        title: "テスト動画",
        transcript: "   ",
        commentCount: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it("throws when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(
      analyzeTranscriptWithGemini({
        title: "テスト動画",
        transcript: "これは元の台本です。",
        commentCount: 0,
      }),
    ).rejects.toBeInstanceOf(UpstreamServiceError);
  });
});
