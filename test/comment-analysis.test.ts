import { describe, expect, it } from "vitest";

import {
  calculateCommentAnalysisPercents,
  normalizeCommentAnalysis,
  type CommentAnalysis,
} from "../src/domain/youtube/comment-analysis";

describe("calculateCommentAnalysisPercents", () => {
  it("recalculates percentages from sentiment counts", () => {
    expect(
      calculateCommentAnalysisPercents([
        { sentiment: "positive" },
        { sentiment: "positive" },
        { sentiment: "neutral" },
        { sentiment: "negative" },
      ]),
    ).toEqual({
      positivePercent: 50,
      neutralPercent: 25,
      negativePercent: 25,
    });
  });

  it("returns neutral 100 when there are no analyzed comments", () => {
    expect(calculateCommentAnalysisPercents([])).toEqual({
      positivePercent: 0,
      neutralPercent: 100,
      negativePercent: 0,
    });
  });
});

describe("normalizeCommentAnalysis", () => {
  it("ignores stale percentage values and normalizes from items", () => {
    const analysis: CommentAnalysis = {
      title: "コメント分析結果",
      overview: "summary",
      positivePercent: 80,
      neutralPercent: 10,
      negativePercent: 10,
      audienceSummary: "audience",
      psychologySummary: "psychology",
      positiveThemes: ["共感"],
      negativeThemes: ["不安"],
      items: [
        {
          commentIndex: 1,
          sentiment: "positive",
          viewerType: "視聴者A",
          psychology: "前向き",
          note: "好意的",
        },
        {
          commentIndex: 2,
          sentiment: "neutral",
          viewerType: "視聴者B",
          psychology: "保留",
          note: "様子見",
        },
        {
          commentIndex: 3,
          sentiment: "negative",
          viewerType: "視聴者C",
          psychology: "不満",
          note: "否定的",
        },
      ],
    };

    expect(normalizeCommentAnalysis(analysis)).toEqual({
      ...analysis,
      positivePercent: 33,
      neutralPercent: 33,
      negativePercent: 34,
    });
  });
});
