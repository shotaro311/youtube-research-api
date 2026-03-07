import { BadRequestError, getErrorStatus } from "../domain/youtube/errors";

type JsonRecord = Record<string, unknown>;

export async function readJsonBody(request: Request): Promise<JsonRecord> {
  const body = await request.json().catch(() => ({}));
  return typeof body === "object" && body !== null ? (body as JsonRecord) : {};
}

export function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestError(`${fieldName} is required`);
  }

  return value;
}

export function toErrorResponse(error: unknown): Response {
  const status = getErrorStatus(error);
  const message = error instanceof Error ? error.message : "Internal Server Error";

  if (status >= 500) {
    console.error(error);
  }

  return Response.json({ error: message }, { status });
}
