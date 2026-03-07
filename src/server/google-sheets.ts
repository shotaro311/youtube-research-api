import { randomUUID } from "crypto";
import { access } from "fs/promises";
import { join } from "path";

import { google } from "googleapis";

import { BadRequestError, UpstreamServiceError } from "../domain/youtube/errors";
import type { ExtractVideoResponse } from "../domain/youtube/types";

const DEFAULT_CREDENTIALS_FILE = "gen-lang-client-0823751047-629dc32ab24d.json";
const DEFAULT_SPREADSHEET_ID = "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME";
const DEFAULT_SHEET_NAME = "AI抽出";
const DEFAULT_SCRIPT_DB_SHEET_NAME = "台本DB";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const MAX_CELL_TEXT_LENGTH = 40000;
const GOOGLE_CREDENTIALS_JSON_ENV = "GOOGLE_APPLICATION_CREDENTIALS_JSON";

type SheetsExportPayload = {
  items: ExtractVideoResponse[];
  viewerBaseUrl?: string;
};

type ScriptReference = {
  scriptId: string;
  transcriptUrl: string;
  commentsUrl: string;
};

export type StoredScriptDocument = {
  scriptId: string;
  videoId: string;
  url: string;
  title: string;
  createdAt: string;
  channelName?: string;
  publishedAt?: string;
  views?: number;
  subscribers?: number;
  thumbnailUrl?: string;
  transcript: string;
  comments: string;
};

function getCredentialsPath(): string {
  return process.env.GOOGLE_APPLICATION_CREDENTIALS || join(process.cwd(), DEFAULT_CREDENTIALS_FILE);
}

function getSpreadsheetId(): string {
  return process.env.GOOGLE_SHEETS_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
}

function getSheetName(): string {
  return process.env.GOOGLE_SHEETS_SHEET_NAME || DEFAULT_SHEET_NAME;
}

function getScriptDbSheetName(): string {
  return process.env.GOOGLE_SHEETS_SCRIPT_DB_SHEET_NAME || DEFAULT_SCRIPT_DB_SHEET_NAME;
}

function normalizeBaseUrl(value?: string): string {
  return typeof value === "string" ? value.trim().replace(/\/+$/, "") : "";
}

function buildTranscriptBody(item: ExtractVideoResponse): string {
  return item.rawData.transcript.map((segment) => `${segment.time} ${segment.text}`.trim()).join("\n");
}

function buildCommentsBody(item: ExtractVideoResponse): string {
  return item.rawData.comments.map((comment) => `${comment.author}: ${comment.text}`.trim()).join("\n");
}

function chunkText(value: string): string[] {
  if (!value) {
    return [];
  }

  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += MAX_CELL_TEXT_LENGTH) {
    chunks.push(value.slice(index, index + MAX_CELL_TEXT_LENGTH));
  }

  return chunks;
}

function buildScriptViewerUrl(baseUrl: string, scriptId: string, tab: "transcript" | "comments"): string {
  return baseUrl ? `${baseUrl}/scripts/${scriptId}?tab=${tab}` : "";
}

function buildScriptReferences(items: ExtractVideoResponse[], viewerBaseUrl?: string): ScriptReference[] {
  const baseUrl = normalizeBaseUrl(viewerBaseUrl);

  return items.map((item) => {
    const scriptId = `${item.rawData.videoId}-${randomUUID()}`;
    return {
      scriptId,
      transcriptUrl: buildScriptViewerUrl(baseUrl, scriptId, "transcript"),
      commentsUrl: buildScriptViewerUrl(baseUrl, scriptId, "comments"),
    };
  });
}

function buildMetaPayload(item: ExtractVideoResponse): string {
  return JSON.stringify({
    channelName: item.rawData.channelName,
    publishedAt: item.rawData.publishedAt,
    views: item.rawData.views,
    subscribers: item.rawData.subscribers,
    thumbnailUrl: item.rawData.thumbnailUrl,
  });
}

function parseStoredMeta(
  value: unknown,
): Omit<StoredScriptDocument, "scriptId" | "videoId" | "url" | "title" | "createdAt" | "transcript" | "comments"> {
  if (typeof value !== "string" || !value) {
    return {};
  }

  try {
    return JSON.parse(value) as Omit<
      StoredScriptDocument,
      "scriptId" | "videoId" | "url" | "title" | "createdAt" | "transcript" | "comments"
    >;
  } catch {
    return {};
  }
}

export function buildAiExtractSheetRows(
  items: ExtractVideoResponse[],
  references: ScriptReference[] = [],
): Array<Array<string | number>> {
  return items.map((item, index) => {
    const reference = references[index];

    return [
      item.rawData.url,
      `=IMAGE("${item.rawData.thumbnailUrl}")`,
      item.rawData.title,
      item.rawData.views,
      item.rawData.publishedAt,
      item.rawData.comments.length,
      item.rawData.channelName,
      item.rawData.subscribers,
      reference?.scriptId ?? "",
      reference?.transcriptUrl ? `=HYPERLINK("${reference.transcriptUrl}","台本を見る")` : "",
      reference?.commentsUrl ? `=HYPERLINK("${reference.commentsUrl}","コメントを見る")` : "",
    ];
  });
}

export function buildScriptDbRows(
  items: ExtractVideoResponse[],
  references: ScriptReference[],
  createdAt = new Date().toISOString(),
): string[][] {
  return items.flatMap((item, index) => {
    const reference = references[index];
    if (!reference) {
      return [];
    }

    const baseRows: string[][] = [
      [
        reference.scriptId,
        item.rawData.videoId,
        item.rawData.url,
        item.rawData.title,
        "meta",
        "0",
        buildMetaPayload(item),
        createdAt,
      ],
    ];

    const transcriptRows = chunkText(buildTranscriptBody(item)).map((content, chunkIndex) => [
      reference.scriptId,
      item.rawData.videoId,
      item.rawData.url,
      item.rawData.title,
      "transcript",
      String(chunkIndex),
      content,
      createdAt,
    ]);

    const commentRows = chunkText(buildCommentsBody(item)).map((content, chunkIndex) => [
      reference.scriptId,
      item.rawData.videoId,
      item.rawData.url,
      item.rawData.title,
      "comments",
      String(chunkIndex),
      content,
      createdAt,
    ]);

    return [...baseRows, ...transcriptRows, ...commentRows];
  });
}

async function createSheetsClient() {
  const credentialsJson = process.env[GOOGLE_CREDENTIALS_JSON_ENV];
  const auth = credentialsJson
    ? (() => {
        try {
          return new google.auth.GoogleAuth({
            credentials: JSON.parse(credentialsJson) as {
              client_email: string;
              private_key: string;
            },
            scopes: [SHEETS_SCOPE],
          });
        } catch {
          throw new UpstreamServiceError("Google Sheets 認証JSONの形式が不正です。");
        }
      })()
    : await (async () => {
        const keyFile = getCredentialsPath();
        await access(keyFile).catch(() => {
          throw new UpstreamServiceError("Google Sheets 認証ファイルが見つかりません。");
        });

        return new google.auth.GoogleAuth({
          keyFile,
          scopes: [SHEETS_SCOPE],
        });
      })();

  return google.sheets({ version: "v4", auth });
}

export async function appendAiExtractRows(
  payload: SheetsExportPayload,
): Promise<{ appendedRows: number; storedScriptRows: number; detailLinksEnabled: boolean }> {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new BadRequestError("items is required");
  }

  const sheets = await createSheetsClient();
  const references = buildScriptReferences(payload.items, payload.viewerBaseUrl);
  const scriptRows = buildScriptDbRows(payload.items, references);
  const rows = buildAiExtractSheetRows(payload.items, references);

  if (scriptRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: getSpreadsheetId(),
      range: `${getScriptDbSheetName()}!A:H`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: scriptRows,
      },
    });
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId: getSpreadsheetId(),
    range: `${getSheetName()}!A:K`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: rows,
    },
  });

  return {
    appendedRows: rows.length,
    storedScriptRows: scriptRows.length,
    detailLinksEnabled: references.some(
      (reference) => Boolean(reference.transcriptUrl) && Boolean(reference.commentsUrl),
    ),
  };
}

export async function readStoredScript(scriptId: string): Promise<StoredScriptDocument | null> {
  if (!scriptId) {
    throw new BadRequestError("scriptId is required");
  }

  const sheets = await createSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: getSpreadsheetId(),
    range: `${getScriptDbSheetName()}!A:H`,
  });

  const rows = (response.data.values ?? []).filter((row) => row[0] === scriptId);
  if (rows.length === 0) {
    return null;
  }

  const metaRow = rows.find((row) => row[4] === "meta");
  const metadata = parseStoredMeta(metaRow?.[6]);

  const collectContent = (kind: "transcript" | "comments"): string =>
    rows
      .filter((row) => row[4] === kind)
      .sort((left, right) => Number(left[5] ?? "0") - Number(right[5] ?? "0"))
      .map((row) => row[6] ?? "")
      .join("");

  return {
    scriptId,
    videoId: metaRow?.[1] ?? rows[0]?.[1] ?? "",
    url: metaRow?.[2] ?? rows[0]?.[2] ?? "",
    title: metaRow?.[3] ?? rows[0]?.[3] ?? "",
    createdAt: metaRow?.[7] ?? rows[0]?.[7] ?? "",
    channelName: metadata.channelName,
    publishedAt: metadata.publishedAt,
    views: metadata.views,
    subscribers: metadata.subscribers,
    thumbnailUrl: metadata.thumbnailUrl,
    transcript: collectContent("transcript"),
    comments: collectContent("comments"),
  };
}
