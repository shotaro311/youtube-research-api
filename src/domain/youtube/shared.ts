export const LANGUAGE_PREFERENCE = ["ja", "ja-JP", "ja-Hans", "ja-Hant", "en", "en-US"];

export function secondsToIsoDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const hPart = hours > 0 ? `${hours}H` : "";
  const mPart = minutes > 0 ? `${minutes}M` : "";
  const sPart = `${secs}S`;

  return `PT${hPart}${mPart}${sPart}`;
}

export function parseDurationToSeconds(duration: string | number | undefined): number {
  if (typeof duration === "number") return duration;
  if (!duration) return 0;
  if (/^PT/i.test(duration)) {
    const match = duration.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
    if (!match) return 0;
    const hours = Number(match[1] || "0");
    const minutes = Number(match[2] || "0");
    const seconds = Number(match[3] || "0");
    return hours * 3600 + minutes * 60 + seconds;
  }

  const parts = duration.split(":").map((part) => Number(part));
  if (parts.some((value) => Number.isNaN(value))) return 0;
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }
  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }
  if (parts.length === 1) return parts[0];
  return 0;
}

export function formatTranscriptTime(startSeconds: number): string {
  const totalSeconds = Math.floor(startSeconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function normalizeYouTubeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

export function isValidVideoId(videoId: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(videoId);
}
