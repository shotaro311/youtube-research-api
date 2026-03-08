import Link from "next/link";
import { notFound } from "next/navigation";

import { parseStoredComments } from "../../../src/domain/youtube/stored-comment";
import { readStoredScript } from "../../../src/server/google-sheets";
import { ScriptViewerTabs } from "./script-viewer-tabs";
import styles from "./page.module.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScriptPageProps = {
  params: Promise<{
    scriptId: string;
  }>;
  searchParams: Promise<{
    tab?: string;
  }>;
};

type ViewerTab = "transcript" | "comments";

function formatPublishedAt(value?: string): string {
  if (!value) {
    return "未取得";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ja-JP");
}

function formatCount(value?: number): string {
  return typeof value === "number" ? new Intl.NumberFormat("ja-JP").format(value) : "未取得";
}

export default async function ScriptPage({ params, searchParams }: ScriptPageProps): Promise<React.JSX.Element> {
  const { scriptId } = await params;
  const { tab } = await searchParams;
  const script = await readStoredScript(scriptId);

  if (!script) {
    notFound();
  }

  const activeTab: ViewerTab = tab === "comments" ? "comments" : "transcript";
  const comments = parseStoredComments(script.comments);

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>台本ビューア</p>
          <h1>{script.title || "タイトル未取得"}</h1>
          <p className={styles.metaLine}>
            {script.channelName || "チャンネル未取得"} / 投稿日 {formatPublishedAt(script.publishedAt)} / 再生数{" "}
            {formatCount(script.views)}
          </p>
        </div>
        <div className={styles.actions}>
          <Link href={script.url} target="_blank" rel="noreferrer" className={styles.primaryLink}>
            動画を開く
          </Link>
          <a href={`/api/v1/scripts/${script.scriptId}`} className={styles.secondaryLink}>
            JSONをダウンロード
          </a>
          <span className={styles.scriptId}>scriptId: {script.scriptId}</span>
        </div>
      </div>

      <section className={styles.summaryCard}>
        <div className={styles.summaryLayout}>
          {script.thumbnailUrl ? (
            <a
              href={script.thumbnailUrl}
              target="_blank"
              rel="noreferrer"
              className={styles.thumbnailLink}
              title="クリックで拡大表示"
            >
              <div className={styles.thumbnailFrame}>
                <img src={script.thumbnailUrl} alt={`${script.title || "動画"} のサムネイル`} className={styles.thumbnail} />
              </div>
              <span className={styles.thumbnailHint}>クリックで拡大表示</span>
            </a>
          ) : null}

          <dl className={styles.summaryGrid}>
            <div>
              <dt>動画URL</dt>
              <dd>{script.url || "未取得"}</dd>
            </div>
            <div>
              <dt>登録者数</dt>
              <dd>{formatCount(script.subscribers)}</dd>
            </div>
            <div>
              <dt>保存日時</dt>
              <dd>{formatPublishedAt(script.createdAt)}</dd>
            </div>
            <div>
              <dt>動画ID</dt>
              <dd>{script.videoId || "未取得"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className={styles.contentCard}>
        <ScriptViewerTabs
          scriptId={script.scriptId}
          transcript={script.transcript}
          commentsText={script.comments}
          comments={comments}
          initialCommentAnalysis={script.commentAnalysis ?? null}
          initialTab={activeTab}
        />
      </section>
    </main>
  );
}
