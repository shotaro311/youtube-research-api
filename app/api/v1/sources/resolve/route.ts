import { resolveSourceUrls } from "../../../../../src/domain/youtube/source-resolver";
import { readJsonBody, requireString, toErrorResponse } from "../../../../../src/server/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonBody(request);
    const inputUrl = requireString(body.inputUrl, "inputUrl");
    const maxVideos = typeof body.maxVideos === "number" ? body.maxVideos : undefined;
    const result = await resolveSourceUrls({ inputUrl, maxVideos });

    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
