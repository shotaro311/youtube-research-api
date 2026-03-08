export type CommentSentiment = "positive" | "neutral" | "negative";

export type CommentAnalysisItem = {
  commentIndex: number;
  sentiment: CommentSentiment;
  viewerType: string;
  psychology: string;
  note: string;
};

export type CommentAnalysis = {
  title: string;
  overview: string;
  positivePercent: number;
  neutralPercent: number;
  negativePercent: number;
  audienceSummary: string;
  psychologySummary: string;
  positiveThemes: string[];
  negativeThemes: string[];
  items: CommentAnalysisItem[];
};

export function calculateCommentAnalysisPercents(
  items: Array<Pick<CommentAnalysisItem, "sentiment">>,
): Pick<CommentAnalysis, "positivePercent" | "neutralPercent" | "negativePercent"> {
  if (items.length === 0) {
    return {
      positivePercent: 0,
      neutralPercent: 100,
      negativePercent: 0,
    };
  }

  const counts = items.reduce(
    (acc, item) => {
      acc[item.sentiment] += 1;
      return acc;
    },
    { positive: 0, neutral: 0, negative: 0 },
  );

  const positivePercent = Math.round((counts.positive / items.length) * 100);
  const neutralPercent = Math.round((counts.neutral / items.length) * 100);
  const negativePercent = 100 - positivePercent - neutralPercent;

  return {
    positivePercent,
    neutralPercent,
    negativePercent,
  };
}

export function normalizeCommentAnalysis(analysis: CommentAnalysis): CommentAnalysis {
  return {
    ...analysis,
    ...calculateCommentAnalysisPercents(analysis.items),
  };
}
