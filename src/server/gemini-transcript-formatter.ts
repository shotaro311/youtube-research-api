import { GoogleGenAI, Type } from "@google/genai";

import { BadRequestError, UpstreamServiceError } from "../domain/youtube/errors";
import type { FormattedTranscript, FormattedTranscriptSection } from "../domain/youtube/transcript-format";

const GEMINI_MODEL = "gemini-2.5-flash";

type TranscriptSource = {
  title: string;
  transcript: string;
};

function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new UpstreamServiceError("GEMINI_API_KEY が設定されていません。");
  }

  return apiKey;
}

function buildPrompt(source: TranscriptSource): string {
  return [
    "あなたは日本語の動画台本を読みやすく整形する編集者です。",
    "目的は見やすくすることだけです。元の内容や順序は変えないでください。",
    "必須ルール:",
    "- 要約しない",
    "- 情報を削らない",
    "- 新しい情報を足さない",
    "- 意味を変えない",
    "- 明らかな誤字脱字や音声認識の乱れだけを、文脈が確実な範囲で補正する",
    "- 適切な段落分け、句読点、短い見出しを付ける",
    "- 出力は日本語",
    "",
    `動画タイトル: ${source.title || "未取得"}`,
    "以下が台本全文です。",
    source.transcript,
  ].join("\n");
}

function normalizeSections(value: unknown): FormattedTranscriptSection[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((section) => {
      if (typeof section !== "object" || section === null) {
        return null;
      }

      const heading = "heading" in section && typeof section.heading === "string" ? section.heading.trim() : "";
      const body = "body" in section && typeof section.body === "string" ? section.body.trim() : "";
      if (!heading || !body) {
        return null;
      }

      return { heading, body };
    })
    .filter((section): section is FormattedTranscriptSection => Boolean(section));
}

function parseFormattedTranscriptResponse(value: string): FormattedTranscript {
  try {
    const parsed = JSON.parse(value) as Partial<FormattedTranscript>;
    const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "Gemini整形版";
    const sections = normalizeSections(parsed.sections);

    if (sections.length === 0) {
      throw new Error("sections is empty");
    }

    return {
      title,
      sections,
    };
  } catch {
    throw new UpstreamServiceError("Gemini 整形結果の解析に失敗しました。");
  }
}

export async function formatTranscriptWithGemini(source: TranscriptSource): Promise<FormattedTranscript> {
  if (!source.transcript.trim()) {
    throw new BadRequestError("台本が保存されていません。");
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
            title: {
              type: Type.STRING,
            },
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  heading: {
                    type: Type.STRING,
                  },
                  body: {
                    type: Type.STRING,
                  },
                },
                required: ["heading", "body"],
              },
            },
          },
          required: ["sections"],
        },
      },
    })
    .catch(() => {
      throw new UpstreamServiceError("Gemini での整形に失敗しました。");
    });

  if (!response.text) {
    throw new UpstreamServiceError("Gemini から整形結果を取得できませんでした。");
  }

  return parseFormattedTranscriptResponse(response.text);
}
