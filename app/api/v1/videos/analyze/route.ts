import { analyzeCommentsWithGemini } from "../../../../../src/server/gemini-comment-analyzer";
import { analyzeTranscriptWithGemini } from "../../../../../src/server/gemini-transcript-analyzer";
import { toErrorResponse } from "../../../../../src/server/route-utils";
import type { ExtractVideoResponse } from "../../../../../src/domain/youtube/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AnalyzeVideoRequest = {
  rawData?: ExtractVideoResponse["rawData"];
  includeTranscriptAnalysis?: boolean;
  includeCommentAnalysis?: boolean;
};

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json().catch(() => ({}))) as AnalyzeVideoRequest;
    const rawData = body.rawData;
    const includeTranscriptAnalysis = body.includeTranscriptAnalysis !== false;
    const includeCommentAnalysis = body.includeCommentAnalysis !== false;

    if (!rawData?.url || !rawData.title) {
      return Response.json({ error: "rawData is required" }, { status: 400 });
    }

    const [transcriptResult, commentResult] = await Promise.allSettled([
      includeTranscriptAnalysis
        ? rawData.transcript.length > 0
        ? analyzeTranscriptWithGemini({
            title: rawData.title,
            transcript: rawData.transcript.map((segment) => `${segment.time} ${segment.text}`.trim()).join("\n"),
            channelName: rawData.channelName,
            publishedAt: rawData.publishedAt,
            views: rawData.views,
            subscribers: rawData.subscribers,
            commentCount: rawData.comments.length,
          })
        : Promise.reject(new Error("台本が未取得のため分析できません。"))
        : Promise.resolve(undefined),
      includeCommentAnalysis
        ? rawData.comments.length > 0
        ? analyzeCommentsWithGemini({
            title: rawData.title,
            comments: rawData.comments.map((comment) => ({
              author: comment.author,
              text: comment.text,
            })),
          })
        : Promise.reject(new Error("コメントが未取得のため分析できません。"))
        : Promise.resolve(undefined),
    ]);

    return Response.json({
      transcriptAnalysis:
        transcriptResult.status === "fulfilled" ? (transcriptResult.value ?? undefined) : undefined,
      commentAnalysis: commentResult.status === "fulfilled" ? (commentResult.value ?? undefined) : undefined,
      transcriptAnalysisError:
        transcriptResult.status === "rejected" ? transcriptResult.reason?.message : undefined,
      commentAnalysisError: commentResult.status === "rejected" ? commentResult.reason?.message : undefined,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
