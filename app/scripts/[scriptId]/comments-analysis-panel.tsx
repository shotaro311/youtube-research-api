"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { CSSProperties } from "react";

import {
  normalizeCommentAnalysis,
  type CommentAnalysis,
  type CommentSentiment,
} from "../../../src/domain/youtube/comment-analysis";
import type { StoredComment } from "../../../src/domain/youtube/stored-comment";
import { CopyContentButton } from "./copy-content-button";
import styles from "./page.module.css";

type CommentsWorkspaceProps = {
  scriptId: string;
  commentsText: string;
  comments: StoredComment[];
  initialAnalysis?: CommentAnalysis | null;
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

function cloneAnalysis(value: CommentAnalysis): CommentAnalysis {
  return JSON.parse(JSON.stringify(value)) as CommentAnalysis;
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

function getFilterLabel(filter: CommentFilter): string {
  if (filter === "all") {
    return "すべて";
  }

  return getSentimentLabel(filter);
}

function parseThemeLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
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

function parseStoredState(value: string | null): PersistedCommentAnalysisState | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<PersistedCommentAnalysisState>;
    const analysis =
      parsed.analysis &&
      typeof parsed.analysis === "object" &&
      Array.isArray(parsed.analysis.items) &&
      Array.isArray(parsed.analysis.positiveThemes) &&
      Array.isArray(parsed.analysis.negativeThemes)
        ? normalizeCommentAnalysis(parsed.analysis)
        : null;

    return {
      analysis,
      isSummaryExpanded: parsed.isSummaryExpanded !== false,
      activeFilter:
        parsed.activeFilter === "positive" || parsed.activeFilter === "neutral" || parsed.activeFilter === "negative"
          ? parsed.activeFilter
          : "all",
    };
  } catch {
    return null;
  }
}

export function CommentsWorkspace({
  scriptId,
  commentsText,
  comments,
  initialAnalysis = null,
}: CommentsWorkspaceProps): React.JSX.Element {
  const commentListRef = useRef<HTMLElement | null>(null);
  const [analysis, setAnalysis] = useState<CommentAnalysis | null>(
    initialAnalysis ? normalizeCommentAnalysis(initialAnalysis) : null,
  );
  const [draftAnalysis, setDraftAnalysis] = useState<CommentAnalysis | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const [isGenerating, startGenerateTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const [activeFilter, setActiveFilter] = useState<CommentFilter>("all");
  const [isSummaryEditing, setIsSummaryEditing] = useState(false);
  const [editingCommentIndex, setEditingCommentIndex] = useState<number | null>(null);

  const showSaveMessage = (message: string) => {
    setSaveMessage(message);
    window.setTimeout(() => setSaveMessage(""), 1800);
  };

  useEffect(() => {
    const stored = parseStoredState(window.localStorage.getItem(getCommentAnalysisStorageKey(scriptId)));
    const normalizedInitialAnalysis = initialAnalysis ? normalizeCommentAnalysis(initialAnalysis) : null;

    setAnalysis(normalizedInitialAnalysis ?? stored?.analysis ?? null);
    setDraftAnalysis(null);
    setIsSummaryExpanded(stored?.isSummaryExpanded ?? true);
    setActiveFilter(stored?.activeFilter ?? "all");
  }, [initialAnalysis, scriptId]);

  const displayAnalysis = useMemo(
    () => (draftAnalysis ? normalizeCommentAnalysis(draftAnalysis) : analysis ? normalizeCommentAnalysis(analysis) : null),
    [analysis, draftAnalysis],
  );

  useEffect(() => {
    try {
      const payload: PersistedCommentAnalysisState = {
        analysis: displayAnalysis,
        isSummaryExpanded,
        activeFilter,
      };
      window.localStorage.setItem(getCommentAnalysisStorageKey(scriptId), JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }, [activeFilter, displayAnalysis, isSummaryExpanded, scriptId]);

  const applyFilter = (nextFilter: CommentFilter, shouldScroll = false) => {
    setActiveFilter(nextFilter);

    if (!shouldScroll) {
      return;
    }

    window.requestAnimationFrame(() => {
      commentListRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const persistAnalysis = async (nextAnalysis: CommentAnalysis) => {
    setIsSaving(true);
    setErrorMessage("");
    setSaveMessage("");
    try {
      const normalized = normalizeCommentAnalysis(nextAnalysis);
      const response = await fetch(`/api/v1/scripts/${scriptId}/comments/analyze`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(normalized),
      });
      const body = (await response.json().catch(() => ({}))) as Partial<CommentAnalysis> & { error?: string };

      if (!response.ok) {
        setErrorMessage(body.error || "コメント分析の保存に失敗しました。");
        return;
      }

      if (!Array.isArray(body.items)) {
        setErrorMessage("保存したコメント分析結果の形式が不正です。");
        return;
      }

      const savedAnalysis = normalizeCommentAnalysis({
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

      setAnalysis(savedAnalysis);
      setDraftAnalysis(null);
      setIsSummaryEditing(false);
      setEditingCommentIndex(null);
      showSaveMessage("保存しました");
    } catch {
      setErrorMessage("コメント分析の保存に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAnalyze = () => {
    setErrorMessage("");
    setSaveMessage("");

    startGenerateTransition(async () => {
      try {
        const response = await fetch(`/api/v1/scripts/${scriptId}/comments/analyze`, {
          method: "POST",
        });
        const body = (await response.json().catch(() => ({}))) as Partial<CommentAnalysis> & { error?: string };

        if (!response.ok) {
          setErrorMessage(body.error || "コメント分析に失敗しました。");
          return;
        }

        if (!Array.isArray(body.items)) {
          setErrorMessage("コメント分析結果の形式が不正です。");
          return;
        }

        setAnalysis(
          normalizeCommentAnalysis({
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
          }),
        );
        setDraftAnalysis(null);
        setIsSummaryExpanded(true);
        setActiveFilter("all");
        setIsSummaryEditing(false);
        setEditingCommentIndex(null);
      } catch {
        setErrorMessage("コメント分析に失敗しました。");
      }
    });
  };

  const handleDeleteAnalysis = async () => {
    if (!displayAnalysis) {
      return;
    }

    const shouldDelete = window.confirm("保存済みのコメント分析結果を削除します。よろしいですか？");
    if (!shouldDelete) {
      return;
    }

    setIsSaving(true);
    setErrorMessage("");
    setSaveMessage("");

    try {
      const response = await fetch(`/api/v1/scripts/${scriptId}/comments/analyze`, {
        method: "DELETE",
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setErrorMessage(body.error || "コメント分析の削除に失敗しました。");
        return;
      }

      setAnalysis(null);
      setDraftAnalysis(null);
      setIsSummaryEditing(false);
      setEditingCommentIndex(null);
      setActiveFilter("all");
      try {
        window.localStorage.removeItem(getCommentAnalysisStorageKey(scriptId));
      } catch {
        // ignore storage errors
      }
      showSaveMessage("分析結果を削除しました");
    } catch {
      setErrorMessage("コメント分析の削除に失敗しました。");
    } finally {
      setIsSaving(false);
    }
  };

  const startSummaryEdit = () => {
    if (!displayAnalysis) {
      return;
    }

    setDraftAnalysis(cloneAnalysis(displayAnalysis));
    setIsSummaryEditing(true);
    setEditingCommentIndex(null);
    setSaveMessage("");
  };

  const cancelSummaryEdit = () => {
    setDraftAnalysis(null);
    setIsSummaryEditing(false);
  };

  const updateDraftAnalysis = (updater: (current: CommentAnalysis) => CommentAnalysis) => {
    setDraftAnalysis((current) => {
      const base = current ? cloneAnalysis(current) : analysis ? cloneAnalysis(analysis) : null;
      return base ? updater(base) : base;
    });
  };

  const startCommentEdit = (commentIndex: number) => {
    if (!displayAnalysis) {
      return;
    }

    setDraftAnalysis(cloneAnalysis(displayAnalysis));
    setEditingCommentIndex(commentIndex);
    setIsSummaryEditing(false);
    setSaveMessage("");
  };

  const cancelCommentEdit = () => {
    setDraftAnalysis(null);
    setEditingCommentIndex(null);
  };

  const exportPayload = buildAnalysisExportPayload(displayAnalysis, comments);
  const filteredItems =
    displayAnalysis === null
      ? []
      : displayAnalysis.items.filter((item) => (activeFilter === "all" ? true : item.sentiment === activeFilter));
  const filterCounts = {
    all: displayAnalysis?.items.length ?? 0,
    positive: displayAnalysis?.items.filter((item) => item.sentiment === "positive").length ?? 0,
    neutral: displayAnalysis?.items.filter((item) => item.sentiment === "neutral").length ?? 0,
    negative: displayAnalysis?.items.filter((item) => item.sentiment === "negative").length ?? 0,
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
            disabled={!commentsText.trim() || isGenerating}
            className={styles.formatButton}
          >
            {isGenerating ? "分析中..." : "コメント分析"}
          </button>
        </div>
      </div>

      {errorMessage ? <p className={styles.formatError}>{errorMessage}</p> : null}
      {saveMessage ? <p className={styles.saveMessage}>{saveMessage}</p> : null}

      {displayAnalysis ? (
        <div className={styles.analysisPanel}>
          <section className={styles.analysisSummaryCard}>
            <div className={styles.analysisSummaryHeader}>
              <div>
                <p className={styles.formattedEyebrow}>視聴者反応を整理</p>
                <h3 className={styles.transcriptCardTitle}>コメント分析総評</h3>
              </div>
              <div className={styles.analysisSummaryActions}>
                <CopyContentButton text={buildAnalysisCopyText(displayAnalysis, comments)} idleLabel="分析一式をコピー" />
                <button
                  type="button"
                  onClick={() => downloadJsonFile(`comment-analysis-${scriptId}.json`, exportPayload)}
                  disabled={!exportPayload}
                  className={styles.copyButton}
                >
                  JSON保存
                </button>
                <button type="button" onClick={startSummaryEdit} className={styles.iconButton}>
                  編集
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteAnalysis()}
                  disabled={isSaving}
                  className={`${styles.iconButton} ${styles.dangerButton}`}
                >
                  削除
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
                  <div className={styles.editableCardHeader}>
                    <p className={styles.analysisSummaryTitle}>全体の総評</p>
                  </div>
                  {isSummaryEditing ? (
                    <textarea
                      className={styles.analysisTextarea}
                      value={draftAnalysis?.overview ?? ""}
                      onChange={(event) =>
                        updateDraftAnalysis((current) => ({
                          ...current,
                          overview: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <p className={styles.analysisSummaryText}>{displayAnalysis.overview}</p>
                  )}
                </section>

                <section className={styles.analysisRatioList}>
                  <button
                    type="button"
                    className={`${styles.analysisRatioCard} ${styles.analysisRatioPositive}`}
                    style={buildRatioCardStyle("90, 214, 142", displayAnalysis.positivePercent)}
                    onClick={() => applyFilter("positive", true)}
                  >
                    <span className={styles.analysisRatioLabelRow}>
                      <span className={`${styles.filterIcon} ${styles.filterIconPositive}`} aria-hidden="true" />
                      <span>ポジティブ</span>
                    </span>
                    <strong>{displayAnalysis.positivePercent}%</strong>
                    <span className={styles.analysisRatioMeta}>{filterCounts.positive}件を見る</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.analysisRatioCard} ${styles.analysisRatioNeutral}`}
                    style={buildRatioCardStyle("146, 178, 229", displayAnalysis.neutralPercent)}
                    onClick={() => applyFilter("neutral", true)}
                  >
                    <span className={styles.analysisRatioLabelRow}>
                      <span className={`${styles.filterIcon} ${styles.filterIconNeutral}`} aria-hidden="true" />
                      <span>中立</span>
                    </span>
                    <strong>{displayAnalysis.neutralPercent}%</strong>
                    <span className={styles.analysisRatioMeta}>{filterCounts.neutral}件を見る</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.analysisRatioCard} ${styles.analysisRatioNegative}`}
                    style={buildRatioCardStyle("255, 125, 125", displayAnalysis.negativePercent)}
                    onClick={() => applyFilter("negative", true)}
                  >
                    <span className={styles.analysisRatioLabelRow}>
                      <span className={`${styles.filterIcon} ${styles.filterIconNegative}`} aria-hidden="true" />
                      <span>ネガティブ</span>
                    </span>
                    <strong>{displayAnalysis.negativePercent}%</strong>
                    <span className={styles.analysisRatioMeta}>{filterCounts.negative}件を見る</span>
                  </button>
                </section>

                <section className={styles.analysisSectionCard}>
                  <div className={styles.editableCardHeader}>
                    <h4>視聴者像</h4>
                  </div>
                  {isSummaryEditing ? (
                    <textarea
                      className={styles.analysisTextarea}
                      value={draftAnalysis?.audienceSummary ?? ""}
                      onChange={(event) =>
                        updateDraftAnalysis((current) => ({
                          ...current,
                          audienceSummary: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <p>{displayAnalysis.audienceSummary}</p>
                  )}
                </section>

                <section className={styles.analysisSectionCard}>
                  <div className={styles.editableCardHeader}>
                    <h4>視聴者心理</h4>
                  </div>
                  {isSummaryEditing ? (
                    <textarea
                      className={styles.analysisTextarea}
                      value={draftAnalysis?.psychologySummary ?? ""}
                      onChange={(event) =>
                        updateDraftAnalysis((current) => ({
                          ...current,
                          psychologySummary: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <p>{displayAnalysis.psychologySummary}</p>
                  )}
                </section>

                <section className={styles.analysisSectionCard}>
                  <div className={styles.editableCardHeader}>
                    <h4>ポジティブ傾向</h4>
                  </div>
                  {isSummaryEditing ? (
                    <textarea
                      className={styles.analysisTextarea}
                      value={(draftAnalysis?.positiveThemes ?? []).join("\n")}
                      onChange={(event) =>
                        updateDraftAnalysis((current) => ({
                          ...current,
                          positiveThemes: parseThemeLines(event.target.value),
                        }))
                      }
                    />
                  ) : (
                    <ul className={styles.analysisBulletList}>
                      {displayAnalysis.positiveThemes.length > 0 ? (
                        displayAnalysis.positiveThemes.map((theme, index) => <li key={`${theme}-${index}`}>{theme}</li>)
                      ) : (
                        <li>目立つ傾向はまだありません。</li>
                      )}
                    </ul>
                  )}
                </section>

                <section className={styles.analysisSectionCard}>
                  <div className={styles.editableCardHeader}>
                    <h4>ネガティブ傾向</h4>
                  </div>
                  {isSummaryEditing ? (
                    <textarea
                      className={styles.analysisTextarea}
                      value={(draftAnalysis?.negativeThemes ?? []).join("\n")}
                      onChange={(event) =>
                        updateDraftAnalysis((current) => ({
                          ...current,
                          negativeThemes: parseThemeLines(event.target.value),
                        }))
                      }
                    />
                  ) : (
                    <ul className={styles.analysisBulletList}>
                      {displayAnalysis.negativeThemes.length > 0 ? (
                        displayAnalysis.negativeThemes.map((theme, index) => <li key={`${theme}-${index}`}>{theme}</li>)
                      ) : (
                        <li>目立つ傾向はまだありません。</li>
                      )}
                    </ul>
                  )}
                </section>

                {isSummaryEditing ? (
                  <div className={styles.editActionRow}>
                    <button
                      type="button"
                      onClick={() => {
                        if (draftAnalysis) {
                          void persistAnalysis(draftAnalysis);
                        }
                      }}
                      disabled={!draftAnalysis || isSaving}
                      className={styles.formatButton}
                    >
                      {isSaving ? "保存中..." : "保存"}
                    </button>
                    <button type="button" onClick={cancelSummaryEdit} className={styles.copyButton}>
                      キャンセル
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>

          <div className={styles.commentFilterBar}>
            <span className={styles.filterMeta}>並び順: 新着順</span>
            <div className={styles.filterChipGroup}>
              <button
                type="button"
                onClick={() => applyFilter("all", true)}
                className={`${styles.filterChip} ${activeFilter === "all" ? styles.filterChipActive : ""}`}
                aria-label="すべてのコメントへ切り替え"
              >
                <span className={`${styles.filterIcon} ${styles.filterIconAll}`} aria-hidden="true" />
                <span className={styles.filterChipText}>
                  {getFilterLabel("all")} {filterCounts.all}
                </span>
              </button>
              <button
                type="button"
                onClick={() => applyFilter("positive", true)}
                className={`${styles.filterChip} ${activeFilter === "positive" ? styles.filterChipActive : ""}`}
                aria-label="ポジティブのコメントへ切り替え"
              >
                <span className={`${styles.filterIcon} ${styles.filterIconPositive}`} aria-hidden="true" />
                <span className={styles.filterChipText}>
                  {getFilterLabel("positive")} {filterCounts.positive}
                </span>
              </button>
              <button
                type="button"
                onClick={() => applyFilter("neutral", true)}
                className={`${styles.filterChip} ${activeFilter === "neutral" ? styles.filterChipActive : ""}`}
                aria-label="中立のコメントへ切り替え"
              >
                <span className={`${styles.filterIcon} ${styles.filterIconNeutral}`} aria-hidden="true" />
                <span className={styles.filterChipText}>
                  {getFilterLabel("neutral")} {filterCounts.neutral}
                </span>
              </button>
              <button
                type="button"
                onClick={() => applyFilter("negative", true)}
                className={`${styles.filterChip} ${activeFilter === "negative" ? styles.filterChipActive : ""}`}
                aria-label="ネガティブのコメントへ切り替え"
              >
                <span className={`${styles.filterIcon} ${styles.filterIconNegative}`} aria-hidden="true" />
                <span className={styles.filterChipText}>
                  {getFilterLabel("negative")} {filterCounts.negative}
                </span>
              </button>
            </div>
          </div>

          <section ref={commentListRef} className={styles.analysisCommentList}>
            {filteredItems.map((item) => {
              const comment = comments[item.commentIndex - 1];
              const isEditingThis = editingCommentIndex === item.commentIndex && draftAnalysis !== null;
              const editingItem = isEditingThis
                ? draftAnalysis.items.find((candidate) => candidate.commentIndex === item.commentIndex) ?? item
                : item;

              return (
                <article key={`analysis-${item.commentIndex}`} className={styles.analysisCommentCard}>
                  <div className={styles.analysisCommentHeader}>
                    <p className={styles.commentAuthor}>{comment?.author || "投稿者不明"}</p>
                    <div className={styles.analysisCommentActions}>
                      <span className={`${styles.sentimentBadge} ${styles[`sentiment${editingItem.sentiment}`]}`}>
                        {getSentimentLabel(editingItem.sentiment)}
                      </span>
                      <button
                        type="button"
                        onClick={() => startCommentEdit(item.commentIndex)}
                        className={styles.iconButton}
                      >
                        編集
                      </button>
                    </div>
                  </div>

                  <div className={styles.commentBodyBlock}>
                    <p className={styles.commentBodyLabel}>コメント本文</p>
                    <p className={styles.commentTextStrong}>{comment?.text || ""}</p>
                  </div>

                  {isEditingThis ? (
                    <div className={styles.analysisEditForm}>
                      <label className={styles.analysisField}>
                        <span>感情タグ</span>
                        <select
                          className={styles.analysisSelect}
                          value={editingItem.sentiment}
                          onChange={(event) =>
                            updateDraftAnalysis((current) => ({
                              ...current,
                              items: current.items.map((candidate) =>
                                candidate.commentIndex === item.commentIndex
                                  ? {
                                      ...candidate,
                                      sentiment: event.target.value as CommentSentiment,
                                    }
                                  : candidate,
                              ),
                            }))
                          }
                        >
                          <option value="positive">ポジティブ</option>
                          <option value="neutral">中立</option>
                          <option value="negative">ネガティブ</option>
                        </select>
                      </label>
                      <label className={styles.analysisField}>
                        <span>視聴者像</span>
                        <textarea
                          className={styles.analysisTextarea}
                          value={editingItem.viewerType}
                          onChange={(event) =>
                            updateDraftAnalysis((current) => ({
                              ...current,
                              items: current.items.map((candidate) =>
                                candidate.commentIndex === item.commentIndex
                                  ? {
                                      ...candidate,
                                      viewerType: event.target.value,
                                    }
                                  : candidate,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label className={styles.analysisField}>
                        <span>心理</span>
                        <textarea
                          className={styles.analysisTextarea}
                          value={editingItem.psychology}
                          onChange={(event) =>
                            updateDraftAnalysis((current) => ({
                              ...current,
                              items: current.items.map((candidate) =>
                                candidate.commentIndex === item.commentIndex
                                  ? {
                                      ...candidate,
                                      psychology: event.target.value,
                                    }
                                  : candidate,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label className={styles.analysisField}>
                        <span>個別フィードバック</span>
                        <textarea
                          className={styles.analysisTextarea}
                          value={editingItem.note}
                          onChange={(event) =>
                            updateDraftAnalysis((current) => ({
                              ...current,
                              items: current.items.map((candidate) =>
                                candidate.commentIndex === item.commentIndex
                                  ? {
                                      ...candidate,
                                      note: event.target.value,
                                    }
                                  : candidate,
                              ),
                            }))
                          }
                        />
                      </label>
                      <div className={styles.editActionRow}>
                        <button
                          type="button"
                          onClick={() => {
                            if (draftAnalysis) {
                              void persistAnalysis(draftAnalysis);
                            }
                          }}
                          disabled={!draftAnalysis || isSaving}
                          className={styles.formatButton}
                        >
                          {isSaving ? "保存中..." : "保存"}
                        </button>
                        <button type="button" onClick={cancelCommentEdit} className={styles.copyButton}>
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
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
                  )}
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
