import { parseStoredComments } from "../../../../../../../src/domain/youtube/stored-comment";
import { analyzeCommentsWithGemini } from "../../../../../../../src/server/gemini-comment-analyzer";
import { readStoredScript } from "../../../../../../../src/server/google-sheets";
import { toErrorResponse } from "../../../../../../../src/server/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    scriptId: string;
  }>;
};

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
