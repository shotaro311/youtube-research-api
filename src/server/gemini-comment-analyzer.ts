import { GoogleGenAI, Type } from "@google/genai";

import type { CommentAnalysis, CommentAnalysisItem, CommentSentiment } from "../domain/youtube/comment-analysis";
import type { StoredComment } from "../domain/youtube/stored-comment";
import { BadRequestError, UpstreamServiceError } from "../domain/youtube/errors";

const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";

type CommentAnalysisSource = {
  title: string;
  comments: StoredComment[];
};

type AnalysisItemPlan = {
  commentIndex: number;
  sentiment: CommentSentiment;
  viewerType: string;
  psychology: string;
  note: string;
};

function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new UpstreamServiceError("GEMINI_API_KEY が設定されていません。");
  }

  return apiKey;
}

function sanitizeCommentLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildPrompt(source: CommentAnalysisSource): string {
  const numberedComments = source.comments
    .map((comment, index) => `${index + 1}|${sanitizeCommentLine(comment.author)}|${sanitizeCommentLine(comment.text)}`)
    .join("\n");

  return [
    "あなたは YouTube コメントを分析する日本語リサーチャーです。",
    "目的は、視聴者の反応を読みやすく整理することです。",
    "必須ルール:",
    "- 動画内容そのものを断定せず、コメントから読める範囲だけを書く",
    "- 視聴者属性や心理は断定ではなく、コメントから推測できる範囲にとどめる",
    "- overview は 3 文以内で、動画全体への反応の傾向を短くまとめる",
    "- audienceSummary では、どんな視聴者が多そうかを 2 文以内でまとめる",
    "- psychologySummary では、視聴者が何に反応しているかを 2 文以内でまとめる",
    "- positiveThemes と negativeThemes は、それぞれ 3 件以内の短い箇条書き用ラベルにする",
    "- items では、各コメントを入力順の commentIndex で 1 件ずつ必ず分析する",
    "- sentiment は positive / neutral / negative のいずれかにする",
    "- viewerType は、そのコメントから感じられる視聴者属性を短く書く",
    "- psychology は、そのコメントから読み取れる心理や関心を短く書く",
    "- note は、なぜその判断になったかを短く書く",
    "- positivePercent / neutralPercent / negativePercent は整数で、合計が 100 になるようにする",
    "- 出力は日本語",
    "- 出力は JSON のみ",
    "",
    `動画タイトル: ${source.title || "未取得"}`,
    "以下がコメント一覧です。各行は commentIndex|投稿者名|コメント本文 の順です。",
    numberedComments,
  ].join("\n");
}

function normalizeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function normalizeSentiment(value: unknown): CommentSentiment | null {
  return value === "positive" || value === "neutral" || value === "negative" ? value : null;
}

function normalizeAnalysisItems(value: unknown): AnalysisItemPlan[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item !== "object" || item === null) {
        return null;
      }

      const commentIndex = "commentIndex" in item ? normalizeInteger(item.commentIndex) : null;
      const sentiment = "sentiment" in item ? normalizeSentiment(item.sentiment) : null;
      const viewerType = "viewerType" in item && typeof item.viewerType === "string" ? item.viewerType.trim() : "";
      const psychology = "psychology" in item && typeof item.psychology === "string" ? item.psychology.trim() : "";
      const note = "note" in item && typeof item.note === "string" ? item.note.trim() : "";

      if (commentIndex === null || !sentiment || !viewerType || !psychology || !note) {
        return null;
      }

      return {
        commentIndex,
        sentiment,
        viewerType,
        psychology,
        note,
      };
    })
    .filter((item): item is AnalysisItemPlan => Boolean(item));
}

function normalizePercentages(
  items: CommentAnalysisItem[],
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

  return { positivePercent, neutralPercent, negativePercent };
}

function buildFallbackOverview(comments: StoredComment[]): string {
  if (comments.length === 0) {
    return "コメントが保存されていません。";
  }

  return `保存されている ${comments.length} 件のコメントをもとに、視聴者反応を整理します。`;
}

function buildCommentAnalysisFromResponse(value: string, comments: StoredComment[]): CommentAnalysis {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const itemsFromResponse = normalizeAnalysisItems(parsed.items);
    const itemMap = new Map(itemsFromResponse.map((item) => [item.commentIndex, item]));
    const items = comments.map((_, index) => {
      const fallback: CommentAnalysisItem = {
        commentIndex: index + 1,
        sentiment: "neutral",
        viewerType: "判断保留",
        psychology: "コメントだけでは判断を保留",
        note: "分析結果を補完できませんでした。",
      };

      return itemMap.get(index + 1) ?? fallback;
    });

    const analysis: CommentAnalysis = {
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "コメント分析結果",
      overview:
        typeof parsed.overview === "string" && parsed.overview.trim()
          ? parsed.overview.trim()
          : buildFallbackOverview(comments),
      positivePercent: normalizeInteger(parsed.positivePercent) ?? -1,
      neutralPercent: normalizeInteger(parsed.neutralPercent) ?? -1,
      negativePercent: normalizeInteger(parsed.negativePercent) ?? -1,
      audienceSummary:
        typeof parsed.audienceSummary === "string" && parsed.audienceSummary.trim()
          ? parsed.audienceSummary.trim()
          : "視聴者属性はコメントから読める範囲で整理してください。",
      psychologySummary:
        typeof parsed.psychologySummary === "string" && parsed.psychologySummary.trim()
          ? parsed.psychologySummary.trim()
          : "視聴者心理はコメントから読める範囲で整理してください。",
      positiveThemes: normalizeStringArray(parsed.positiveThemes),
      negativeThemes: normalizeStringArray(parsed.negativeThemes),
      items,
    };

    return {
      ...analysis,
      ...normalizePercentages(items),
    };
  } catch {
    throw new UpstreamServiceError("Gemini のコメント分析結果の解析に失敗しました。");
  }
}

export async function analyzeCommentsWithGemini(source: CommentAnalysisSource): Promise<CommentAnalysis> {
  if (source.comments.length === 0) {
    throw new BadRequestError("コメントが保存されていません。");
  }

  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  const response = await ai.models
    .generateContent({
      model: GEMINI_MODEL,
      contents: buildPrompt(source),
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            overview: { type: Type.STRING },
            positivePercent: { type: Type.INTEGER },
            neutralPercent: { type: Type.INTEGER },
            negativePercent: { type: Type.INTEGER },
            audienceSummary: { type: Type.STRING },
            psychologySummary: { type: Type.STRING },
            positiveThemes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            negativeThemes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  commentIndex: { type: Type.INTEGER },
                  sentiment: { type: Type.STRING },
                  viewerType: { type: Type.STRING },
                  psychology: { type: Type.STRING },
                  note: { type: Type.STRING },
                },
                required: ["commentIndex", "sentiment", "viewerType", "psychology", "note"],
              },
            },
          },
          required: [
            "overview",
            "positivePercent",
            "neutralPercent",
            "negativePercent",
            "audienceSummary",
            "psychologySummary",
            "positiveThemes",
            "negativeThemes",
            "items",
          ],
        },
      },
    })
    .catch(() => {
      throw new UpstreamServiceError("Gemini でのコメント分析に失敗しました。");
    });

  if (!response.text) {
    throw new UpstreamServiceError("Gemini からコメント分析結果を取得できませんでした。");
  }

  return buildCommentAnalysisFromResponse(response.text, source.comments);
}
