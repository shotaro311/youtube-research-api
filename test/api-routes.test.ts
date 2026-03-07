import { describe, expect, it } from "vitest";

import { GET as getHealth } from "../app/api/health/route";
import { POST as postResolveSource } from "../app/api/v1/sources/resolve/route";
import { POST as postExtractVideo } from "../app/api/v1/videos/extract/route";

describe("api routes", () => {
  it("returns health status", async () => {
    const response = await getHealth();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("returns validation error for empty source input", async () => {
    const response = await postResolveSource(
      new Request("http://localhost/api/v1/sources/resolve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "inputUrl is required" });
  });

  it("returns validation error for empty video url", async () => {
    const response = await postExtractVideo(
      new Request("http://localhost/api/v1/videos/extract", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "url is required" });
  });
});
