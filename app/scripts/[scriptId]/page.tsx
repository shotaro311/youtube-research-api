import Link from "next/link";
import { notFound } from "next/navigation";

import { readStoredScript } from "../../../src/server/google-sheets";
import { CopyContentButton } from "./copy-content-button";
import { TranscriptWorkspace } from "./formatted-transcript-panel";
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

type StoredComment = {
  author: string;
  text: string;
};

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

function parseStoredComments(value: string): StoredComment[] {
  if (!value) {
    return [];
  }

  const comments: StoredComment[] = [];
  let current: StoredComment | null = null;

  for (const rawLine of value.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const separatorIndex = line.indexOf(": ");
    if (separatorIndex > 0) {
      if (current) {
        comments.push(current);
      }

      current = {
        author: line.slice(0, separatorIndex),
        text: line.slice(separatorIndex + 2),
      };
      continue;
    }

    if (current) {
      current.text = `${current.text}\n${line}`.trim();
      continue;
    }

    current = {
      author: "投稿者不明",
      text: line,
    };
  }

  if (current) {
    comments.push(current);
  }

  return comments;
}

export default async function ScriptPage({ params, searchParams }: ScriptPageProps): Promise<React.JSX.Element> {
  const { scriptId } = await params;
  const { tab } = await searchParams;
  const script = await readStoredScript(scriptId);

  if (!script) {
    notFound();
  }

  const activeTab: ViewerTab = tab === "comments" ? "comments" : "transcript";
  const currentText = activeTab === "comments" ? script.comments : script.transcript;
  const currentTitle = activeTab === "comments" ? "コメント全文" : "台本全文";
  const comments = activeTab === "comments" ? parseStoredComments(script.comments) : [];

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
        <div className={styles.tabList}>
          <Link
            href={`/scripts/${script.scriptId}?tab=transcript`}
            className={`${styles.tabLink} ${activeTab === "transcript" ? styles.tabLinkActive : ""}`}
          >
            台本
          </Link>
          <Link
            href={`/scripts/${script.scriptId}?tab=comments`}
            className={`${styles.tabLink} ${activeTab === "comments" ? styles.tabLinkActive : ""}`}
          >
            コメント
          </Link>
        </div>

        {activeTab === "transcript" ? (
          <TranscriptWorkspace scriptId={script.scriptId} originalText={script.transcript} />
        ) : (
          <>
            <div className={styles.sectionHeader}>
              <h2>{currentTitle}</h2>
              <div className={styles.sectionHeaderActions}>
                <span>{comments.length > 0 ? `${comments.length}件` : currentText ? "保存済み" : "未取得"}</span>
                <CopyContentButton text={currentText} idleLabel="コメントをコピー" />
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
          </>
        )}
      </section>
    </main>
  );
}
