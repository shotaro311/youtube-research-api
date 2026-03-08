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
