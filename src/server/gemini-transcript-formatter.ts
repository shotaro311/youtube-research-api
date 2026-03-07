import { GoogleGenAI, Type } from "@google/genai";

import { BadRequestError, UpstreamServiceError } from "../domain/youtube/errors";
import type { FormattedTranscript } from "../domain/youtube/transcript-format";

const GEMINI_MODEL = "gemini-3.1-flash-lite-preview";

type TranscriptSource = {
  title: string;
  transcript: string;
};

type SectionPlan = {
  heading: string;
  startLine: number;
  endLine: number;
  speakerBreakLines: number[];
};

function getGeminiApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new UpstreamServiceError("GEMINI_API_KEY が設定されていません。");
  }

  return apiKey;
}

function splitTranscriptLines(transcript: string): string[] {
  return transcript
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
}

function buildPrompt(source: TranscriptSource, transcriptLines: string[]): string {
  const numberedTranscript = transcriptLines.map((line, index) => `${index + 1}|${line}`).join("\n");

  return [
    "あなたは日本語の動画台本を読みやすく整形する編集者です。",
    "目的は見やすくすることだけです。元の内容や順序や語句は変えないでください。",
    "必須ルール:",
    "- 要約しない",
    "- 情報を削らない",
    "- 新しい情報を足さない",
    "- 意味を変えない",
    "- 語句を書き換えない",
    "- 句読点の補正や言い換えもしない",
    "- 見出しを付けることと、空行を入れる位置を決めることだけを行う",
    "- 話者切り替わりと思われる箇所では、できるだけ改行位置として指定する",
    "- sections は全行を 1 行目から最終行まで、欠けも重複もなく順番通りに覆う",
    "- speakerBreakLines には、空行を入れたい行番号を入れる。行番号そのものの内容は変えない",
    "- 出力は日本語",
    "- 出力は JSON のみ",
    "",
    `動画タイトル: ${source.title || "未取得"}`,
    "以下が台本全文です。各行の先頭の番号は行番号です。",
    numberedTranscript,
  ].join("\n");
}

function normalizeIntegerArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "number" && Number.isInteger(item) ? item : null))
    .filter((item): item is number => item !== null);
}

function normalizeSectionPlans(value: unknown): SectionPlan[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((section) => {
      if (typeof section !== "object" || section === null) {
        return null;
      }

      const heading = "heading" in section && typeof section.heading === "string" ? section.heading.trim() : "";
      const startLine = "startLine" in section && typeof section.startLine === "number" ? section.startLine : NaN;
      const endLine = "endLine" in section && typeof section.endLine === "number" ? section.endLine : NaN;
      const speakerBreakLines =
        "speakerBreakLines" in section ? normalizeIntegerArray(section.speakerBreakLines) : [];

      if (!heading || !Number.isInteger(startLine) || !Number.isInteger(endLine)) {
        return null;
      }

      return { heading, startLine, endLine, speakerBreakLines };
    })
    .filter((section): section is SectionPlan => Boolean(section));
}

function buildSectionBody(lines: string[], section: SectionPlan): string {
  const speakerBreakSet = new Set(
    section.speakerBreakLines.filter((lineNumber) => lineNumber > section.startLine && lineNumber <= section.endLine),
  );
  const bodyLines: string[] = [];

  for (let lineNumber = section.startLine; lineNumber <= section.endLine; lineNumber += 1) {
    if (speakerBreakSet.has(lineNumber) && bodyLines.length > 0) {
      bodyLines.push("");
    }

    bodyLines.push(lines[lineNumber - 1] ?? "");
  }

  return bodyLines.join("\n");
}

function buildFallbackTranscript(lines: string[]): FormattedTranscript {
  return {
    title: "Gemini整形版",
    sections: [
      {
        heading: "本文",
        body: lines.join("\n"),
      },
    ],
  };
}

function buildFormattedTranscriptFromPlan(value: string, lines: string[]): FormattedTranscript {
  try {
    const parsed = JSON.parse(value) as { title?: unknown; sections?: unknown };
    const title = typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "Gemini整形版";
    const plans = normalizeSectionPlans(parsed.sections);

    if (plans.length === 0) {
      return buildFallbackTranscript(lines);
    }

    let expectedStartLine = 1;
    for (const plan of plans) {
      if (plan.startLine !== expectedStartLine || plan.endLine < plan.startLine || plan.endLine > lines.length) {
        return buildFallbackTranscript(lines);
      }
      expectedStartLine = plan.endLine + 1;
    }

    if (expectedStartLine !== lines.length + 1) {
      return buildFallbackTranscript(lines);
    }

    return {
      title,
      sections: plans.map((plan) => ({
        heading: plan.heading,
        body: buildSectionBody(lines, plan),
      })),
    };
  } catch {
    throw new UpstreamServiceError("Gemini 整形結果の解析に失敗しました。");
  }
}

export async function formatTranscriptWithGemini(source: TranscriptSource): Promise<FormattedTranscript> {
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
                  startLine: {
                    type: Type.INTEGER,
                  },
                  endLine: {
                    type: Type.INTEGER,
                  },
                  speakerBreakLines: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.INTEGER,
                    },
                  },
                },
                required: ["heading", "startLine", "endLine", "speakerBreakLines"],
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

  return buildFormattedTranscriptFromPlan(response.text, transcriptLines);
}
