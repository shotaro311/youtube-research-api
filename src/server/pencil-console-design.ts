import { readFile } from "fs/promises";
import { join } from "path";

type PenNode = {
  type?: string;
  id?: string;
  name?: string;
  fill?: string;
  content?: string;
  width?: number | string;
  height?: number | string;
  fontSize?: number;
  children?: PenNode[];
};

type FlowStep = {
  title: string;
  description: string;
};

export type PencilConsoleDesign = {
  theme: {
    canvas: string;
    panel: string;
    card: string;
    accent: string;
    primaryText: string;
    secondaryText: string;
    tertiaryText: string;
    inputText: string;
    darkText: string;
    secondaryButton: string;
  };
  layout: {
    heroMinHeight: number;
    panelMinHeight: number;
    resolverSummaryMinHeight: number;
    resolverListMinHeight: number;
    extractorSummaryMinHeight: number;
    extractorDataMinHeight: number;
    resolverPrimaryWidth: number;
    resolverSendWidth: number;
    extractorPrimaryWidth: number;
    extractorCommentsOnlyWidth: number;
    heroHeadlineFontSize: number;
    heroLeadFontSize: number;
    resolverHeadingFontSize: number;
    extractorHeadingFontSize: number;
  };
  hero: {
    eyebrow: string;
    headline: string;
    lead: string;
    flowLabel?: string;
    flowTitle?: string;
    flowSteps: FlowStep[];
  };
  resolver: {
    kicker: string;
    heading: string;
    inputLabel: string;
    inputPlaceholder: string;
    actionLabel: string;
    actionHint?: string;
    sendLabel: string;
    summaryTitle: string;
    summaryHint: string;
    listTitle: string;
    listHint: string;
    addLabel: string;
  };
  extractor: {
    kicker: string;
    heading: string;
    inputLabel: string;
    inputPlaceholder: string;
    actionLabel: string;
    commentOnlyLabel: string;
    actionHint?: string;
    summaryTitle: string;
    dataTitle: string;
  };
};

const DEFAULT_DESIGN: PencilConsoleDesign = {
  theme: {
    canvas: "#050816",
    panel: "#0B1220",
    card: "#111827",
    accent: "#C9A962",
    primaryText: "#FFFFFF",
    secondaryText: "#B6BDC8",
    tertiaryText: "#8A8F98",
    inputText: "#E5E7EB",
    darkText: "#0A0A0A",
    secondaryButton: "#243042",
  },
  layout: {
    heroMinHeight: 194,
    panelMinHeight: 1203,
    resolverSummaryMinHeight: 156,
    resolverListMinHeight: 652,
    extractorSummaryMinHeight: 196,
    extractorDataMinHeight: 612,
    resolverPrimaryWidth: 188,
    resolverSendWidth: 132,
    extractorPrimaryWidth: 195,
    extractorCommentsOnlyWidth: 148,
    heroHeadlineFontSize: 40,
    heroLeadFontSize: 18,
    resolverHeadingFontSize: 27,
    extractorHeadingFontSize: 28,
  },
  hero: {
    eyebrow: "YOUTUBE リサーチツール",
    headline: "YouTubeリサーチツール",
    lead:
      "チャンネル・再生リスト・動画URLを入力して、動画一覧の取得から動画データの抽出まで進められる、リサーチ向けの操作画面です。",
    flowLabel: "使い方",
    flowTitle: "3ステップで使える",
    flowSteps: [
      { title: "01  動画一覧を取得", description: "チャンネル・再生リストから動画URLを集める" },
      { title: "02  対象動画を選ぶ", description: "一覧からそのまま抽出欄に入れる" },
      { title: "03  抽出結果を確認", description: "データと取得状況を見て次の調査へ進む" },
    ],
  },
  resolver: {
    kicker: "動画一覧取得",
    heading: "チャンネル / 再生リストから動画一覧を取得",
    inputLabel: "入力URL",
    inputPlaceholder: "https://www.youtube.com/@example",
    actionLabel: "動画一覧を取得する",
    actionHint: "チャンネルURLまたは再生リストURLを入力",
    sendLabel: "抽出へ送る",
    summaryTitle: "取得結果",
    summaryHint: "一覧から動画URLを選んで、右の抽出欄へ入れられます",
    listTitle: "取得した動画URL",
    listHint: "各URLは直接編集でき、下から追加できます",
    addLabel: "URLを追加",
  },
  extractor: {
    kicker: "動画抽出",
    heading: "動画データを抽出",
    inputLabel: "動画URL",
    inputPlaceholder: "watch?v=dQw4w9WgXcQ",
    actionLabel: "動画データを抽出する",
    commentOnlyLabel: "コメントのみ",
    actionHint: "字幕・コメントを含めて実行",
    summaryTitle: "動画概要",
    dataTitle: "取得状況とプレビュー",
  },
};

function findNode(node: PenNode | undefined, predicate: (candidate: PenNode) => boolean): PenNode | null {
  if (!node) return null;
  if (predicate(node)) return node;

  for (const child of node.children ?? []) {
    const match = findNode(child, predicate);
    if (match) return match;
  }

  return null;
}

function findNodeByName(node: PenNode | undefined, name: string): PenNode | null {
  return findNode(node, (candidate) => candidate.name === name);
}

function findTextChildByName(node: PenNode | null, name: string): string | null {
  return (
    node?.children?.find((child) => child.type === "text" && child.name === name && typeof child.content === "string")?.content ?? null
  );
}

function getTextChildren(node: PenNode | null): PenNode[] {
  return (node?.children ?? []).filter((child) => child.type === "text" && typeof child.content === "string");
}

function getTextAt(node: PenNode | null, index: number): string | null {
  return getTextChildren(node)[index]?.content ?? null;
}

function getFill(node: PenNode | null, fallback: string): string {
  return typeof node?.fill === "string" ? node.fill : fallback;
}

function getNumberValue(value: number | string | undefined, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function parseFlowSteps(flowCard: PenNode | null): FlowStep[] {
  const textChildren = getTextChildren(flowCard).slice(2);
  if (textChildren.length === 0) return DEFAULT_DESIGN.hero.flowSteps;

  return textChildren.map((child) => {
    const [title = "", ...rest] = (child.content ?? "").split("\n");
    return {
      title: title.trim(),
      description: rest.join(" ").trim(),
    };
  });
}

function readResolverSendLabel(panel: PenNode | null): string {
  const groupedActions = findNodeByName(panel ?? undefined, "Resolver Actions");
  const groupedText = getTextAt(groupedActions?.children?.[1] ?? null, 0);
  if (groupedText) return groupedText;

  return DEFAULT_DESIGN.resolver.sendLabel;
}

function readExtractorCommentOnlyLabel(panel: PenNode | null): string {
  return (
    getTextAt(findNodeByName(panel ?? undefined, "Extractor Action Comments Only"), 0) ?? DEFAULT_DESIGN.extractor.commentOnlyLabel
  );
}

function getTextCount(node: PenNode | null): number {
  return getTextChildren(node).length;
}

function getOptionalTextAt(node: PenNode | null, index: number): string | undefined {
  return getTextAt(node, index) ?? undefined;
}

function readResolverListHint(listCard: PenNode | null): string {
  const secondText = getTextAt(listCard, 1);
  if (secondText && !secondText.includes("watch?v=") && secondText.length < 80) {
    return secondText;
  }

  return DEFAULT_DESIGN.resolver.listHint;
}

export async function readPencilConsoleDesign(): Promise<PencilConsoleDesign> {
  const filePath = join(process.cwd(), "docs/sample/youtube-research-console.pen");
  const content = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(content) as { children?: PenNode[] };
  const root = parsed.children?.[0];

  const hero = findNodeByName(root, "Hero");
  const heroLeft = findNodeByName(hero ?? undefined, "Hero Left");
  const flowCard = findNodeByName(hero ?? undefined, "Flow Card");
  const resolverPanel = findNodeByName(root, "Resolver Panel");
  const resolverInput = findNodeByName(resolverPanel ?? undefined, "Resolver Input");
  const resolverAction = findNodeByName(resolverPanel ?? undefined, "Resolver Action");
  const resolverSummary = findNodeByName(resolverPanel ?? undefined, "Resolver Summary");
  const resolverList = findNodeByName(resolverPanel ?? undefined, "Resolver List");
  const resolverAddButton = findNodeByName(resolverPanel ?? undefined, "Resolver Add URL");
  const extractorPanel = findNodeByName(root, "Extractor Panel");
  const extractorInput = findNodeByName(extractorPanel ?? undefined, "Extractor Input");
  const extractorAction = findNodeByName(extractorPanel ?? undefined, "Extractor Action");
  const extractorActions = findNodeByName(extractorPanel ?? undefined, "Extractor Actions");
  const extractorSummary = findNodeByName(extractorPanel ?? undefined, "Extractor Summary");
  const extractorData = findNodeByName(extractorPanel ?? undefined, "Extractor Data");

  return {
    theme: {
      canvas: getFill(root ?? null, DEFAULT_DESIGN.theme.canvas),
      panel: getFill(hero ?? null, DEFAULT_DESIGN.theme.panel),
      card: getFill(resolverInput ?? null, DEFAULT_DESIGN.theme.card),
      accent: getFill(getTextChildren(heroLeft)[0] ?? null, DEFAULT_DESIGN.theme.accent),
      primaryText: getFill(getTextChildren(heroLeft)[1] ?? null, DEFAULT_DESIGN.theme.primaryText),
      secondaryText: getFill(getTextChildren(heroLeft)[2] ?? null, DEFAULT_DESIGN.theme.secondaryText),
      tertiaryText: getFill(getTextChildren(resolverInput)[0] ?? null, DEFAULT_DESIGN.theme.tertiaryText),
      inputText: getFill(getTextChildren(resolverInput)[1] ?? null, DEFAULT_DESIGN.theme.inputText),
      darkText: getFill(getTextChildren(extractorAction)[0] ?? null, DEFAULT_DESIGN.theme.darkText),
      secondaryButton: getFill(findNodeByName(resolverPanel ?? undefined, "Resolver Action Send"), DEFAULT_DESIGN.theme.secondaryButton),
    },
    layout: {
      heroMinHeight: getNumberValue(hero?.height, DEFAULT_DESIGN.layout.heroMinHeight),
      panelMinHeight: getNumberValue(findNodeByName(root, "Panels")?.height, DEFAULT_DESIGN.layout.panelMinHeight),
      resolverSummaryMinHeight: getNumberValue(resolverSummary?.height, DEFAULT_DESIGN.layout.resolverSummaryMinHeight),
      resolverListMinHeight: getNumberValue(resolverList?.height, DEFAULT_DESIGN.layout.resolverListMinHeight),
      extractorSummaryMinHeight: getNumberValue(extractorSummary?.height, DEFAULT_DESIGN.layout.extractorSummaryMinHeight),
      extractorDataMinHeight: getNumberValue(extractorData?.height, DEFAULT_DESIGN.layout.extractorDataMinHeight),
      resolverPrimaryWidth: getNumberValue(
        findNodeByName(resolverPanel ?? undefined, "Resolver Action Primary")?.width,
        DEFAULT_DESIGN.layout.resolverPrimaryWidth,
      ),
      resolverSendWidth: getNumberValue(
        findNodeByName(resolverPanel ?? undefined, "Resolver Action Send")?.width,
        DEFAULT_DESIGN.layout.resolverSendWidth,
      ),
      extractorPrimaryWidth: getNumberValue(extractorAction?.width, DEFAULT_DESIGN.layout.extractorPrimaryWidth),
      extractorCommentsOnlyWidth: getNumberValue(
        findNodeByName(extractorPanel ?? undefined, "Extractor Action Comments Only")?.width,
        DEFAULT_DESIGN.layout.extractorCommentsOnlyWidth,
      ),
      heroHeadlineFontSize: getNumberValue(getTextChildren(heroLeft)[1]?.fontSize, DEFAULT_DESIGN.layout.heroHeadlineFontSize),
      heroLeadFontSize: getNumberValue(getTextChildren(heroLeft)[2]?.fontSize, DEFAULT_DESIGN.layout.heroLeadFontSize),
      resolverHeadingFontSize: getNumberValue(getTextChildren(resolverPanel)[1]?.fontSize, DEFAULT_DESIGN.layout.resolverHeadingFontSize),
      extractorHeadingFontSize: getNumberValue(getTextChildren(extractorPanel)[1]?.fontSize, DEFAULT_DESIGN.layout.extractorHeadingFontSize),
    },
    hero: {
      eyebrow: findTextChildByName(heroLeft, "eyebrow") ?? getTextAt(heroLeft, 0) ?? DEFAULT_DESIGN.hero.eyebrow,
      headline: findTextChildByName(heroLeft, "headline") ?? getTextAt(heroLeft, 1) ?? DEFAULT_DESIGN.hero.headline,
      lead: findTextChildByName(heroLeft, "lead") ?? getTextAt(heroLeft, 2) ?? DEFAULT_DESIGN.hero.lead,
      flowLabel: flowCard ? getOptionalTextAt(flowCard, 0) : undefined,
      flowTitle: flowCard ? getOptionalTextAt(flowCard, 1) : undefined,
      flowSteps: flowCard ? parseFlowSteps(flowCard) : [],
    },
    resolver: {
      kicker: getTextAt(resolverPanel, 0) ?? DEFAULT_DESIGN.resolver.kicker,
      heading: getTextAt(resolverPanel, 1) ?? DEFAULT_DESIGN.resolver.heading,
      inputLabel: getTextAt(resolverInput, 0) ?? DEFAULT_DESIGN.resolver.inputLabel,
      inputPlaceholder: getTextAt(resolverInput, 1) ?? DEFAULT_DESIGN.resolver.inputPlaceholder,
      actionLabel:
        getTextAt(findNodeByName(resolverPanel ?? undefined, "Resolver Action Primary"), 0) ??
        getTextAt(resolverAction, 0) ??
        DEFAULT_DESIGN.resolver.actionLabel,
      actionHint: getTextCount(resolverAction) > 1 ? getOptionalTextAt(resolverAction, 1) : undefined,
      sendLabel: readResolverSendLabel(resolverPanel),
      summaryTitle: getTextAt(resolverSummary, 0) ?? DEFAULT_DESIGN.resolver.summaryTitle,
      summaryHint: getTextAt(resolverSummary, 2) ?? DEFAULT_DESIGN.resolver.summaryHint,
      listTitle: getTextAt(resolverList, 0) ?? DEFAULT_DESIGN.resolver.listTitle,
      listHint: readResolverListHint(resolverList),
      addLabel: getTextAt(resolverAddButton, 0) ?? DEFAULT_DESIGN.resolver.addLabel,
    },
    extractor: {
      kicker: getTextAt(extractorPanel, 0) ?? DEFAULT_DESIGN.extractor.kicker,
      heading: getTextAt(extractorPanel, 1) ?? DEFAULT_DESIGN.extractor.heading,
      inputLabel: getTextAt(extractorInput, 0) ?? DEFAULT_DESIGN.extractor.inputLabel,
      inputPlaceholder: getTextAt(extractorInput, 1) ?? DEFAULT_DESIGN.extractor.inputPlaceholder,
      actionLabel:
        getTextAt(findNodeByName(extractorActions ?? undefined, "Extractor Action"), 0) ??
        getTextAt(extractorAction, 0) ??
        DEFAULT_DESIGN.extractor.actionLabel,
      commentOnlyLabel: readExtractorCommentOnlyLabel(extractorPanel),
      actionHint: getTextCount(extractorAction) > 1 ? getOptionalTextAt(extractorAction, 1) : undefined,
      summaryTitle: getTextAt(extractorSummary, 0) ?? DEFAULT_DESIGN.extractor.summaryTitle,
      dataTitle: getTextAt(extractorData, 0) ?? DEFAULT_DESIGN.extractor.dataTitle,
    },
  };
}
