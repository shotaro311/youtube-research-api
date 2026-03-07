"use client";

import { useState } from "react";

import styles from "./page.module.css";

type CopyContentButtonProps = {
  text: string;
  idleLabel: string;
};

export function CopyContentButton({ text, idleLabel }: CopyContentButtonProps): React.JSX.Element {
  const [status, setStatus] = useState<"idle" | "done" | "error">("idle");

  const handleCopy = async () => {
    if (!text.trim()) {
      setStatus("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setStatus("done");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch {
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 1800);
    }
  };

  const label =
    status === "done" ? "コピーしました" : status === "error" ? "コピー失敗" : idleLabel;

  return (
    <button type="button" onClick={handleCopy} disabled={!text.trim()} className={styles.copyButton}>
      {label}
    </button>
  );
}
