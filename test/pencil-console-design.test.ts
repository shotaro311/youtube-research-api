import { describe, expect, it } from "vitest";

import { readPencilConsoleDesign } from "../src/server/pencil-console-design";

describe("readPencilConsoleDesign", () => {
  it("reads UI copy and theme tokens from the pencil file", async () => {
    const design = await readPencilConsoleDesign();

    expect(design.hero.eyebrow).toBe("YOUTUBE リサーチツール");
    expect(design.hero.headline.length).toBeGreaterThan(0);
    expect(Array.isArray(design.hero.flowSteps)).toBe(true);
    expect(design.resolver.actionLabel).toBe("動画一覧を取得する");
    expect(design.extractor.actionLabel).toBe("動画データを抽出する");
    expect(design.extractor.commentOnlyLabel).toBe("コメントのみ");
    expect(design.theme.canvas).toBe("#050816");
    expect(design.layout.heroMinHeight).toBe(194);
    expect(design.layout.resolverSummaryMinHeight).toBe(156);
    expect(design.layout.extractorDataMinHeight).toBe(612);
    expect(design.layout.resolverPrimaryWidth).toBe(188);
    expect(design.layout.extractorCommentsOnlyWidth).toBe(148);
  });
});
