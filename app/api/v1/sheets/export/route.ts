import type { ExtractVideoResponse } from "../../../../../src/domain/youtube/types";
import { appendAiExtractRows } from "../../../../../src/server/google-sheets";
import { readJsonBody, toErrorResponse } from "../../../../../src/server/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveViewerBaseUrl(request: Request): string {
  return process.env.SCRIPT_VIEWER_BASE_URL || new URL(request.url).origin;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJsonBody(request);
    const items = Array.isArray(body.items) ? (body.items as ExtractVideoResponse[]) : [];
    const result = await appendAiExtractRows({
      items,
      viewerBaseUrl: resolveViewerBaseUrl(request),
    });
    return Response.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
