import { beforeEach, describe, expect, it, vi } from "vitest";

const { analyzeTranscriptWithGeminiMock, analyzeCommentsWithGeminiMock } = vi.hoisted(() => ({
  analyzeTranscriptWithGeminiMock: vi.fn(),
  analyzeCommentsWithGeminiMock: vi.fn(),
}));

vi.mock("../src/server/gemini-transcript-analyzer", () => ({
  analyzeTranscriptWithGemini: analyzeTranscriptWithGeminiMock,
}));

vi.mock("../src/server/gemini-comment-analyzer", () => ({
  analyzeCommentsWithGemini: analyzeCommentsWithGeminiMock,
}));

import { POST as postAnalyzeVideo } from "../app/api/v1/videos/analyze/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/v1/videos/analyze", () => {
  it("returns validation error when rawData is missing", async () => {
    const response = await postAnalyzeVideo(
      new Request("http://localhost/api/v1/videos/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "rawData is required" });
  });

  it("returns transcript and comment analysis together", async () => {
    analyzeTranscriptWithGeminiMock.mockResolvedValue({
      title: "台本分析結果",
      flowStages: [{ stage: "導入", summary: "導入です", viewerPsychology: "興味を持つ" }],
      empathyMoments: [],
      creatorIntent: "意図です",
      viewerStrengths: ["分かりやすい"],
      viewerImprovements: ["補足が欲しい"],
      overallScore: 4,
      overallVerdict: "高評価",
      overallEvaluation: "総合的に良いです。",
    });
    analyzeCommentsWithGeminiMock.mockResolvedValue({
      title: "コメント分析結果",
      overview: "全体として好意的です。",
      positivePercent: 100,
      neutralPercent: 0,
      negativePercent: 0,
      audienceSummary: "関心の高い視聴者です。",
      psychologySummary: "前向きに受け取っています。",
      positiveThemes: ["共感"],
      negativeThemes: [],
      items: [{ commentIndex: 1, sentiment: "positive", viewerType: "共感層", psychology: "納得", note: "好意的" }],
    });

    const response = await postAnalyzeVideo(
      new Request("http://localhost/api/v1/videos/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rawData: {
            videoId: "video-1",
            url: "https://www.youtube.com/watch?v=video-1",
            thumbnailUrl: "https://img.youtube.com/vi/video-1/hqdefault.jpg",
            title: "テスト動画",
            channelName: "テストチャンネル",
            subscribers: 1000,
            channelCreatedAt: "2026-01-01T00:00:00.000Z",
            publishedAt: "2026-03-01T00:00:00.000Z",
            views: 5000,
            duration: "10:00",
            transcript: [{ time: "00:01", text: "導入です" }],
            comments: [{ author: "A", text: "参考になります", likes: 3 }],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      transcriptAnalysis: {
        title: "台本分析結果",
        flowStages: [{ stage: "導入", summary: "導入です", viewerPsychology: "興味を持つ" }],
        empathyMoments: [],
        creatorIntent: "意図です",
        viewerStrengths: ["分かりやすい"],
        viewerImprovements: ["補足が欲しい"],
        overallScore: 4,
        overallVerdict: "高評価",
        overallEvaluation: "総合的に良いです。",
      },
      commentAnalysis: {
        title: "コメント分析結果",
        overview: "全体として好意的です。",
        positivePercent: 100,
        neutralPercent: 0,
        negativePercent: 0,
        audienceSummary: "関心の高い視聴者です。",
        psychologySummary: "前向きに受け取っています。",
        positiveThemes: ["共感"],
        negativeThemes: [],
        items: [{ commentIndex: 1, sentiment: "positive", viewerType: "共感層", psychology: "納得", note: "好意的" }],
      },
      transcriptAnalysisError: undefined,
      commentAnalysisError: undefined,
    });
  });

  it("supports running only comment analysis", async () => {
    analyzeCommentsWithGeminiMock.mockResolvedValue({
      title: "コメント分析結果",
      overview: "全体として好意的です。",
      positivePercent: 100,
      neutralPercent: 0,
      negativePercent: 0,
      audienceSummary: "関心の高い視聴者です。",
      psychologySummary: "前向きに受け取っています。",
      positiveThemes: ["共感"],
      negativeThemes: [],
      items: [{ commentIndex: 1, sentiment: "positive", viewerType: "共感層", psychology: "納得", note: "好意的" }],
    });

    const response = await postAnalyzeVideo(
      new Request("http://localhost/api/v1/videos/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rawData: {
            videoId: "video-1",
            url: "https://www.youtube.com/watch?v=video-1",
            thumbnailUrl: "https://img.youtube.com/vi/video-1/hqdefault.jpg",
            title: "テスト動画",
            channelName: "テストチャンネル",
            subscribers: 1000,
            channelCreatedAt: "2026-01-01T00:00:00.000Z",
            publishedAt: "2026-03-01T00:00:00.000Z",
            views: 5000,
            duration: "10:00",
            transcript: [{ time: "00:01", text: "導入です" }],
            comments: [{ author: "A", text: "参考になります", likes: 3 }],
          },
          includeTranscriptAnalysis: false,
          includeCommentAnalysis: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      transcriptAnalysis: undefined,
      commentAnalysis: {
        title: "コメント分析結果",
        overview: "全体として好意的です。",
        positivePercent: 100,
        neutralPercent: 0,
        negativePercent: 0,
        audienceSummary: "関心の高い視聴者です。",
        psychologySummary: "前向きに受け取っています。",
        positiveThemes: ["共感"],
        negativeThemes: [],
        items: [{ commentIndex: 1, sentiment: "positive", viewerType: "共感層", psychology: "納得", note: "好意的" }],
      },
      transcriptAnalysisError: undefined,
      commentAnalysisError: undefined,
    });
  });
});
