import { readStoredScript } from "../../../../../../src/server/google-sheets";
import { formatTranscriptWithGemini } from "../../../../../../src/server/gemini-transcript-formatter";
import { toErrorResponse } from "../../../../../../src/server/route-utils";

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

    const formatted = await formatTranscriptWithGemini({
      title: script.title,
      transcript: script.transcript,
    });

    return Response.json(formatted);
  } catch (error) {
    return toErrorResponse(error);
  }
}
