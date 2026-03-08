export type StoredComment = {
  author: string;
  text: string;
};

export function parseStoredComments(value: string): StoredComment[] {
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
