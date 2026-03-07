import { readStoredScript } from "../../../../../src/server/google-sheets";
import { toErrorResponse } from "../../../../../src/server/route-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    scriptId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const { scriptId } = await context.params;
    const script = await readStoredScript(scriptId);

    if (!script) {
      return Response.json({ error: "script not found" }, { status: 404 });
    }

    return new Response(JSON.stringify(script, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="script-${scriptId}.json"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
