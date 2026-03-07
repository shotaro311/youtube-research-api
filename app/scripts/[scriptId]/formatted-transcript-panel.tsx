"use client";

import { useState, useTransition } from "react";

import type { FormattedTranscript } from "../../../src/domain/youtube/transcript-format";
import styles from "./page.module.css";

type FormattedTranscriptPanelProps = {
  scriptId: string;
};

export function FormattedTranscriptPanel({
  scriptId,
}: FormattedTranscriptPanelProps): React.JSX.Element {
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
        setErrorMessage(body.error || "Gemini 整形に失敗しました。");
        return;
      }

      if (!Array.isArray(body.sections)) {
        setFormatted(null);
        setErrorMessage("Gemini 整形結果の形式が不正です。");
        return;
      }

      setFormatted({
        title: typeof body.title === "string" && body.title.trim() ? body.title : "Gemini整形版",
        sections: body.sections,
      });
    });
  };

  return (
    <section className={styles.formattedPanel}>
      <div className={styles.formattedHeader}>
        <div>
          <p className={styles.formattedEyebrow}>見やすさを補助</p>
          <h3>Gemini整形版</h3>
        </div>
        <button type="button" onClick={handleFormat} disabled={isPending} className={styles.formatButton}>
          {isPending ? "整形中..." : "Geminiで整形"}
        </button>
      </div>

      <p className={styles.formattedNote}>元の保存内容は変えずに、区切りや見出しだけを整えます。</p>

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
      ) : null}
    </section>
  );
}
