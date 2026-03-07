export class BadRequestError extends Error {
  readonly statusCode = 400;
}

export class UpstreamServiceError extends Error {
  readonly statusCode = 502;
}

export function getErrorStatus(error: unknown): number {
  if (error instanceof BadRequestError || error instanceof UpstreamServiceError) {
    return error.statusCode;
  }
  return 500;
}
