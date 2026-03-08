"use client";

import { useEffect, useState } from "react";
import type React from "react";

import type { CommentAnalysis } from "../../../src/domain/youtube/comment-analysis";
import type { StoredComment } from "../../../src/domain/youtube/stored-comment";
import { CommentsWorkspace } from "./comments-analysis-panel";
import { TranscriptWorkspace } from "./formatted-transcript-panel";
import styles from "./page.module.css";

type ViewerTab = "transcript" | "comments";

type ScriptViewerTabsProps = {
  scriptId: string;
  transcript: string;
  commentsText: string;
  comments: StoredComment[];
  initialCommentAnalysis?: CommentAnalysis | null;
  initialTab: ViewerTab;
};

function buildTabUrl(pathname: string, tab: ViewerTab): string {
  return tab === "comments" ? `${pathname}?tab=comments` : pathname;
}

export function ScriptViewerTabs({
  scriptId,
  transcript,
  commentsText,
  comments,
  initialCommentAnalysis = null,
  initialTab,
}: ScriptViewerTabsProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<ViewerTab>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleTabChange = (nextTab: ViewerTab) => {
    setActiveTab(nextTab);

    if (typeof window === "undefined") {
      return;
    }

    const nextUrl = buildTabUrl(window.location.pathname, nextTab);
    window.history.replaceState(null, "", nextUrl);
  };

  return (
    <>
      <div className={styles.tabList}>
        <button
          type="button"
          onClick={() => handleTabChange("transcript")}
          className={`${styles.tabLink} ${activeTab === "transcript" ? styles.tabLinkActive : ""}`}
        >
          台本
        </button>
        <button
          type="button"
          onClick={() => handleTabChange("comments")}
          className={`${styles.tabLink} ${activeTab === "comments" ? styles.tabLinkActive : ""}`}
        >
          コメント
        </button>
      </div>

      <div className={activeTab === "transcript" ? styles.tabPanelActive : styles.tabPanelHidden}>
        <TranscriptWorkspace scriptId={scriptId} originalText={transcript} />
      </div>

      <div className={activeTab === "comments" ? styles.tabPanelActive : styles.tabPanelHidden}>
        <CommentsWorkspace
          scriptId={scriptId}
          commentsText={commentsText}
          comments={comments}
          initialAnalysis={initialCommentAnalysis}
        />
      </div>
    </>
  );
}
