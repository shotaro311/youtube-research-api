"use client";

import { useEffect, useState, useTransition } from "react";
import type { CSSProperties } from "react";

import type { CommentAnalysis, CommentSentiment } from "../../../src/domain/youtube/comment-analysis";
import type { StoredComment } from "../../../src/domain/youtube/stored-comment";
import { CopyContentButton } from "./copy-content-button";
import styles from "./page.module.css";

type CommentsWorkspaceProps = {
  scriptId: string;
  commentsText: string;
  comments: StoredComment[];
};

type CommentAnalysisExportPayload = {
  title: string;
  overview: string;
  sentimentRatio: {
    positive: number;
    neutral: number;
    negative: number;
  };
  audienceSummary: string;
  psychologySummary: string;
  positiveThemes: string[];
  negativeThemes: string[];
  comments: Array<{
    commentIndex: number;
    author: string;
    text: string;
    sentiment: string;
    viewerType: string;
    psychology: string;
    feedback: string;
  }>;
};

type CommentFilter = "all" | CommentSentiment;

type PersistedCommentAnalysisState = {
  analysis: CommentAnalysis | null;
  isSummaryExpanded: boolean;
  activeFilter: CommentFilter;
};

function getCommentAnalysisStorageKey(scriptId: string): string {
  return `script-viewer:comment-analysis:${scriptId}`;
}

function getSentimentLabel(sentiment: CommentSentiment): string {
  if (sentiment === "positive") {
    return "ポジティブ";
  }

  if (sentiment === "negative") {
    return "ネガティブ";
  }

  return "中立";
}

function buildRatioCardStyle(rgb: string, value: number): CSSProperties {
  const clamped = Math.max(0, Math.min(100, value));
  const strong = 0.2 + clamped / 220;
  const soft = 0.12 + clamped / 360;

  return {
    background: `linear-gradient(180deg, rgba(${rgb}, ${strong}) 0%, rgba(${rgb}, ${soft}) 100%)`,
    borderColor: `rgba(${rgb}, ${Math.min(strong + 0.18, 0.72)})`,
    boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 10px 22px rgba(${rgb}, 0.08)`,
  };
}

function buildAnalysisExportPayload(
  analysis: CommentAnalysis | null,
  comments: StoredComment[],
): CommentAnalysisExportPayload | null {
  if (!analysis) {
    return null;
  }

  return {
    title: analysis.title,
    overview: analysis.overview,
    sentimentRatio: {
      positive: analysis.positivePercent,
      neutral: analysis.neutralPercent,
      negative: analysis.negativePercent,
    },
    audienceSummary: analysis.audienceSummary,
    psychologySummary: analysis.psychologySummary,
    positiveThemes: analysis.positiveThemes,
    negativeThemes: analysis.negativeThemes,
    comments: analysis.items.map((item) => {
      const comment = comments[item.commentIndex - 1];

      return {
        commentIndex: item.commentIndex,
        author: comment?.author || "投稿者不明",
        text: comment?.text || "",
        sentiment: getSentimentLabel(item.sentiment),
        viewerType: item.viewerType,
        psychology: item.psychology,
        feedback: item.note,
      };
    }),
  };
}

function buildAnalysisCopyText(analysis: CommentAnalysis | null, comments: StoredComment[]): string {
  const payload = buildAnalysisExportPayload(analysis, comments);
  if (!payload) {
    return "";
  }

  const themeSection = (label: string, values: string[]): string =>
    values.length > 0 ? `${label}\n${values.map((value) => `- ${value}`).join("\n")}` : `${label}\n- なし`;

  const commentSection = payload.comments
    .map((item) =>
      [
        `コメント ${item.commentIndex}`,
        `投稿者: ${item.author}`,
        `コメント本文: ${item.text}`,
        `感情: ${item.sentiment}`,
        `視聴者像: ${item.viewerType}`,
        `心理: ${item.psychology}`,
        `個別フィードバック: ${item.feedback}`,
      ].join("\n"),
    )
    .join("\n\n");

  return [
    payload.title,
    "",
    `総評: ${payload.overview}`,
    `感情比率: ポジティブ ${payload.sentimentRatio.positive}% / 中立 ${payload.sentimentRatio.neutral}% / ネガティブ ${payload.sentimentRatio.negative}%`,
    `視聴者像: ${payload.audienceSummary}`,
    `視聴者心理: ${payload.psychologySummary}`,
    "",
    themeSection("ポジティブ傾向", payload.positiveThemes),
    "",
    themeSection("ネガティブ傾向", payload.negativeThemes),
    "",
    commentSection,
  ].join("\n");
}

function downloadJsonFile(fileName: string, payload: CommentAnalysisExportPayload | null): void {
  if (!payload) {
    return;
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(blobUrl);
}

export function CommentsWorkspace({
  scriptId,
  commentsText,
  comments,
}: CommentsWorkspaceProps): React.JSX.Element {
  const [analysis, setAnalysis] = useState<CommentAnalysis | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [activeFilter, setActiveFilter] = useState<CommentFilter>("all");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(getCommentAnalysisStorageKey(scriptId));
      if (!stored) {
        setAnalysis(null);
        setIsSummaryExpanded(true);
        setActiveFilter("all");
        return;
      }

      const parsed = JSON.parse(stored) as Partial<PersistedCommentAnalysisState>;
      const nextAnalysis =
        parsed.analysis &&
        typeof parsed.analysis === "object" &&
        Array.isArray(parsed.analysis.items) &&
        Array.isArray(parsed.analysis.positiveThemes) &&
        Array.isArray(parsed.analysis.negativeThemes)
          ? parsed.analysis
          : null;

      setAnalysis(nextAnalysis);
      setIsSummaryExpanded(parsed.isSummaryExpanded !== false);
      setActiveFilter(
        parsed.activeFilter === "positive" || parsed.activeFilter === "neutral" || parsed.activeFilter === "negative"
          ? parsed.activeFilter
          : "all",
      );
    } catch {
      setAnalysis(null);
      setIsSummaryExpanded(true);
      setActiveFilter("all");
    }
  }, [scriptId]);

  useEffect(() => {
    try {
      const payload: PersistedCommentAnalysisState = {
        analysis,
        isSummaryExpanded,
        activeFilter,
      };
      window.localStorage.setItem(getCommentAnalysisStorageKey(scriptId), JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }, [activeFilter, analysis, isSummaryExpanded, scriptId]);

  const handleAnalyze = () => {
    setErrorMessage("");

    startTransition(async () => {
      const response = await fetch(`/api/v1/scripts/${scriptId}/comments/analyze`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as Partial<CommentAnalysis> & { error?: string };

      if (!response.ok) {
        setAnalysis(null);
        setErrorMessage(body.error || "コメント分析に失敗しました。");
        return;
      }

      if (!Array.isArray(body.items)) {
        setAnalysis(null);
        setErrorMessage("コメント分析結果の形式が不正です。");
        return;
      }

      setAnalysis({
        title: typeof body.title === "string" && body.title.trim() ? body.title : "コメント分析結果",
        overview: typeof body.overview === "string" ? body.overview : "",
        positivePercent: typeof body.positivePercent === "number" ? body.positivePercent : 0,
        neutralPercent: typeof body.neutralPercent === "number" ? body.neutralPercent : 0,
        negativePercent: typeof body.negativePercent === "number" ? body.negativePercent : 0,
        audienceSummary: typeof body.audienceSummary === "string" ? body.audienceSummary : "",
        psychologySummary: typeof body.psychologySummary === "string" ? body.psychologySummary : "",
        positiveThemes: Array.isArray(body.positiveThemes)
          ? body.positiveThemes.filter((item): item is string => typeof item === "string")
          : [],
        negativeThemes: Array.isArray(body.negativeThemes)
          ? body.negativeThemes.filter((item): item is string => typeof item === "string")
          : [],
        items: body.items.filter(
          (
            item,
          ): item is CommentAnalysis["items"][number] =>
            typeof item === "object" &&
            item !== null &&
            typeof item.commentIndex === "number" &&
            (item.sentiment === "positive" || item.sentiment === "neutral" || item.sentiment === "negative") &&
            typeof item.viewerType === "string" &&
            typeof item.psychology === "string" &&
            typeof item.note === "string",
        ),
      });
      setIsSummaryExpanded(true);
      setActiveFilter("all");
    });
  };

  const exportPayload = buildAnalysisExportPayload(analysis, comments);
  const filteredItems =
    analysis === null
      ? []
      : analysis.items.filter((item) => (activeFilter === "all" ? true : item.sentiment === activeFilter));
  const filterCounts = {
    all: analysis?.items.length ?? 0,
    positive: analysis?.items.filter((item) => item.sentiment === "positive").length ?? 0,
    neutral: analysis?.items.filter((item) => item.sentiment === "neutral").length ?? 0,
    negative: analysis?.items.filter((item) => item.sentiment === "negative").length ?? 0,
  };

  return (
    <>
      <div className={styles.sectionHeader}>
        <h2>コメント全文</h2>
        <div className={styles.sectionHeaderActions}>
          <span>{comments.length > 0 ? `${comments.length}件` : commentsText ? "保存済み" : "未取得"}</span>
          <CopyContentButton text={commentsText} idleLabel="コメントをコピー" />
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!commentsText.trim() || isPending}
            className={styles.formatButton}
          >
            {isPending ? "分析中..." : "コメント分析"}
          </button>
        </div>
      </div>

      {errorMessage ? <p className={styles.formatError}>{errorMessage}</p> : null}

      {analysis ? (
        <div className={styles.analysisPanel}>
          <section className={styles.analysisSummaryCard}>
            <div className={styles.analysisSummaryHeader}>
              <div>
                <p className={styles.formattedEyebrow}>視聴者反応を整理</p>
                <h3 className={styles.transcriptCardTitle}>コメント分析総評</h3>
              </div>
              <div className={styles.analysisSummaryActions}>
                <CopyContentButton text={buildAnalysisCopyText(analysis, comments)} idleLabel="分析一式をコピー" />
                <button
                  type="button"
                  onClick={() => downloadJsonFile(`comment-analysis-${scriptId}.json`, exportPayload)}
                  disabled={!exportPayload}
                  className={styles.copyButton}
                >
                  JSON保存
                </button>
                <button
                  type="button"
                  onClick={() => setIsSummaryExpanded((current) => !current)}
                  className={styles.copyButton}
                >
                  {isSummaryExpanded ? "▼ 総評を隠す" : "▶ 総評を表示"}
                </button>
              </div>
            </div>

            {isSummaryExpanded ? (
              <div className={styles.analysisSummaryStack}>
                <section className={styles.analysisSectionCard}>
                  <p className={styles.analysisSummaryTitle}>全体の総評</p>
                  <p className={styles.analysisSummaryText}>{analysis.overview}</p>
                </section>

                <section className={styles.analysisRatioList}>
                  <article
                    className={`${styles.analysisRatioCard} ${styles.analysisRatioPositive}`}
                    style={buildRatioCardStyle("90, 214, 142", analysis.positivePercent)}
                  >
                    <p>ポジティブ</p>
                    <strong>{analysis.positivePercent}%</strong>
                  </article>
                  <article
                    className={`${styles.analysisRatioCard} ${styles.analysisRatioNeutral}`}
                    style={buildRatioCardStyle("146, 178, 229", analysis.neutralPercent)}
                  >
                    <p>中立</p>
                    <strong>{analysis.neutralPercent}%</strong>
                  </article>
                  <article
                    className={`${styles.analysisRatioCard} ${styles.analysisRatioNegative}`}
                    style={buildRatioCardStyle("255, 125, 125", analysis.negativePercent)}
                  >
                    <p>ネガティブ</p>
                    <strong>{analysis.negativePercent}%</strong>
                  </article>
                </section>

                <section className={styles.analysisSectionCard}>
                  <h4>視聴者像</h4>
                  <p>{analysis.audienceSummary}</p>
                </section>

                <section className={styles.analysisSectionCard}>
                  <h4>視聴者心理</h4>
                  <p>{analysis.psychologySummary}</p>
                </section>

                <section className={styles.analysisSectionCard}>
                  <h4>ポジティブ傾向</h4>
                  <ul className={styles.analysisBulletList}>
                    {analysis.positiveThemes.length > 0 ? (
                      analysis.positiveThemes.map((theme, index) => <li key={`${theme}-${index}`}>{theme}</li>)
                    ) : (
                      <li>目立つ傾向はまだありません。</li>
                    )}
                  </ul>
                </section>

                <section className={styles.analysisSectionCard}>
                  <h4>ネガティブ傾向</h4>
                  <ul className={styles.analysisBulletList}>
                    {analysis.negativeThemes.length > 0 ? (
                      analysis.negativeThemes.map((theme, index) => <li key={`${theme}-${index}`}>{theme}</li>)
                    ) : (
                      <li>目立つ傾向はまだありません。</li>
                    )}
                  </ul>
                </section>
              </div>
            ) : null}
          </section>

          <div className={styles.commentFilterBar}>
            <span className={styles.filterMeta}>並び順: 新着順</span>
            <div className={styles.filterChipGroup}>
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                className={`${styles.filterChip} ${activeFilter === "all" ? styles.filterChipActive : ""}`}
              >
                すべて {filterCounts.all}
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter("positive")}
                className={`${styles.filterChip} ${activeFilter === "positive" ? styles.filterChipActive : ""}`}
              >
                ポジティブ {filterCounts.positive}
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter("neutral")}
                className={`${styles.filterChip} ${activeFilter === "neutral" ? styles.filterChipActive : ""}`}
              >
                中立 {filterCounts.neutral}
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter("negative")}
                className={`${styles.filterChip} ${activeFilter === "negative" ? styles.filterChipActive : ""}`}
              >
                ネガティブ {filterCounts.negative}
              </button>
            </div>
          </div>

          <section className={styles.analysisCommentList}>
            {filteredItems.map((item) => {
              const comment = comments[item.commentIndex - 1];

              return (
                <article key={`analysis-${item.commentIndex}`} className={styles.analysisCommentCard}>
                  <div className={styles.analysisCommentHeader}>
                    <p className={styles.commentAuthor}>{comment?.author || "投稿者不明"}</p>
                    <span className={`${styles.sentimentBadge} ${styles[`sentiment${item.sentiment}`]}`}>
                      {getSentimentLabel(item.sentiment)}
                    </span>
                  </div>

                  <div className={styles.commentBodyBlock}>
                    <p className={styles.commentBodyLabel}>コメント本文</p>
                    <p className={styles.commentTextStrong}>{comment?.text || ""}</p>
                  </div>

                  <dl className={styles.analysisDetailList}>
                    <div>
                      <dt>視聴者像</dt>
                      <dd>{item.viewerType}</dd>
                    </div>
                    <div>
                      <dt>心理</dt>
                      <dd>{item.psychology}</dd>
                    </div>
                    <div>
                      <dt>個別フィードバック</dt>
                      <dd>{item.note}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
            {filteredItems.length === 0 ? (
              <p className={styles.emptyText}>この条件に一致するコメントはありません。</p>
            ) : null}
          </section>
        </div>
      ) : comments.length > 0 ? (
        <div className={styles.commentList}>
          {comments.map((comment, index) => (
            <article key={`${comment.author}-${index}`} className={styles.commentCard}>
              <p className={styles.commentAuthor}>{comment.author || "投稿者不明"}</p>
              <div className={styles.commentBodyBlock}>
                <p className={styles.commentBodyLabel}>コメント本文</p>
                <p className={styles.commentTextStrong}>{comment.text}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className={styles.emptyText}>コメントは保存されていません。</p>
      )}
    </>
  );
}
