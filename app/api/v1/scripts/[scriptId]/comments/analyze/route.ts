import { normalizeCommentAnalysis, type CommentAnalysis, type CommentSentiment } from "../../../../../../../src/domain/youtube/comment-analysis";
import { parseStoredComments } from "../../../../../../../src/domain/youtube/stored-comment";
import { analyzeCommentsWithGemini } from "../../../../../../../src/server/gemini-comment-analyzer";
import {
  deleteStoredCommentAnalysis,
  readStoredScript,
  saveStoredCommentAnalysis,
} from "../../../../../../../src/server/google-sheets";
import { readJsonBody, toErrorResponse } from "../../../../../../../src/server/route-utils";
import { BadRequestError } from "../../../../../../../src/domain/youtube/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    scriptId: string;
  }>;
};

function isSentiment(value: unknown): value is CommentSentiment {
  return value === "positive" || value === "neutral" || value === "negative";
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function parseCommentAnalysisPayload(body: Record<string, unknown>): CommentAnalysis {
  const items = Array.isArray(body.items)
    ? body.items
        .map((item, index) => {
          if (typeof item !== "object" || item === null) {
            return null;
          }

          const commentIndex = typeof item.commentIndex === "number" ? item.commentIndex : index + 1;
          if (!Number.isInteger(commentIndex) || !isSentiment(item.sentiment)) {
            return null;
          }

          if (
            typeof item.viewerType !== "string" ||
            typeof item.psychology !== "string" ||
            typeof item.note !== "string"
          ) {
            return null;
          }

          return {
            commentIndex,
            sentiment: item.sentiment,
            viewerType: item.viewerType.trim(),
            psychology: item.psychology.trim(),
            note: item.note.trim(),
          };
        })
        .filter((item): item is CommentAnalysis["items"][number] => Boolean(item))
    : [];

  if (items.length === 0) {
    throw new BadRequestError("items is required");
  }

  return normalizeCommentAnalysis({
    title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : "コメント分析結果",
    overview: typeof body.overview === "string" ? body.overview.trim() : "",
    positivePercent: 0,
    neutralPercent: 0,
    negativePercent: 0,
    audienceSummary: typeof body.audienceSummary === "string" ? body.audienceSummary.trim() : "",
    psychologySummary: typeof body.psychologySummary === "string" ? body.psychologySummary.trim() : "",
    positiveThemes: parseStringArray(body.positiveThemes),
    negativeThemes: parseStringArray(body.negativeThemes),
    items,
  });
}

export async function POST(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const { scriptId } = await context.params;
    const script = await readStoredScript(scriptId);

    if (!script) {
      return Response.json({ error: "script not found" }, { status: 404 });
    }

    const analysis = await analyzeCommentsWithGemini({
      title: script.title,
      comments: parseStoredComments(script.comments),
    });

    return Response.json(analysis);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PUT(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { scriptId } = await context.params;
    const script = await readStoredScript(scriptId);

    if (!script) {
      return Response.json({ error: "script not found" }, { status: 404 });
    }

    const body = await readJsonBody(request);
    const analysis = parseCommentAnalysisPayload(body);
    await saveStoredCommentAnalysis(scriptId, analysis);

    return Response.json(analysis);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const { scriptId } = await context.params;
    const script = await readStoredScript(scriptId);

    if (!script) {
      return Response.json({ error: "script not found" }, { status: 404 });
    }

    await deleteStoredCommentAnalysis(scriptId);

    return Response.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
