"use client";

import { useState, useTransition } from "react";

import type { CommentAnalysis, CommentSentiment } from "../../../src/domain/youtube/comment-analysis";
import type { StoredComment } from "../../../src/domain/youtube/stored-comment";
import { CopyContentButton } from "./copy-content-button";
import styles from "./page.module.css";

type CommentsWorkspaceProps = {
  scriptId: string;
  commentsText: string;
  comments: StoredComment[];
};

function getSentimentLabel(sentiment: CommentSentiment): string {
  if (sentiment === "positive") {
    return "ポジティブ";
  }

  if (sentiment === "negative") {
    return "ネガティブ";
  }

  return "中立";
}

function buildAnalysisCopyText(analysis: CommentAnalysis | null, comments: StoredComment[]): string {
  if (!analysis) {
    return "";
  }

  const themeSection = (label: string, values: string[]): string =>
    values.length > 0 ? `${label}\n${values.map((value) => `- ${value}`).join("\n")}` : `${label}\n- なし`;

  const commentSection = analysis.items
    .map((item) => {
      const comment = comments[item.commentIndex - 1];
      const author = comment?.author || "投稿者不明";
      const text = comment?.text || "";

      return [
        `コメント ${item.commentIndex}`,
        `投稿者: ${author}`,
        `原文: ${text}`,
        `感情: ${getSentimentLabel(item.sentiment)}`,
        `視聴者像: ${item.viewerType}`,
        `心理: ${item.psychology}`,
        `補足: ${item.note}`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    analysis.title,
    "",
    `総評: ${analysis.overview}`,
    `感情比率: ポジティブ ${analysis.positivePercent}% / 中立 ${analysis.neutralPercent}% / ネガティブ ${analysis.negativePercent}%`,
    `視聴者像: ${analysis.audienceSummary}`,
    `視聴者心理: ${analysis.psychologySummary}`,
    "",
    themeSection("ポジティブ傾向", analysis.positiveThemes),
    "",
    themeSection("ネガティブ傾向", analysis.negativeThemes),
    "",
    commentSection,
  ].join("\n");
}

export function CommentsWorkspace({
  scriptId,
  commentsText,
  comments,
}: CommentsWorkspaceProps): React.JSX.Element {
  const [analysis, setAnalysis] = useState<CommentAnalysis | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

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
        positiveThemes: Array.isArray(body.positiveThemes) ? body.positiveThemes.filter((item): item is string => typeof item === "string") : [],
        negativeThemes: Array.isArray(body.negativeThemes) ? body.negativeThemes.filter((item): item is string => typeof item === "string") : [],
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
    });
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

      <div className={styles.transcriptGrid}>
        <section className={styles.transcriptCard}>
          <div className={styles.transcriptCardHeader}>
            <div>
              <p className={styles.formattedEyebrow}>元の保存内容</p>
              <h3 className={styles.transcriptCardTitle}>元のコメント</h3>
            </div>
          </div>

          {comments.length > 0 ? (
            <div className={styles.commentList}>
              {comments.map((comment, index) => (
                <article key={`${comment.author}-${index}`} className={styles.commentCard}>
                  <p className={styles.commentAuthor}>{comment.author || "投稿者不明"}</p>
                  <p className={styles.commentText}>{comment.text}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.emptyText}>コメントは保存されていません。</p>
          )}
        </section>

        <section className={styles.transcriptCard}>
          <div className={styles.transcriptCardHeader}>
            <div>
              <p className={styles.formattedEyebrow}>視聴者反応を整理</p>
              <h3 className={styles.transcriptCardTitle}>コメント分析結果</h3>
            </div>
            {analysis ? (
              <CopyContentButton text={buildAnalysisCopyText(analysis, comments)} idleLabel="分析結果をコピー" />
            ) : null}
          </div>

          {errorMessage ? <p className={styles.formatError}>{errorMessage}</p> : null}

          {analysis ? (
            <div className={styles.analysisPanel}>
              <section className={styles.analysisSummaryCard}>
                <p className={styles.analysisSummaryTitle}>全体の総評</p>
                <p className={styles.analysisSummaryText}>{analysis.overview}</p>
              </section>

              <section className={styles.analysisRatioGrid}>
                <article className={styles.analysisRatioCard}>
                  <p>ポジティブ</p>
                  <strong>{analysis.positivePercent}%</strong>
                </article>
                <article className={styles.analysisRatioCard}>
                  <p>中立</p>
                  <strong>{analysis.neutralPercent}%</strong>
                </article>
                <article className={styles.analysisRatioCard}>
                  <p>ネガティブ</p>
                  <strong>{analysis.negativePercent}%</strong>
                </article>
              </section>

              <section className={styles.analysisInsightGrid}>
                <article className={styles.analysisInsightCard}>
                  <h4>視聴者像</h4>
                  <p>{analysis.audienceSummary}</p>
                </article>
                <article className={styles.analysisInsightCard}>
                  <h4>視聴者心理</h4>
                  <p>{analysis.psychologySummary}</p>
                </article>
              </section>

              <section className={styles.analysisThemeGrid}>
                <article className={styles.analysisThemeCard}>
                  <h4>ポジティブ傾向</h4>
                  <ul>
                    {analysis.positiveThemes.length > 0 ? (
                      analysis.positiveThemes.map((theme, index) => <li key={`${theme}-${index}`}>{theme}</li>)
                    ) : (
                      <li>目立つ傾向はまだありません。</li>
                    )}
                  </ul>
                </article>
                <article className={styles.analysisThemeCard}>
                  <h4>ネガティブ傾向</h4>
                  <ul>
                    {analysis.negativeThemes.length > 0 ? (
                      analysis.negativeThemes.map((theme, index) => <li key={`${theme}-${index}`}>{theme}</li>)
                    ) : (
                      <li>目立つ傾向はまだありません。</li>
                    )}
                  </ul>
                </article>
              </section>

              <section className={styles.analysisCommentList}>
                {analysis.items.map((item) => {
                  const comment = comments[item.commentIndex - 1];

                  return (
                    <article key={`analysis-${item.commentIndex}`} className={styles.analysisCommentCard}>
                      <div className={styles.analysisCommentHeader}>
                        <div>
                          <p className={styles.commentAuthor}>{comment?.author || "投稿者不明"}</p>
                          <p className={styles.analysisOriginalText}>{comment?.text || ""}</p>
                        </div>
                        <span className={`${styles.sentimentBadge} ${styles[`sentiment${item.sentiment}`]}`}>
                          {getSentimentLabel(item.sentiment)}
                        </span>
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
                          <dt>補足</dt>
                          <dd>{item.note}</dd>
                        </div>
                      </dl>
                    </article>
                  );
                })}
              </section>
            </div>
          ) : (
            <p className={styles.emptyText}>コメント分析結果はまだ生成していません。</p>
          )}
        </section>
      </div>
    </>
  );
}
