"use client";

import { useState, useTransition } from "react";

import type { CommentAnalysis } from "../domain/youtube/comment-analysis";
import type { TranscriptAnalysis } from "../domain/youtube/transcript-analysis";
import type { ExtractVideoResponse, ResolveSourceResponse, StageDiagnostic } from "../domain/youtube/types";
import type { PencilConsoleDesign } from "../server/pencil-console-design";
import styles from "./research-console.module.css";

type ApiError = {
  error?: string;
};

const DEFAULT_MAX_VIDEOS = 25;
type ExtractionMode = "all" | "comments-only";
type AnalysisKind = "transcript" | "comments";
type ExtractedVideoCard = {
  url: string;
  mode: ExtractionMode;
  status: "pending" | "success" | "error";
  result?: ExtractVideoResponse;
  error?: string;
  transcriptAnalysisStatus?: "idle" | "pending" | "done" | "error";
  commentAnalysisStatus?: "idle" | "pending" | "done" | "error";
  transcriptAnalysis?: TranscriptAnalysis;
  commentAnalysis?: CommentAnalysis;
  transcriptAnalysisError?: string;
  commentAnalysisError?: string;
};

type VideoAnalysisResponse = {
  transcriptAnalysis?: TranscriptAnalysis;
  commentAnalysis?: CommentAnalysis;
  transcriptAnalysisError?: string;
  commentAnalysisError?: string;
};

function formatCount(value: number): string {
  return new Intl.NumberFormat("ja-JP").format(value);
}

function summarizeDiagnostics(diagnostics: StageDiagnostic[]): string {
  if (diagnostics.length === 0) return "未取得";

  return diagnostics
    .map((item) => (item.success ? item.stage : `${item.stage}: ${item.error ?? "failed"}`))
    .join(" / ");
}

function summarizeSource(result: ResolveSourceResponse): string {
  const sourceTypeLabel = result.sourceType === "channel" ? "チャンネル" : "プレイリスト";
  return `${sourceTypeLabel} / ${formatCount(result.urls.length)}件 / Shorts ${result.excluded.shorts}件・ライブ ${result.excluded.live}件を除外`;
}

function summarizeVideo(result: ExtractVideoResponse): string {
  return `${result.rawData.channelName} / ${formatCount(result.rawData.views)}回視聴 / ${result.rawData.duration || "長さ未取得"}`;
}

function parseEditableUrls(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((url) => url.trim())
    .filter(Boolean);
}

function updateCardAtIndex(
  cards: ExtractedVideoCard[],
  targetIndex: number,
  updater: (card: ExtractedVideoCard) => ExtractedVideoCard,
): ExtractedVideoCard[] {
  return cards.map((card, currentIndex) => (currentIndex === targetIndex ? updater(card) : card));
}

function findSendableUrl(value: string): string {
  return parseEditableUrls(value)[0] ?? "";
}

function toThemeStyle(design: PencilConsoleDesign): React.CSSProperties {
  const { layout, theme } = design;

  return {
    ["--console-canvas" as string]: theme.canvas,
    ["--console-panel" as string]: theme.panel,
    ["--console-card" as string]: theme.card,
    ["--console-accent" as string]: theme.accent,
    ["--console-primary-text" as string]: theme.primaryText,
    ["--console-secondary-text" as string]: theme.secondaryText,
    ["--console-tertiary-text" as string]: theme.tertiaryText,
    ["--console-input-text" as string]: theme.inputText,
    ["--console-dark-text" as string]: theme.darkText,
    ["--console-secondary-button" as string]: theme.secondaryButton,
    ["--console-hero-min-height" as string]: `${layout.heroMinHeight}px`,
    ["--console-panel-min-height" as string]: `${layout.panelMinHeight}px`,
    ["--console-resolver-summary-min-height" as string]: `${layout.resolverSummaryMinHeight}px`,
    ["--console-resolver-list-min-height" as string]: `${layout.resolverListMinHeight}px`,
    ["--console-extractor-summary-min-height" as string]: `${layout.extractorSummaryMinHeight}px`,
    ["--console-extractor-data-min-height" as string]: `${layout.extractorDataMinHeight}px`,
    ["--console-hero-headline-size" as string]: `${layout.heroHeadlineFontSize}px`,
    ["--console-hero-lead-size" as string]: `${layout.heroLeadFontSize}px`,
    ["--console-resolver-heading-size" as string]: `${layout.resolverHeadingFontSize}px`,
    ["--console-extractor-heading-size" as string]: `${layout.extractorHeadingFontSize}px`,
  };
}

async function readApiResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "リクエストに失敗しました");
  }

  return body;
}

function renderTranscriptAnalysis(analysis?: TranscriptAnalysis, error?: string): React.JSX.Element {
  if (analysis) {
    return (
      <div className={styles.analysisPane}>
        <section className={styles.analysisScoreCard}>
          <div>
            <p className={styles.analysisEyebrow}>総合評価</p>
            <h4 className={styles.analysisScoreValue}>
              {analysis.overallScore} / 5 <span>{analysis.overallVerdict}</span>
            </h4>
          </div>
          <p className={styles.analysisParagraph}>{analysis.overallEvaluation}</p>
        </section>

        <section className={styles.analysisBlock}>
          <h4>動画の流れと視聴者心理</h4>
          <div className={styles.analysisStageList}>
            {analysis.flowStages.map((stage, stageIndex) => (
              <article className={styles.analysisStageCard} key={`${stage.stage}-${stageIndex}`}>
                <h5>{stage.stage}</h5>
                <p className={styles.analysisParagraph}>{stage.summary}</p>
                <p className={styles.analysisDetailLine}>
                  <strong>視聴者心理:</strong> {stage.viewerPsychology}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.analysisSplitGrid}>
          <div className={styles.analysisBlock}>
            <h4>視聴者に寄り添う発言</h4>
            {analysis.empathyMoments.length > 0 ? (
              <ul className={styles.analysisList}>
                {analysis.empathyMoments.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.analysisParagraph}>なし</p>
            )}
          </div>

          <div className={styles.analysisBlock}>
            <h4>企画意図</h4>
            <p className={styles.analysisParagraph}>{analysis.creatorIntent}</p>
          </div>
        </section>

        <section className={styles.analysisSplitGrid}>
          <div className={styles.analysisBlock}>
            <h4>良い部分</h4>
            {analysis.viewerStrengths.length > 0 ? (
              <ul className={styles.analysisList}>
                {analysis.viewerStrengths.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.analysisParagraph}>なし</p>
            )}
          </div>

          <div className={styles.analysisBlock}>
            <h4>改善が必要な部分</h4>
            {analysis.viewerImprovements.length > 0 ? (
              <ul className={styles.analysisList}>
                {analysis.viewerImprovements.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.analysisParagraph}>なし</p>
            )}
          </div>
        </section>
      </div>
    );
  }

  return <p className={styles.emptyText}>{error || "台本分析結果はまだありません。"}</p>;
}

function renderCommentAnalysis(
  analysis: CommentAnalysis | undefined,
  comments: ExtractVideoResponse["rawData"]["comments"],
  error?: string,
): React.JSX.Element {
  if (analysis) {
    return (
      <div className={styles.analysisPane}>
        <section className={styles.commentRatioGrid}>
          <article className={`${styles.commentRatioCard} ${styles.positiveTone}`}>
            <p className={styles.analysisEyebrow}>ポジティブ</p>
            <strong>{analysis.positivePercent}%</strong>
          </article>
          <article className={`${styles.commentRatioCard} ${styles.neutralTone}`}>
            <p className={styles.analysisEyebrow}>中立</p>
            <strong>{analysis.neutralPercent}%</strong>
          </article>
          <article className={`${styles.commentRatioCard} ${styles.negativeTone}`}>
            <p className={styles.analysisEyebrow}>ネガティブ</p>
            <strong>{analysis.negativePercent}%</strong>
          </article>
        </section>

        <section className={styles.analysisBlock}>
          <h4>総評</h4>
          <p className={styles.analysisParagraph}>{analysis.overview}</p>
        </section>

        <section className={styles.analysisSplitGrid}>
          <div className={styles.analysisBlock}>
            <h4>視聴者像</h4>
            <p className={styles.analysisParagraph}>{analysis.audienceSummary}</p>
          </div>
          <div className={styles.analysisBlock}>
            <h4>視聴者心理</h4>
            <p className={styles.analysisParagraph}>{analysis.psychologySummary}</p>
          </div>
        </section>

        <section className={styles.analysisSplitGrid}>
          <div className={styles.analysisBlock}>
            <h4>ポジティブ傾向</h4>
            {analysis.positiveThemes.length > 0 ? (
              <ul className={styles.analysisList}>
                {analysis.positiveThemes.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.analysisParagraph}>なし</p>
            )}
          </div>
          <div className={styles.analysisBlock}>
            <h4>ネガティブ傾向</h4>
            {analysis.negativeThemes.length > 0 ? (
              <ul className={styles.analysisList}>
                {analysis.negativeThemes.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.analysisParagraph}>なし</p>
            )}
          </div>
        </section>

        <section className={styles.analysisBlock}>
          <h4>個別コメント分析</h4>
          <div className={styles.commentAnalysisList}>
            {analysis.items.map((item) => {
              const comment = comments[item.commentIndex - 1];
              return (
                <article className={styles.commentAnalysisCard} key={`comment-analysis-${item.commentIndex}`}>
                  <div className={styles.commentAnalysisHeader}>
                    <strong>{comment?.author || "投稿者不明"}</strong>
                    <span
                      className={`${styles.sentimentChip} ${
                        item.sentiment === "positive"
                          ? styles.positiveTone
                          : item.sentiment === "negative"
                            ? styles.negativeTone
                            : styles.neutralTone
                      }`}
                    >
                      {item.sentiment === "positive" ? "ポジティブ" : item.sentiment === "negative" ? "ネガティブ" : "中立"}
                    </span>
                  </div>
                  <p className={styles.commentAnalysisText}>{comment?.text || "本文未取得"}</p>
                  <p className={styles.analysisDetailLine}>
                    <strong>視聴者像:</strong> {item.viewerType}
                  </p>
                  <p className={styles.analysisDetailLine}>
                    <strong>心理:</strong> {item.psychology}
                  </p>
                  <p className={styles.analysisDetailLine}>
                    <strong>個別評価:</strong> {item.note}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  return <p className={styles.emptyText}>{error || "コメント分析結果はまだありません。"}</p>;
}

export function ResearchConsole({ design }: { design: PencilConsoleDesign }): React.JSX.Element {
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceResult, setSourceResult] = useState<ResolveSourceResponse | null>(null);
  const [sourceError, setSourceError] = useState("");
  const [editableUrlsText, setEditableUrlsText] = useState("");
  const [videoUrlsText, setVideoUrlsText] = useState("");
  const [videoResults, setVideoResults] = useState<ExtractedVideoCard[]>([]);
  const [videoError, setVideoError] = useState("");
  const [sheetMessage, setSheetMessage] = useState("");
  const [isExportingToSheets, setIsExportingToSheets] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [lastExtractionMode, setLastExtractionMode] = useState<ExtractionMode>("all");
  const [activeAnalysisCardIndex, setActiveAnalysisCardIndex] = useState<number | null>(null);
  const [activeAnalysisTab, setActiveAnalysisTab] = useState<AnalysisKind>("transcript");
  const [isResolving, startResolving] = useTransition();

  const sendableUrl = findSendableUrl(editableUrlsText);
  const successCount = videoResults.filter((item) => item.status === "success").length;
  const errorCount = videoResults.filter((item) => item.status === "error").length;
  const pendingCount = videoResults.filter((item) => item.status === "pending").length;
  const successfulResults = videoResults.flatMap((item) => (item.status === "success" && item.result ? [item.result] : []));
  const activeAnalysisCard =
    activeAnalysisCardIndex !== null && activeAnalysisCardIndex >= 0 && activeAnalysisCardIndex < videoResults.length
      ? videoResults[activeAnalysisCardIndex]
      : null;
  const showHeroFlow = Boolean(design.hero.flowLabel && design.hero.flowTitle && design.hero.flowSteps.length > 0);

  function handleSourceSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSourceError("");

    startResolving(() => {
      void (async () => {
        try {
          const response = await fetch("/api/v1/sources/resolve", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              inputUrl: sourceUrl,
              maxVideos: DEFAULT_MAX_VIDEOS,
            }),
          });

          const data = await readApiResponse<ResolveSourceResponse>(response);
          setSourceResult(data);
          setEditableUrlsText(data.urls.join("\n"));
        } catch (error) {
          setSourceResult(null);
          setEditableUrlsText("");
          setSourceError(error instanceof Error ? error.message : "動画一覧の取得に失敗しました");
        }
      })();
    });
  }

  function startVideoExtraction(mode: ExtractionMode): void {
    setVideoError("");
    setSheetMessage("");
    setActiveAnalysisCardIndex(null);
    setActiveAnalysisTab("transcript");
    setLastExtractionMode(mode);
    const urls = parseEditableUrls(videoUrlsText);
    if (urls.length === 0) {
      setVideoResults([]);
      setVideoError("動画URLを1件以上入力してください。");
      return;
    }

    setVideoResults(
      urls.map((url) => ({
        url,
        mode,
        status: "pending",
        transcriptAnalysisStatus: "idle",
        commentAnalysisStatus: "idle",
      })),
    );
    setIsExtracting(true);

    void (async () => {
      try {
        await Promise.all(
          urls.map(async (url, index) => {
            try {
              const response = await fetch("/api/v1/videos/extract", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  url,
                  includeTranscript: mode === "all",
                  includeComments: true,
                }),
              });

              const data = await readApiResponse<ExtractVideoResponse>(response);
              setVideoResults((current) =>
                updateCardAtIndex(current, index, (item) => ({
                  ...item,
                  status: "success",
                  result: data,
                  error: undefined,
                  transcriptAnalysisStatus: "idle",
                  commentAnalysisStatus: "idle",
                  transcriptAnalysis: undefined,
                  commentAnalysis: undefined,
                  transcriptAnalysisError: undefined,
                  commentAnalysisError: undefined,
                })),
              );
            } catch (error) {
              setVideoResults((current) =>
                updateCardAtIndex(current, index, (item) => ({
                  ...item,
                  status: "error",
                  error: error instanceof Error ? error.message : "動画抽出に失敗しました",
                })),
              );
            }
          }),
        );
      } catch (error) {
        setVideoError(error instanceof Error ? error.message : "動画抽出に失敗しました");
      } finally {
        setIsExtracting(false);
      }
    })();
  }

  function handleVideoSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    startVideoExtraction("all");
  }

  function handleCommentsOnlyExtract(): void {
    startVideoExtraction("comments-only");
  }

  function handleSendToExtractor(): void {
    if (!sendableUrl) {
      setSourceError("右側へ送るURLがありません。左の一覧を確認してください。");
      return;
    }

    setSourceError("");
    setVideoError("");
    setVideoUrlsText(editableUrlsText.trim());
  }

  function handleExportToSheets(): void {
    if (successfulResults.length === 0) {
      setSheetMessage("スプレッドシートへ反映できる抽出結果がありません。");
      return;
    }

    setSheetMessage("");
    setIsExportingToSheets(true);

    void (async () => {
      try {
        const response = await fetch("/api/v1/sheets/export", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            items: successfulResults,
          }),
        });

        const data = await readApiResponse<{
          appendedRows: number;
          storedScriptRows: number;
          storedCommentRows: number;
          storedCommentSheetRows: number;
          detailLinksEnabled: boolean;
        }>(response);
        const detailMessage = data.detailLinksEnabled ? "台本リンク付きで" : "台本本文を保存しつつ";
        setSheetMessage(
          `${formatCount(data.appendedRows)}件を ${detailMessage} 動画分析 シートへ反映しました。台本DB には ${formatCount(data.storedScriptRows)} 行、コメントDB には ${formatCount(data.storedCommentRows)} 行、コメント分析には ${formatCount(data.storedCommentSheetRows)} 行を追加しました。`,
        );
      } catch (error) {
        setSheetMessage(error instanceof Error ? error.message : "スプレッドシート反映に失敗しました");
      } finally {
        setIsExportingToSheets(false);
      }
    })();
  }

  function handleAnalyzeCard(index: number, kind: AnalysisKind): void {
    const targetCard = videoResults[index];
    const result = targetCard?.result;
    if (!result) {
      return;
    }

    const currentStatus =
      kind === "transcript" ? targetCard.transcriptAnalysisStatus : targetCard.commentAnalysisStatus;
    if (currentStatus === "pending") {
      return;
    }

    setActiveAnalysisCardIndex(index);
    setActiveAnalysisTab(kind);

    setVideoResults((current) =>
      updateCardAtIndex(current, index, (item) => ({
        ...item,
        transcriptAnalysisStatus:
          kind === "transcript"
            ? "pending"
            : item.transcriptAnalysis
              ? "done"
              : item.transcriptAnalysisStatus ?? "idle",
        commentAnalysisStatus:
          kind === "comments"
            ? "pending"
            : item.commentAnalysis
              ? "done"
              : item.commentAnalysisStatus ?? "idle",
        transcriptAnalysisError:
          kind === "transcript" ? undefined : item.transcriptAnalysisError,
        commentAnalysisError:
          kind === "comments" ? undefined : item.commentAnalysisError,
      })),
    );

    void (async () => {
      try {
        const response = await fetch("/api/v1/videos/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            rawData: result.rawData,
            includeTranscriptAnalysis: kind === "transcript",
            includeCommentAnalysis: kind === "comments",
          }),
        });

        const data = await readApiResponse<VideoAnalysisResponse>(response);
        setVideoResults((current) =>
          updateCardAtIndex(current, index, (item) => ({
            ...item,
            transcriptAnalysis: data.transcriptAnalysis ?? item.transcriptAnalysis,
            commentAnalysis: data.commentAnalysis ?? item.commentAnalysis,
            transcriptAnalysisStatus:
              kind === "transcript"
                ? data.transcriptAnalysis
                  ? "done"
                  : "error"
                : item.transcriptAnalysis
                  ? "done"
                  : item.transcriptAnalysisStatus ?? "idle",
            commentAnalysisStatus:
              kind === "comments"
                ? data.commentAnalysis
                  ? "done"
                  : "error"
                : item.commentAnalysis
                  ? "done"
                  : item.commentAnalysisStatus ?? "idle",
            transcriptAnalysisError:
              kind === "transcript" ? data.transcriptAnalysisError : item.transcriptAnalysisError,
            commentAnalysisError:
              kind === "comments" ? data.commentAnalysisError : item.commentAnalysisError,
          })),
        );
      } catch (error) {
        setVideoResults((current) =>
          updateCardAtIndex(current, index, (item) => ({
            ...item,
            transcriptAnalysisStatus:
              kind === "transcript"
                ? "error"
                : item.transcriptAnalysis
                  ? "done"
                  : item.transcriptAnalysisStatus ?? "idle",
            commentAnalysisStatus:
              kind === "comments"
                ? "error"
                : item.commentAnalysis
                  ? "done"
                  : item.commentAnalysisStatus ?? "idle",
            transcriptAnalysisError:
              kind === "transcript"
                ? error instanceof Error
                  ? error.message
                  : "台本分析に失敗しました"
                : item.transcriptAnalysisError,
            commentAnalysisError:
              kind === "comments"
                ? error instanceof Error
                  ? error.message
                  : "コメント分析に失敗しました"
                : item.commentAnalysisError,
          })),
        );
      }
    })();
  }

  function handleAnalysisTabChange(nextTab: AnalysisKind): void {
    setActiveAnalysisTab(nextTab);
  }

  return (
    <main className={styles.shell} style={toThemeStyle(design)}>
      <section className={`${styles.hero} ${showHeroFlow ? "" : styles.heroSingle}`}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{design.hero.eyebrow}</p>
          <h1>{design.hero.headline}</h1>
          <p className={styles.lead}>{design.hero.lead}</p>
        </div>

        {showHeroFlow ? (
          <aside className={styles.heroFlowCard}>
            <p className={styles.heroFlowLabel}>{design.hero.flowLabel}</p>
            <h2>{design.hero.flowTitle}</h2>
            <div className={styles.heroFlowList}>
              {design.hero.flowSteps.map((step) => (
                <div className={styles.heroFlowItem} key={step.title}>
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </div>
              ))}
            </div>
          </aside>
        ) : null}
      </section>

      <section className={styles.panels}>
        <article className={styles.panel}>
          <div
            className={styles.panelIntro}
            style={{ ["--console-panel-heading-size" as string]: `${design.layout.resolverHeadingFontSize}px` }}
          >
            <p className={styles.panelKicker}>{design.resolver.kicker}</p>
            <h2>{design.resolver.heading}</h2>
          </div>

          <form className={styles.formStack} onSubmit={handleSourceSubmit}>
            <div className={styles.actionRow}>
              <div className={styles.actionButtonWrap}>
                <button
                  className={styles.primaryButton}
                  disabled={isResolving}
                  type="submit"
                  style={{ ["--button-width" as string]: `${design.layout.resolverPrimaryWidth}px` }}
                >
                  {isResolving ? "取得中..." : design.resolver.actionLabel}
                </button>
                {design.resolver.actionHint ? <p className={styles.actionHint}>{design.resolver.actionHint}</p> : null}
              </div>
              <button
                className={styles.secondaryButton}
                disabled={!sendableUrl}
                onClick={handleSendToExtractor}
                type="button"
                style={{ ["--button-width" as string]: `${design.layout.resolverSendWidth}px` }}
              >
                {design.resolver.sendLabel}
              </button>
            </div>

            <label className={styles.cardField}>
              <span className={styles.cardLabel}>{design.resolver.inputLabel}</span>
              <input
                className={styles.cardInput}
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder={design.resolver.inputPlaceholder}
                autoComplete="off"
              />
            </label>
          </form>

          {sourceError ? <p className={styles.errorText}>{sourceError}</p> : null}

          <section
            className={styles.infoCard}
            style={{ ["--card-min-height" as string]: `${design.layout.resolverSummaryMinHeight}px` }}
          >
            <p className={styles.infoTitle}>{design.resolver.summaryTitle}</p>
            {sourceResult ? (
              <>
                <h3>{summarizeSource(sourceResult)}</h3>
                <p className={styles.cardSupport}>{design.resolver.summaryHint}</p>
                <p className={styles.sourceMeta}>
                  {sourceResult.sourceName ?? "名前未取得"}
                  <br />
                  {sourceResult.sourceId}
                </p>
              </>
            ) : (
              <p className={styles.emptyText}>取得すると、ここに種別・件数・除外数が表示されます。</p>
            )}
          </section>

          <section
            className={`${styles.infoCard} ${styles.urlListCard}`}
            style={{ ["--card-min-height" as string]: `${design.layout.resolverListMinHeight}px` }}
          >
            <p className={styles.infoTitle}>{design.resolver.listTitle}</p>
            <p className={styles.cardSupport}>{design.resolver.listHint}</p>

            <label className={styles.urlTextareaWrap}>
              <textarea
                className={styles.urlTextarea}
                value={editableUrlsText}
                onChange={(event) => setEditableUrlsText(event.target.value)}
                placeholder={"https://www.youtube.com/watch?v=alpha000001\nhttps://www.youtube.com/watch?v=alpha000002"}
                spellCheck={false}
              />
            </label>

            <div className={styles.listFooter}>
              <p className={styles.captionText}>
                {sendableUrl ? "入力したURLを右側へまとめて送れます" : "右側へ送るURLを1件以上入力してください"}
              </p>
            </div>
          </section>
        </article>

        <article className={styles.panel}>
          <div
            className={styles.panelIntro}
            style={{ ["--console-panel-heading-size" as string]: `${design.layout.extractorHeadingFontSize}px` }}
          >
            <p className={styles.panelKicker}>{design.extractor.kicker}</p>
            <h2>{design.extractor.heading}</h2>
          </div>

          <form className={styles.formStack} onSubmit={handleVideoSubmit}>
            <div className={styles.actionRow}>
              <div className={styles.actionButtonWrap}>
                <button
                  className={styles.primaryButton}
                  disabled={isExtracting}
                  type="submit"
                  style={{ ["--button-width" as string]: `${design.layout.extractorPrimaryWidth}px` }}
                >
                  {isExtracting ? "抽出中..." : design.extractor.actionLabel}
                </button>
                {design.extractor.actionHint ? <p className={styles.actionHint}>{design.extractor.actionHint}</p> : null}
              </div>
              <button
                className={styles.secondaryButton}
                disabled={isExtracting}
                onClick={handleCommentsOnlyExtract}
                type="button"
                style={{ ["--button-width" as string]: `${design.layout.extractorCommentsOnlyWidth}px` }}
              >
                {design.extractor.commentOnlyLabel}
              </button>
            </div>

            <label className={styles.cardField}>
              <span className={styles.cardLabel}>{design.extractor.inputLabel}</span>
              <textarea
                className={styles.cardTextarea}
                value={videoUrlsText}
                onChange={(event) => setVideoUrlsText(event.target.value)}
                placeholder={design.extractor.inputPlaceholder}
                spellCheck={false}
              />
            </label>
          </form>

          {videoError ? <p className={styles.errorText}>{videoError}</p> : null}

          <section
            className={styles.infoCard}
            style={{ ["--card-min-height" as string]: `${design.layout.extractorSummaryMinHeight}px` }}
          >
            <p className={styles.infoTitle}>{design.extractor.summaryTitle}</p>
            {videoResults.length > 0 ? (
              <>
                <h3 className={styles.videoTitle}>{formatCount(videoResults.length)}件のURLを抽出</h3>
                <p className={styles.metaLine}>
                  抽出中 {formatCount(pendingCount)}件 / 成功 {formatCount(successCount)}件 / 失敗 {formatCount(errorCount)}件 /
                  モード{" "}
                  {lastExtractionMode === "comments-only" ? "コメントのみ" : "通常抽出"}
                </p>
                <div className={styles.summaryActions}>
                  <button
                    className={styles.secondaryButton}
                    disabled={isExportingToSheets || pendingCount > 0 || successfulResults.length === 0}
                    onClick={handleExportToSheets}
                    type="button"
                  >
                    {isExportingToSheets ? "反映中..." : "動画分析へ反映"}
                  </button>
                  {sheetMessage ? <p className={styles.captionText}>{sheetMessage}</p> : null}
                </div>
              </>
            ) : (
              <p className={styles.emptyText}>動画URLを改行区切りで入力して抽出すると、ここに件数と結果概要が表示されます。</p>
            )}
          </section>

          <section
            className={`${styles.infoCard} ${styles.extractorDataCard}`}
            style={{ ["--card-min-height" as string]: `${design.layout.extractorDataMinHeight}px` }}
          >
            <p className={styles.infoTitle}>{design.extractor.dataTitle}</p>

            {videoResults.length > 0 ? (
              <div className={styles.resultCardList}>
                {videoResults.map((item, index) => (
                  <details className={styles.resultCard} key={`${index}-${item.url}-${item.mode}`}>
                    <summary className={styles.resultSummary}>
                      <div className={styles.resultSummaryText}>
                        <p className={styles.resultCardTitle}>
                          {item.result?.rawData.title ?? (item.status === "pending" ? "抽出中..." : "抽出失敗")}
                        </p>
                        <p className={styles.resultUrl}>{item.url}</p>
                      </div>
                      <div className={styles.resultSummaryRight}>
                        {item.status === "success" ? (
                          <div className={styles.resultInlineActions} onClick={(event) => event.stopPropagation()}>
                            <button
                              className={`${styles.tertiaryButton} ${styles.inlineAnalysisButton}`}
                              type="button"
                              onClick={() => handleAnalyzeCard(index, "transcript")}
                              disabled={item.transcriptAnalysisStatus === "pending"}
                            >
                              {item.transcriptAnalysisStatus === "pending" ? "分析中..." : "台本分析"}
                            </button>
                            <button
                              className={`${styles.tertiaryButton} ${styles.inlineAnalysisButton}`}
                              type="button"
                              onClick={() => handleAnalyzeCard(index, "comments")}
                              disabled={item.commentAnalysisStatus === "pending"}
                            >
                              {item.commentAnalysisStatus === "pending" ? "分析中..." : "コメ分析"}
                            </button>
                          </div>
                        ) : null}
                        {item.status === "pending" ? (
                          <span className={styles.resultStatusLoading}>
                            <span className={styles.loadingDot} />
                            抽出中
                          </span>
                        ) : item.status === "error" ? (
                          <span className={styles.resultStatusError}>失敗</span>
                        ) : (
                          <span className={styles.resultStatusSuccess}>完了</span>
                        )}
                      </div>
                    </summary>
                    <div className={styles.resultCardBody}>
                      {item.status === "pending" ? (
                        <p className={styles.emptyText}>このURLを抽出しています。完了すると内容がここに表示されます。</p>
                      ) : item.result ? (
                        <>
                          <p className={styles.metaLine}>{summarizeVideo(item.result)}</p>

                          <div className={styles.statusBlock}>
                            <p className={styles.statusLine}>
                              metadata: {summarizeDiagnostics(item.result.diagnostics.metadata)}
                            </p>
                            <p className={styles.statusLine}>
                              transcript: {summarizeDiagnostics(item.result.diagnostics.transcript)}
                            </p>
                            <p className={styles.statusLine}>
                              comments: {summarizeDiagnostics(item.result.diagnostics.comments)}
                            </p>
                          </div>

                          <div className={styles.previewStack}>
                            <section className={styles.previewSection}>
                              <div className={styles.previewHeader}>
                                <h3>字幕</h3>
                                <span className={styles.previewCount}>
                                  {formatCount(item.result.rawData.transcript.length)}件
                                </span>
                              </div>
                              <div className={styles.scrollPane}>
                                {item.mode === "comments-only" ? (
                                  <p className={styles.emptyText}>コメントのみ抽出では字幕を取得していません。</p>
                                ) : item.result.rawData.transcript.length > 0 ? (
                                  item.result.rawData.transcript.map((segment, segmentIndex) => (
                                    <div
                                      className={styles.contentRow}
                                      key={`${item.url}-segment-${segment.time}-${segmentIndex}`}
                                    >
                                      <span>{segment.time}</span>
                                      <p>{segment.text}</p>
                                    </div>
                                  ))
                                ) : (
                                  <p className={styles.emptyText}>字幕は見つかりませんでした。</p>
                                )}
                              </div>
                            </section>

                            <section className={styles.previewSection}>
                              <div className={styles.previewHeader}>
                                <h3>コメント</h3>
                                <span className={styles.previewCount}>
                                  {formatCount(item.result.rawData.comments.length)}件
                                </span>
                              </div>
                              <div className={styles.scrollPane}>
                                {item.result.rawData.comments.length > 0 ? (
                                  item.result.rawData.comments.map((comment, commentIndex) => (
                                    <div
                                      className={styles.contentRow}
                                      key={`${item.url}-comment-${comment.author}-${commentIndex}`}
                                    >
                                      <span>{comment.author}</span>
                                      <p>{comment.text}</p>
                                    </div>
                                  ))
                                ) : (
                                  <p className={styles.emptyText}>コメントは見つかりませんでした。</p>
                                )}
                              </div>
                            </section>
                          </div>
                        </>
                      ) : (
                        <p className={styles.errorText}>{item.error ?? "動画抽出に失敗しました"}</p>
                      )}
                    </div>
                  </details>
                ))}
              </div>
            ) : (
              <p className={styles.emptyText}>URLごとの抽出結果カードがここに並びます。</p>
            )}
          </section>
        </article>
      </section>

      <section className={styles.analysisBoard}>
        <div className={styles.analysisBoardHeader}>
          <div>
            <p className={styles.infoTitle}>分析表示</p>
            <h2 className={styles.analysisBoardTitle}>
              {activeAnalysisCard?.result?.rawData.title ?? "動画カードの分析ボタンから結果を表示できます"}
            </h2>
            {activeAnalysisCard?.url ? <p className={styles.resultUrl}>{activeAnalysisCard.url}</p> : null}
          </div>
          {activeAnalysisCard ? (
            <div className={styles.analysisTabList}>
              <button
                type="button"
                className={`${styles.analysisTab} ${activeAnalysisTab === "transcript" ? styles.analysisTabActive : ""}`}
                onClick={() => handleAnalysisTabChange("transcript")}
              >
                台本分析
              </button>
              <button
                type="button"
                className={`${styles.analysisTab} ${activeAnalysisTab === "comments" ? styles.analysisTabActive : ""}`}
                onClick={() => handleAnalysisTabChange("comments")}
              >
                コメント分析
              </button>
            </div>
          ) : null}
        </div>

        <div className={styles.analysisPanelCard}>
          {!activeAnalysisCard || !activeAnalysisCard.result ? (
            <p className={styles.emptyText}>各動画カードの `台本分析` または `コメ分析` を押すと、ここに結果を表示します。</p>
          ) : activeAnalysisTab === "transcript" ? (
            activeAnalysisCard.transcriptAnalysisStatus === "pending" ? (
              <p className={styles.emptyText}>台本分析を実行しています。完了するとここに結果が表示されます。</p>
            ) : (
              renderTranscriptAnalysis(
                activeAnalysisCard.transcriptAnalysis,
                activeAnalysisCard.transcriptAnalysisError,
              )
            )
          ) : activeAnalysisCard.commentAnalysisStatus === "pending" ? (
            <p className={styles.emptyText}>コメント分析を実行しています。完了するとここに結果が表示されます。</p>
          ) : (
            renderCommentAnalysis(
              activeAnalysisCard.commentAnalysis,
              activeAnalysisCard.result.rawData.comments,
              activeAnalysisCard.commentAnalysisError,
            )
          )}
        </div>
      </section>
    </main>
  );
}
