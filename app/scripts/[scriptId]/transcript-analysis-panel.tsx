"use client";

import { useEffect, useState, useTransition } from "react";

import type { TranscriptAnalysis } from "../../../src/domain/youtube/transcript-analysis";
import { CopyContentButton } from "./copy-content-button";
import styles from "./page.module.css";

type TranscriptWorkspaceProps = {
  scriptId: string;
  originalText: string;
};

function getTranscriptAnalysisStorageKey(scriptId: string): string {
  return `script-viewer:transcript-analysis:${scriptId}`;
}

function buildTranscriptAnalysisCopyText(analysis: TranscriptAnalysis | null): string {
  if (!analysis) {
    return "";
  }

  const empathySection =
    analysis.empathyMoments.length > 0
      ? analysis.empathyMoments.map((item) => `- ${item}`).join("\n")
      : "- なし";
  const listSection = (title: string, values: string[]): string =>
    `${title}\n${values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- なし"}`;

  return [
    analysis.title,
    "",
    "動画の構成",
    analysis.flowStages
      .map(
        (stage, index) =>
          `${index + 1}. ${stage.stage}\n内容: ${stage.summary}\n視聴者心理: ${stage.viewerPsychology}`,
      )
      .join("\n\n"),
    "",
    "寄り添い発言",
    empathySection,
    "",
    `企画意図\n${analysis.creatorIntent}`,
    "",
    listSection("良い部分", analysis.viewerStrengths),
    "",
    listSection("改善が必要な部分", analysis.viewerImprovements),
    "",
    `総合評価 (${analysis.overallScore} / 5) ${analysis.overallVerdict}\n${analysis.overallEvaluation}`,
  ].join("\n");
}

function parseStoredAnalysis(value: string | null): TranscriptAnalysis | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<TranscriptAnalysis>;
    if (!Array.isArray(parsed.flowStages)) {
      return null;
    }

    return {
      title: typeof parsed.title === "string" && parsed.title.trim() ? parsed.title : "台本分析結果",
      flowStages: parsed.flowStages.filter(
        (item): item is TranscriptAnalysis["flowStages"][number] =>
          typeof item === "object" &&
          item !== null &&
          typeof item.stage === "string" &&
          typeof item.summary === "string" &&
          typeof item.viewerPsychology === "string",
      ),
      empathyMoments: Array.isArray(parsed.empathyMoments)
        ? parsed.empathyMoments.filter((item): item is string => typeof item === "string")
        : [],
      creatorIntent: typeof parsed.creatorIntent === "string" ? parsed.creatorIntent : "",
      viewerStrengths: Array.isArray(parsed.viewerStrengths)
        ? parsed.viewerStrengths.filter((item): item is string => typeof item === "string")
        : [],
      viewerImprovements: Array.isArray(parsed.viewerImprovements)
        ? parsed.viewerImprovements.filter((item): item is string => typeof item === "string")
        : [],
      overallScore: typeof parsed.overallScore === "number" ? parsed.overallScore : 3,
      overallVerdict: typeof parsed.overallVerdict === "string" ? parsed.overallVerdict : "判断保留",
      overallEvaluation: typeof parsed.overallEvaluation === "string" ? parsed.overallEvaluation : "",
    };
  } catch {
    return null;
  }
}

export function TranscriptWorkspace({
  scriptId,
  originalText,
}: TranscriptWorkspaceProps): React.JSX.Element {
  const [analysis, setAnalysis] = useState<TranscriptAnalysis | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setAnalysis(parseStoredAnalysis(window.localStorage.getItem(getTranscriptAnalysisStorageKey(scriptId))));
  }, [scriptId]);

  useEffect(() => {
    try {
      if (!analysis) {
        window.localStorage.removeItem(getTranscriptAnalysisStorageKey(scriptId));
        return;
      }

      window.localStorage.setItem(getTranscriptAnalysisStorageKey(scriptId), JSON.stringify(analysis));
    } catch {
      // ignore storage errors
    }
  }, [analysis, scriptId]);

  const handleAnalyze = () => {
    setErrorMessage("");

    startTransition(async () => {
      const response = await fetch(`/api/v1/scripts/${scriptId}/analyze`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => ({}))) as Partial<TranscriptAnalysis> & { error?: string };

      if (!response.ok) {
        setAnalysis(null);
        setErrorMessage(body.error || "台本分析に失敗しました。");
        return;
      }

      if (!Array.isArray(body.flowStages)) {
        setAnalysis(null);
        setErrorMessage("台本分析結果の形式が不正です。");
        return;
      }

      setAnalysis({
        title: typeof body.title === "string" && body.title.trim() ? body.title : "台本分析結果",
        flowStages: body.flowStages.filter(
          (item): item is TranscriptAnalysis["flowStages"][number] =>
            typeof item === "object" &&
            item !== null &&
            typeof item.stage === "string" &&
            typeof item.summary === "string" &&
            typeof item.viewerPsychology === "string",
        ),
        empathyMoments: Array.isArray(body.empathyMoments)
          ? body.empathyMoments.filter((item): item is string => typeof item === "string")
          : [],
        creatorIntent: typeof body.creatorIntent === "string" ? body.creatorIntent : "",
        viewerStrengths: Array.isArray(body.viewerStrengths)
          ? body.viewerStrengths.filter((item): item is string => typeof item === "string")
          : [],
        viewerImprovements: Array.isArray(body.viewerImprovements)
          ? body.viewerImprovements.filter((item): item is string => typeof item === "string")
          : [],
        overallScore: typeof body.overallScore === "number" ? body.overallScore : 3,
        overallVerdict: typeof body.overallVerdict === "string" ? body.overallVerdict : "判断保留",
        overallEvaluation: typeof body.overallEvaluation === "string" ? body.overallEvaluation : "",
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
            onClick={handleAnalyze}
            disabled={!originalText.trim() || isPending}
            className={styles.formatButton}
          >
            {isPending ? "分析中..." : "台本分析"}
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
              <p className={styles.formattedEyebrow}>企画と視聴者心理を整理</p>
              <h3 className={styles.transcriptCardTitle}>台本分析結果</h3>
            </div>
            {analysis ? (
              <CopyContentButton text={buildTranscriptAnalysisCopyText(analysis)} idleLabel="分析結果をコピー" />
            ) : null}
          </div>

          {errorMessage ? <p className={styles.formatError}>{errorMessage}</p> : null}

          {analysis ? (
            <div className={styles.formattedResult}>
              <div className={styles.analysisScoreCard}>
                <div>
                  <p className={styles.analysisScoreLabel}>総合評価</p>
                  <h4 className={styles.analysisScoreValue}>
                    {analysis.overallScore} / 5 <span>{analysis.overallVerdict}</span>
                  </h4>
                </div>
                <p className={styles.analysisScoreBody}>{analysis.overallEvaluation}</p>
              </div>

              <section className={styles.analysisBlock}>
                <h4>動画の流れと視聴者心理</h4>
                <div className={styles.formattedSectionList}>
                  {analysis.flowStages.map((stage, index) => (
                    <section key={`${stage.stage}-${index}`} className={styles.formattedSection}>
                      <h5>{stage.stage}</h5>
                      <p>{stage.summary}</p>
                      <p className={styles.analysisDetailLine}>
                        <strong>視聴者心理:</strong> {stage.viewerPsychology}
                      </p>
                    </section>
                  ))}
                </div>
              </section>

              <section className={styles.analysisBlock}>
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
              </section>

              <section className={styles.analysisBlock}>
                <h4>企画者から見た意図</h4>
                <p className={styles.analysisParagraph}>{analysis.creatorIntent}</p>
              </section>

              <section className={styles.analysisDualGrid}>
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
          ) : (
            <p className={styles.emptyText}>台本分析結果はまだ生成していません。</p>
          )}
        </section>
      </div>
    </>
  );
}
