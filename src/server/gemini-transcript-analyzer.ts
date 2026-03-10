import { GoogleGenAI, Type } from "@google/genai";

import type { TranscriptAnalysis, TranscriptAnalysisFlowStage } from "../domain/youtube/transcript-analysis";
import { BadRequestError, UpstreamServiceError } from "../domain/youtube/errors";

const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";

type TranscriptAnalysisSource = {
  title: string;
  transcript: string;
  channelName?: string;
  publishedAt?: string;
  views?: number;
  subscribers?: number;
  commentCount: number;
};

function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new UpstreamServiceError("GEMINI_API_KEY が設定されていません。");
  }

  return apiKey;
}

function splitTranscriptLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function formatMetaNumber(value?: number): string {
  return typeof value === "number" ? new Intl.NumberFormat("ja-JP").format(value) : "未取得";
}

function buildPrompt(source: TranscriptAnalysisSource, transcriptLines: string[]): string {
  const numberedTranscript = transcriptLines.map((line, index) => `${index + 1}|${line}`).join("\n");

  return [
    "あなたは日本語の YouTube 台本を、企画と視聴者心理の両面から分析するリサーチャーです。",
    "目的は、動画の流れと視聴者体験を読みやすく整理することです。",
    "必須ルール:",
    "- 与えられた台本とメタデータだけを根拠にする",
    "- 台本に無い内容を断定しない",
    "- flowStages は 3 件以上 6 件以下にする",
    "- flowStages は入力順に並べ、動画の流れが追えるようにする",
    "- 各 flowStages の viewerPsychology では、その段階で視聴者の気持ちがどう動きそうかを短く書く",
    "- empathyMoments には、視聴者に寄り添う発言や安心感につながる表現があれば短く列挙する",
    "- empathyMoments が無ければ空配列にする",
    "- creatorIntent では、この動画を企画した意図を 2 文以内で整理する",
    "- viewerStrengths と viewerImprovements は、それぞれ 4 件以内の短い箇条書き向けラベルにする",
    "- overallScore は 1 から 5 の整数にする",
    "- overallVerdict は総合評価を一言で表す短い見出しにする",
    "- overallEvaluation では、台本の内容に加えて再生数・登録者数・コメント数などのメタデータも踏まえて 3 文以内で評価する",
    "- 出力は日本語",
    "- 出力は JSON のみ",
    "",
    `動画タイトル: ${source.title || "未取得"}`,
    `チャンネル名: ${source.channelName || "未取得"}`,
    `投稿日: ${source.publishedAt || "未取得"}`,
    `再生数: ${formatMetaNumber(source.views)}`,
    `登録者数: ${formatMetaNumber(source.subscribers)}`,
    `コメント数: ${formatMetaNumber(source.commentCount)}`,
    "以下が台本全文です。各行の先頭の番号は行番号です。",
    numberedTranscript,
  ].join("\n");
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function normalizeFlowStages(value: unknown): TranscriptAnalysisFlowStage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (typeof item !== "object" || item === null) {
        return null;
      }

      const stage = "stage" in item ? normalizeString(item.stage) : "";
      const summary = "summary" in item ? normalizeString(item.summary) : "";
      const viewerPsychology = "viewerPsychology" in item ? normalizeString(item.viewerPsychology) : "";

      if (!stage || !summary || !viewerPsychology) {
        return null;
      }

      return {
        stage,
        summary,
        viewerPsychology,
      };
    })
    .filter((item): item is TranscriptAnalysisFlowStage => Boolean(item));
}

function normalizeOverallScore(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return 3;
  }

  return Math.min(5, Math.max(1, value));
}

function buildFallbackAnalysis(source: TranscriptAnalysisSource, transcriptLines: string[]): TranscriptAnalysis {
  return {
    title: "台本分析結果",
    flowStages: [
      {
        stage: "全体",
        summary: `保存されている ${transcriptLines.length} 行の台本をもとに動画全体を確認します。`,
        viewerPsychology: "台本全体の流れは確認できますが、詳細な分析は補完が必要です。",
      },
    ],
    empathyMoments: [],
    creatorIntent: `${source.title || "この動画"}では、台本に沿って情報提供または訴求を行う意図があると考えられます。`,
    viewerStrengths: ["情報の流れは確認可能"],
    viewerImprovements: ["分析結果を補完できませんでした"],
    overallScore: 3,
    overallVerdict: "判断保留",
    overallEvaluation: "台本は確認できますが、分析結果を十分に組み立てられなかったため中間評価としています。",
  };
}

function buildTranscriptAnalysisFromResponse(
  value: string,
  source: TranscriptAnalysisSource,
  transcriptLines: string[],
): TranscriptAnalysis {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const flowStages = normalizeFlowStages(parsed.flowStages);
    if (flowStages.length === 0) {
      return buildFallbackAnalysis(source, transcriptLines);
    }

    return {
      title: normalizeString(parsed.title) || "台本分析結果",
      flowStages,
      empathyMoments: normalizeStringArray(parsed.empathyMoments),
      creatorIntent: normalizeString(parsed.creatorIntent) || "企画意図は台本から読み取れる範囲で整理してください。",
      viewerStrengths: normalizeStringArray(parsed.viewerStrengths),
      viewerImprovements: normalizeStringArray(parsed.viewerImprovements),
      overallScore: normalizeOverallScore(parsed.overallScore),
      overallVerdict: normalizeString(parsed.overallVerdict) || "判断保留",
      overallEvaluation:
        normalizeString(parsed.overallEvaluation) || "総合評価はメタデータを含めて再確認してください。",
    };
  } catch {
    throw new UpstreamServiceError("Gemini の台本分析結果の解析に失敗しました。");
  }
}

export async function analyzeTranscriptWithGemini(source: TranscriptAnalysisSource): Promise<TranscriptAnalysis> {
  const transcriptLines = splitTranscriptLines(source.transcript);
  if (transcriptLines.length === 0) {
    throw new BadRequestError("台本が保存されていません。");
  }

  const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });
  const response = await ai.models
    .generateContent({
      model: GEMINI_MODEL,
      contents: buildPrompt(source, transcriptLines),
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            flowStages: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  stage: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  viewerPsychology: { type: Type.STRING },
                },
                required: ["stage", "summary", "viewerPsychology"],
              },
            },
            empathyMoments: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            creatorIntent: { type: Type.STRING },
            viewerStrengths: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            viewerImprovements: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            overallScore: { type: Type.INTEGER },
            overallVerdict: { type: Type.STRING },
            overallEvaluation: { type: Type.STRING },
          },
          required: [
            "flowStages",
            "empathyMoments",
            "creatorIntent",
            "viewerStrengths",
            "viewerImprovements",
            "overallScore",
            "overallVerdict",
            "overallEvaluation",
          ],
        },
      },
    })
    .catch(() => {
      throw new UpstreamServiceError("Gemini での台本分析に失敗しました。");
    });

  if (!response.text) {
    throw new UpstreamServiceError("Gemini から台本分析結果を取得できませんでした。");
  }

  return buildTranscriptAnalysisFromResponse(response.text, source, transcriptLines);
}
