import { extractVideoResearchRaw } from "../../../../../src/domain/youtube/video-extractor";
import { readJsonBody, requireString, toErrorResponse } from "../../../../../src/server/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["hnd1"];

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonBody(request);
    const url = requireString(body.url, "url");
    const includeTranscript = typeof body.includeTranscript === "boolean" ? body.includeTranscript : true;
    const includeComments = typeof body.includeComments === "boolean" ? body.includeComments : true;
    const result = await extractVideoResearchRaw({ url, includeTranscript, includeComments });

    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
