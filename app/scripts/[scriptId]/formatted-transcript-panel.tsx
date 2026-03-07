"use client";

import { useState, useTransition } from "react";

import type { FormattedTranscript } from "../../../src/domain/youtube/transcript-format";
import { CopyContentButton } from "./copy-content-button";
import styles from "./page.module.css";

type TranscriptWorkspaceProps = {
  scriptId: string;
  originalText: string;
};

function buildFormattedCopyText(formatted: FormattedTranscript | null): string {
  if (!formatted) {
    return "";
  }

  return formatted.sections.map((section) => `## ${section.heading}\n${section.body}`).join("\n\n");
}

export function TranscriptWorkspace({
  scriptId,
  originalText,
}: TranscriptWorkspaceProps): React.JSX.Element {
  const [formatted, setFormatted] = useState<FormattedTranscript | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleFormat = () => {
    setErrorMessage("");

    startTransition(async () => {
      const response = await fetch(`/api/v1/scripts/${scriptId}/format`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as Partial<FormattedTranscript> & { error?: string };

      if (!response.ok) {
        setFormatted(null);
        setErrorMessage(body.error || "AI 校正に失敗しました。");
        return;
      }

      if (!Array.isArray(body.sections)) {
        setFormatted(null);
        setErrorMessage("AI 校正結果の形式が不正です。");
        return;
      }

      setFormatted({
        title: typeof body.title === "string" && body.title.trim() ? body.title : "AI校正結果",
        sections: body.sections,
      });
    });
  };

  return (
    <>
      <div className={styles.sectionHeader}>
        <h2>台本全文</h2>
        <div className={styles.sectionHeaderActions}>
          <span>{originalText ? "保存済み" : "未取得"}</span>
          <CopyContentButton text={originalText} idleLabel="台本をコピー" />
          <button
            type="button"
            onClick={handleFormat}
            disabled={!originalText.trim() || isPending}
            className={styles.formatButton}
          >
            {isPending ? "校正中..." : "AI校正"}
          </button>
        </div>
      </div>

      <div className={styles.transcriptGrid}>
        <section className={styles.transcriptCard}>
          <div className={styles.transcriptCardHeader}>
            <div>
              <p className={styles.formattedEyebrow}>元の保存内容</p>
              <h3 className={styles.transcriptCardTitle}>元の台本</h3>
            </div>
          </div>
          <pre className={styles.preformatted}>{originalText || "台本は保存されていません。"}</pre>
        </section>

        <section className={styles.transcriptCard}>
          <div className={styles.transcriptCardHeader}>
            <div>
              <p className={styles.formattedEyebrow}>見やすさを補助</p>
              <h3 className={styles.transcriptCardTitle}>AI校正結果</h3>
            </div>
            {formatted ? (
              <CopyContentButton text={buildFormattedCopyText(formatted)} idleLabel="校正結果をコピー" />
            ) : null}
          </div>

          <p className={styles.formattedNote}>
            元の保存内容は変えずに、見出し追加と話者切り替わり付近の改行だけを整えます。
          </p>

          {errorMessage ? <p className={styles.formatError}>{errorMessage}</p> : null}

          {formatted ? (
            <div className={styles.formattedResult}>
              <h4>{formatted.title}</h4>
              <div className={styles.formattedSectionList}>
                {formatted.sections.map((section, index) => (
                  <section key={`${section.heading}-${index}`} className={styles.formattedSection}>
                    <h5>{section.heading}</h5>
                    <p>{section.body}</p>
                  </section>
                ))}
              </div>
            </div>
          ) : (
            <p className={styles.emptyText}>AI校正結果はまだ生成していません。</p>
          )}
        </section>
      </div>
    </>
  );
}
