import { randomUUID } from "crypto";
import { access } from "fs/promises";
import { join } from "path";

import { google } from "googleapis";

import type { CommentAnalysis } from "../domain/youtube/comment-analysis";
import { BadRequestError, UpstreamServiceError } from "../domain/youtube/errors";
import { parseStoredComments } from "../domain/youtube/stored-comment";
import type { ExtractVideoResponse } from "../domain/youtube/types";

const DEFAULT_CREDENTIALS_FILE = "gen-lang-client-0823751047-629dc32ab24d.json";
const DEFAULT_SPREADSHEET_ID = "1s49OtI3R2PoGS_DjsymEbzg3IlNPBqgVIILEzBLN6ME";
const DEFAULT_SHEET_NAME = "AI抽出";
const DEFAULT_SCRIPT_DB_SHEET_NAME = "台本DB";
const DEFAULT_COMMENT_DB_SHEET_NAME = "コメントDB";
const DEFAULT_COMMENT_SHEET_NAME = "コメントシート";
const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const MAX_CELL_TEXT_LENGTH = 40000;
const GOOGLE_CREDENTIALS_JSON_ENV = "GOOGLE_APPLICATION_CREDENTIALS_JSON";
const THUMBNAIL_WIDTH_PX = 288;
const THUMBNAIL_HEIGHT_PX = 162;
const THUMBNAIL_COLUMN_WIDTH_PX = 304;
const THUMBNAIL_ROW_HEIGHT_PX = 178;
const THUMBNAIL_COLUMN_INDEX = 1;
const COMMENT_DB_HEADER = [
  "comment_id",
  "script_id",
  "video_id",
  "video_url",
  "title",
  "channel_name",
  "published_at",
  "comment_index",
  "author",
  "comment_text",
  "likes",
  "created_at",
  "sentiment",
  "viewer_type",
  "psychology",
  "note",
  "analysis_updated_at",
] as const;
const COMMENT_SHEET_HEADER = [
  "コメントID",
  "動画タイトル",
  "動画リンク",
  "チャンネル名",
  "投稿者",
  "コメント本文",
  "感情タグ",
  "視聴者像",
  "心理",
  "個別フィードバック",
  "分析更新日時",
] as const;

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
  commentAnalysis?: CommentAnalysis;
};

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

function normalizeEnvValue(value?: string): string {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const hasDoubleQuotes = trimmed.startsWith("\"") && trimmed.endsWith("\"");
  const hasSingleQuotes = trimmed.startsWith("'") && trimmed.endsWith("'");
  if (hasDoubleQuotes || hasSingleQuotes) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function getConfiguredValue(name: string, fallback: string): string {
  return normalizeEnvValue(process.env[name]) || fallback;
}

function getCredentialsPath(): string {
  return normalizeEnvValue(process.env.GOOGLE_APPLICATION_CREDENTIALS) || join(process.cwd(), DEFAULT_CREDENTIALS_FILE);
}

function getSpreadsheetId(): string {
  return getConfiguredValue("GOOGLE_SHEETS_SPREADSHEET_ID", DEFAULT_SPREADSHEET_ID);
}

function getSheetName(): string {
  return getConfiguredValue("GOOGLE_SHEETS_SHEET_NAME", DEFAULT_SHEET_NAME);
}

function getScriptDbSheetName(): string {
  return getConfiguredValue("GOOGLE_SHEETS_SCRIPT_DB_SHEET_NAME", DEFAULT_SCRIPT_DB_SHEET_NAME);
}

function getCommentDbSheetName(): string {
  return getConfiguredValue("GOOGLE_SHEETS_COMMENT_DB_SHEET_NAME", DEFAULT_COMMENT_DB_SHEET_NAME);
}

function getCommentSheetName(): string {
  return getConfiguredValue("GOOGLE_SHEETS_COMMENT_SHEET_NAME", DEFAULT_COMMENT_SHEET_NAME);
}

function normalizeBaseUrl(value?: string): string {
  return normalizeEnvValue(value).replace(/\/+$/, "");
}

function parseCredentialsJson(value: string): ServiceAccountCredentials {
  try {
    const parsed = JSON.parse(normalizeEnvValue(value)) as ServiceAccountCredentials | string;
    return typeof parsed === "string" ? (JSON.parse(parsed) as ServiceAccountCredentials) : parsed;
  } catch {
    throw new UpstreamServiceError("Google Sheets 認証JSONの形式が不正です。");
  }
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

function parseStoredCommentAnalysis(value: unknown): CommentAnalysis | undefined {
  if (typeof value !== "string" || !value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as CommentAnalysis;
    return Array.isArray(parsed.items) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function buildThumbnailFormula(thumbnailUrl?: string): string {
  return thumbnailUrl ? `=IMAGE("${thumbnailUrl}",4,${THUMBNAIL_HEIGHT_PX},${THUMBNAIL_WIDTH_PX})` : "";
}

function parseUpdatedRowIndexes(updatedRange?: string): { startIndex: number; endIndex: number } | null {
  if (!updatedRange) {
    return null;
  }

  const match = updatedRange.match(/![A-Z]+(\d+)(?::[A-Z]+(\d+))?$/);
  if (!match) {
    return null;
  }

  const startRow = Number(match[1]);
  const endRow = Number(match[2] ?? match[1]);
  if (!Number.isInteger(startRow) || !Number.isInteger(endRow)) {
    return null;
  }

  return {
    startIndex: Math.max(0, startRow - 1),
    endIndex: Math.max(startRow, endRow),
  };
}

function toA1ColumnLabel(columnNumber: number): string {
  let value = columnNumber;
  let label = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

async function resizeAiExtractThumbnailArea(
  sheets: Awaited<ReturnType<typeof createSheetsClient>>,
  spreadsheetId: string,
  updatedRange?: string,
): Promise<void> {
  const rowIndexes = parseUpdatedRowIndexes(updatedRange);
  if (!rowIndexes) {
    return;
  }

  const sheetName = getSheetName();
  const sheetResponse = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });
  const sheetId = sheetResponse.data.sheets?.find((sheet) => sheet.properties?.title === sheetName)?.properties?.sheetId;

  if (typeof sheetId !== "number") {
    throw new UpstreamServiceError("AI抽出シートが見つかりません。");
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowIndexes.startIndex,
              endIndex: rowIndexes.endIndex,
            },
            properties: {
              pixelSize: THUMBNAIL_ROW_HEIGHT_PX,
            },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: THUMBNAIL_COLUMN_INDEX,
              endIndex: THUMBNAIL_COLUMN_INDEX + 1,
            },
            properties: {
              pixelSize: THUMBNAIL_COLUMN_WIDTH_PX,
            },
            fields: "pixelSize",
          },
        },
      ],
    },
  });
}

async function getSheetIdByTitle(
  sheets: Awaited<ReturnType<typeof createSheetsClient>>,
  spreadsheetId: string,
  title: string,
): Promise<number> {
  const sheetResponse = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title))",
  });
  const sheetId = sheetResponse.data.sheets?.find((sheet) => sheet.properties?.title === title)?.properties?.sheetId;

  if (typeof sheetId !== "number") {
    throw new UpstreamServiceError(`${title} シートが見つかりません。`);
  }

  return sheetId;
}

async function ensureSheetWithHeader(
  sheets: Awaited<ReturnType<typeof createSheetsClient>>,
  spreadsheetId: string,
  title: string,
  header: readonly string[],
): Promise<void> {
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(sheetId,title,gridProperties(columnCount)))",
  });
  const existingSheet = metadata.data.sheets?.find((sheet) => sheet.properties?.title === title);

  if (!existingSheet) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addSheet: {
              properties: {
                title,
                gridProperties: {
                  rowCount: 1000,
                  columnCount: header.length,
                },
              },
            },
          },
        ],
      },
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${title}!A1:${toA1ColumnLabel(header.length)}1`,
      valueInputOption: "RAW",
      requestBody: {
        values: [Array.from(header)],
      },
    });
    return;
  }

  const currentColumnCount = existingSheet.properties?.gridProperties?.columnCount ?? 0;
  if (currentColumnCount < header.length && typeof existingSheet.properties?.sheetId === "number") {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: {
                sheetId: existingSheet.properties.sheetId,
                gridProperties: {
                  columnCount: header.length,
                },
              },
              fields: "gridProperties.columnCount",
            },
          },
        ],
      },
    });
  }

  const headerRange = `${title}!A1:${toA1ColumnLabel(header.length)}1`;
  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: headerRange,
  });
  const existingHeader = headerResponse.data.values?.[0] ?? [];
  const hasSameHeader =
    existingHeader.length >= header.length &&
    header.every((value, index) => existingHeader[index] === value);

  if (hasSameHeader) {
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: headerRange,
    valueInputOption: "RAW",
    requestBody: {
      values: [Array.from(header)],
    },
  });
}

function buildStoredContentRows(
  script: Pick<StoredScriptDocument, "scriptId" | "videoId" | "url" | "title">,
  rowType: "comment_analysis",
  content: string,
  createdAt = new Date().toISOString(),
): string[][] {
  return chunkText(content).map((chunk, chunkIndex) => [
    script.scriptId,
    script.videoId,
    script.url,
    script.title,
    rowType,
    String(chunkIndex),
    chunk,
    createdAt,
  ]);
}

type StoredCommentDbBase = {
  scriptId: string;
  videoId: string;
  url: string;
  title: string;
  channelName?: string;
  publishedAt?: string;
  createdAt: string;
};

type StoredCommentDbComment = {
  author: string;
  text: string;
  likes?: number;
};

type StoredCommentSheetBase = Pick<StoredCommentDbBase, "scriptId" | "url" | "title" | "channelName">;

type StoredCommentAnalysisValues = {
  sentiment?: string;
  viewerType?: string;
  psychology?: string;
  note?: string;
  analysisUpdatedAt?: string;
};

function buildCommentId(scriptId: string, commentIndex: number): string {
  return `${scriptId}:${commentIndex}`;
}

function buildCommentAnalysisCells(values?: StoredCommentAnalysisValues): Array<string | number> {
  return [
    values?.sentiment ?? "",
    values?.viewerType ?? "",
    values?.psychology ?? "",
    values?.note ?? "",
    values?.analysisUpdatedAt ?? "",
  ];
}

function buildStoredCommentDbRow(
  script: StoredCommentDbBase,
  comment: StoredCommentDbComment,
  commentIndex: number,
  analysisValues?: StoredCommentAnalysisValues,
): Array<string | number> {
  return [
    buildCommentId(script.scriptId, commentIndex),
    script.scriptId,
    script.videoId,
    script.url,
    script.title,
    script.channelName ?? "",
    script.publishedAt ?? "",
    commentIndex,
    comment.author,
    comment.text,
    typeof comment.likes === "number" ? comment.likes : "",
    script.createdAt,
    ...buildCommentAnalysisCells(analysisValues),
  ];
}

function buildStoredCommentSheetRow(
  script: StoredCommentSheetBase,
  comment: StoredCommentDbComment,
  commentIndex: number,
  analysisValues?: StoredCommentAnalysisValues,
): Array<string | number> {
  return [
    buildCommentId(script.scriptId, commentIndex),
    script.title,
    script.url,
    script.channelName ?? "",
    comment.author,
    comment.text,
    ...buildCommentAnalysisCells(analysisValues),
  ];
}

async function deleteScriptRowsByType(
  sheets: Awaited<ReturnType<typeof createSheetsClient>>,
  spreadsheetId: string,
  scriptId: string,
  rowType: string,
): Promise<string[][]> {
  const sheetName = getScriptDbSheetName();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:H`,
  });
  const rows = response.data.values ?? [];
  const targetIndexes = rows
    .map((row, index) => ({ row, index }))
    .filter((entry) => entry.row[0] === scriptId && entry.row[4] === rowType)
    .map((entry) => entry.index)
    .sort((left, right) => right - left);

  if (targetIndexes.length === 0) {
    return rows;
  }

  const sheetId = await getSheetIdByTitle(sheets, spreadsheetId, sheetName);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: targetIndexes.map((index) => ({
        deleteDimension: {
          range: {
            sheetId,
            dimension: "ROWS",
            startIndex: index,
            endIndex: index + 1,
          },
        },
      })),
    },
  });

  return rows;
}

export function buildAiExtractSheetRows(
  items: ExtractVideoResponse[],
  references: ScriptReference[] = [],
): Array<Array<string | number>> {
  return items.map((item, index) => {
    const reference = references[index];

    return [
      item.rawData.url,
      buildThumbnailFormula(item.rawData.thumbnailUrl),
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

export function buildCommentDbRows(
  items: ExtractVideoResponse[],
  references: ScriptReference[],
  createdAt = new Date().toISOString(),
): Array<Array<string | number>> {
  return items.flatMap((item, index) => {
    const reference = references[index];
    if (!reference) {
      return [];
    }

    return item.rawData.comments.map((comment, commentIndex) => [
      ...buildStoredCommentDbRow(
        {
          scriptId: reference.scriptId,
          videoId: item.rawData.videoId,
          url: item.rawData.url,
          title: item.rawData.title,
          channelName: item.rawData.channelName,
          publishedAt: item.rawData.publishedAt,
          createdAt,
        },
        comment,
        commentIndex + 1,
      ),
    ]);
  });
}

export function buildCommentSheetRows(
  items: ExtractVideoResponse[],
  references: ScriptReference[],
): Array<Array<string | number>> {
  return items.flatMap((item, index) => {
    const reference = references[index];
    if (!reference) {
      return [];
    }

    return item.rawData.comments.map((comment, commentIndex) =>
      buildStoredCommentSheetRow(
        {
          scriptId: reference.scriptId,
          url: item.rawData.url,
          title: item.rawData.title,
          channelName: item.rawData.channelName,
        },
        comment,
        commentIndex + 1,
      ),
    );
  });
}

function buildCommentAnalysisMap(analysis: CommentAnalysis, updatedAt: string): Map<number, StoredCommentAnalysisValues> {
  return new Map(
    analysis.items.map((item) => [
      item.commentIndex,
      {
        sentiment: item.sentiment,
        viewerType: item.viewerType,
        psychology: item.psychology,
        note: item.note,
        analysisUpdatedAt: updatedAt,
      },
    ]),
  );
}

function parseCommentIndexFromId(commentId: string, scriptId: string): number {
  if (!commentId.startsWith(`${scriptId}:`)) {
    return 0;
  }

  return Number(commentId.slice(`${scriptId}:`.length));
}

async function syncCommentAnalysisToCommentDb(
  sheets: Awaited<ReturnType<typeof createSheetsClient>>,
  spreadsheetId: string,
  script: StoredCommentDbBase,
  comments: StoredCommentDbComment[],
  analysis: CommentAnalysis,
): Promise<void> {
  const commentDbSheetName = getCommentDbSheetName();
  await ensureSheetWithHeader(sheets, spreadsheetId, commentDbSheetName, COMMENT_DB_HEADER);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${commentDbSheetName}!A:Q`,
  });
  const rows = response.data.values ?? [];
  const analysisUpdatedAt = new Date().toISOString();
  const analysisMap = buildCommentAnalysisMap(analysis, analysisUpdatedAt);
  const existingRows = rows
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .filter((entry) => entry.rowNumber > 1 && entry.row[1] === script.scriptId);

  for (const entry of existingRows) {
    const commentIndex = Number(entry.row[7] ?? "0");
    const values = buildCommentAnalysisCells(analysisMap.get(commentIndex));
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${commentDbSheetName}!M${entry.rowNumber}:Q${entry.rowNumber}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [values],
      },
    });
  }

  const existingCommentIndexes = new Set(
    existingRows
      .map((entry) => Number(entry.row[7] ?? "0"))
      .filter((commentIndex) => Number.isInteger(commentIndex) && commentIndex > 0),
  );
  const missingRows = comments.flatMap((comment, index) => {
    const commentIndex = index + 1;
    if (existingCommentIndexes.has(commentIndex)) {
      return [];
    }

    return [
      buildStoredCommentDbRow(script, comment, commentIndex, analysisMap.get(commentIndex)),
    ];
  });

  if (missingRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${commentDbSheetName}!A:Q`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: missingRows,
      },
    });
  }
}

async function clearCommentAnalysisFromCommentDb(
  sheets: Awaited<ReturnType<typeof createSheetsClient>>,
  spreadsheetId: string,
  scriptId: string,
): Promise<void> {
  const commentDbSheetName = getCommentDbSheetName();
  await ensureSheetWithHeader(sheets, spreadsheetId, commentDbSheetName, COMMENT_DB_HEADER);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${commentDbSheetName}!A:Q`,
  });
  const rows = response.data.values ?? [];
  const matchingRowNumbers = rows
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .filter((entry) => entry.rowNumber > 1 && entry.row[1] === scriptId)
    .map((entry) => entry.rowNumber);

  for (const rowNumber of matchingRowNumbers) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${commentDbSheetName}!M${rowNumber}:Q${rowNumber}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [["", "", "", "", ""]],
      },
    });
  }
}

async function syncCommentAnalysisToCommentSheet(
  sheets: Awaited<ReturnType<typeof createSheetsClient>>,
  spreadsheetId: string,
  script: StoredCommentSheetBase,
  comments: StoredCommentDbComment[],
  analysis: CommentAnalysis,
): Promise<void> {
  const commentSheetName = getCommentSheetName();
  await ensureSheetWithHeader(sheets, spreadsheetId, commentSheetName, COMMENT_SHEET_HEADER);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${commentSheetName}!A:K`,
  });
  const rows = response.data.values ?? [];
  const analysisUpdatedAt = new Date().toISOString();
  const analysisMap = buildCommentAnalysisMap(analysis, analysisUpdatedAt);
  const existingRows = rows
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .filter((entry) => entry.rowNumber > 1 && typeof entry.row[0] === "string" && entry.row[0].startsWith(`${script.scriptId}:`));

  for (const entry of existingRows) {
    const commentIndex = parseCommentIndexFromId(String(entry.row[0] ?? ""), script.scriptId);
    const values = buildCommentAnalysisCells(analysisMap.get(commentIndex));
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${commentSheetName}!G${entry.rowNumber}:K${entry.rowNumber}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [values],
      },
    });
  }

  const existingCommentIndexes = new Set(
    existingRows
      .map((entry) => parseCommentIndexFromId(String(entry.row[0] ?? ""), script.scriptId))
      .filter((commentIndex) => Number.isInteger(commentIndex) && commentIndex > 0),
  );
  const missingRows = comments.flatMap((comment, index) => {
    const commentIndex = index + 1;
    if (existingCommentIndexes.has(commentIndex)) {
      return [];
    }

    return [buildStoredCommentSheetRow(script, comment, commentIndex, analysisMap.get(commentIndex))];
  });

  if (missingRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${commentSheetName}!A:K`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: missingRows,
      },
    });
  }
}

async function clearCommentAnalysisFromCommentSheet(
  sheets: Awaited<ReturnType<typeof createSheetsClient>>,
  spreadsheetId: string,
  scriptId: string,
): Promise<void> {
  const commentSheetName = getCommentSheetName();
  await ensureSheetWithHeader(sheets, spreadsheetId, commentSheetName, COMMENT_SHEET_HEADER);

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${commentSheetName}!A:K`,
  });
  const rows = response.data.values ?? [];
  const matchingRowNumbers = rows
    .map((row, index) => ({ row, rowNumber: index + 1 }))
    .filter(
      (entry) =>
        entry.rowNumber > 1 &&
        typeof entry.row[0] === "string" &&
        entry.row[0].startsWith(`${scriptId}:`),
    )
    .map((entry) => entry.rowNumber);

  for (const rowNumber of matchingRowNumbers) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${commentSheetName}!G${rowNumber}:K${rowNumber}`,
      valueInputOption: "RAW",
      requestBody: {
        values: [["", "", "", "", ""]],
      },
    });
  }
}

async function createSheetsClient() {
  const credentialsJson = normalizeEnvValue(process.env[GOOGLE_CREDENTIALS_JSON_ENV]);
  const auth = credentialsJson
    ? new google.auth.GoogleAuth({
        credentials: parseCredentialsJson(credentialsJson),
        scopes: [SHEETS_SCOPE],
      })
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
): Promise<{
  appendedRows: number;
  storedScriptRows: number;
  storedCommentRows: number;
  storedCommentSheetRows: number;
  detailLinksEnabled: boolean;
}> {
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new BadRequestError("items is required");
  }

  const sheets = await createSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const references = buildScriptReferences(payload.items, payload.viewerBaseUrl);
  const scriptRows = buildScriptDbRows(payload.items, references);
  const commentRows = buildCommentDbRows(payload.items, references);
  const commentSheetRows = buildCommentSheetRows(payload.items, references);
  const rows = buildAiExtractSheetRows(payload.items, references);

  if (scriptRows.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${getScriptDbSheetName()}!A:H`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: scriptRows,
      },
    });
  }

  if (commentRows.length > 0) {
    const commentDbSheetName = getCommentDbSheetName();
    await ensureSheetWithHeader(sheets, spreadsheetId, commentDbSheetName, COMMENT_DB_HEADER);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${commentDbSheetName}!A:Q`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: commentRows,
      },
    });
  }

  if (commentSheetRows.length > 0) {
    const commentSheetName = getCommentSheetName();
    await ensureSheetWithHeader(sheets, spreadsheetId, commentSheetName, COMMENT_SHEET_HEADER);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${commentSheetName}!A:K`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: commentSheetRows,
      },
    });
  }

  const appendResponse = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${getSheetName()}!A:K`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: rows,
    },
  });
  await resizeAiExtractThumbnailArea(sheets, spreadsheetId, appendResponse.data.updates?.updatedRange ?? undefined);

  return {
    appendedRows: rows.length,
    storedScriptRows: scriptRows.length,
    storedCommentRows: commentRows.length,
    storedCommentSheetRows: commentSheetRows.length,
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

  const collectContent = (kind: "transcript" | "comments" | "comment_analysis"): string =>
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
    commentAnalysis: parseStoredCommentAnalysis(collectContent("comment_analysis")),
  };
}

export async function saveStoredCommentAnalysis(scriptId: string, analysis: CommentAnalysis): Promise<void> {
  if (!scriptId) {
    throw new BadRequestError("scriptId is required");
  }

  const sheets = await createSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  const rows = await deleteScriptRowsByType(sheets, spreadsheetId, scriptId, "comment_analysis");
  const scriptRows = rows.filter((row) => row[0] === scriptId);
  const metaRow = scriptRows.find((row) => row[4] === "meta");

  if (!metaRow) {
    throw new BadRequestError("script not found");
  }

  const payloadRows = buildStoredContentRows(
    {
      scriptId,
      videoId: metaRow[1] ?? "",
      url: metaRow[2] ?? "",
      title: metaRow[3] ?? "",
    },
    "comment_analysis",
    JSON.stringify(analysis),
  );

  if (payloadRows.length === 0) {
    return;
  }

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${getScriptDbSheetName()}!A:H`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: payloadRows,
    },
  });

  const metadata = parseStoredMeta(metaRow[6]);
  const comments = parseStoredComments(
    scriptRows
      .filter((row) => row[4] === "comments")
      .sort((left, right) => Number(left[5] ?? "0") - Number(right[5] ?? "0"))
      .map((row) => row[6] ?? "")
      .join(""),
  ).map((comment) => ({
    author: comment.author,
    text: comment.text,
  }));

  await syncCommentAnalysisToCommentDb(
    sheets,
    spreadsheetId,
    {
      scriptId,
      videoId: metaRow[1] ?? "",
      url: metaRow[2] ?? "",
      title: metaRow[3] ?? "",
      channelName: metadata.channelName,
      publishedAt: metadata.publishedAt,
      createdAt: metaRow[7] ?? new Date().toISOString(),
    },
    comments,
    analysis,
  );
  await syncCommentAnalysisToCommentSheet(
    sheets,
    spreadsheetId,
    {
      scriptId,
      url: metaRow[2] ?? "",
      title: metaRow[3] ?? "",
      channelName: metadata.channelName,
    },
    comments,
    analysis,
  );
}

export async function deleteStoredCommentAnalysis(scriptId: string): Promise<void> {
  if (!scriptId) {
    throw new BadRequestError("scriptId is required");
  }

  const sheets = await createSheetsClient();
  const spreadsheetId = getSpreadsheetId();
  await deleteScriptRowsByType(sheets, spreadsheetId, scriptId, "comment_analysis");
  await clearCommentAnalysisFromCommentDb(sheets, spreadsheetId, scriptId);
  await clearCommentAnalysisFromCommentSheet(sheets, spreadsheetId, scriptId);
}
