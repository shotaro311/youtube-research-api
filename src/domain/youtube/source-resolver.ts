import { Innertube } from "youtubei.js";

import { BadRequestError } from "./errors";
import { normalizeYouTubeUrl } from "./shared";
import type { ResolveSourceInput, ResolveSourceResponse } from "./types";

type ChannelVideo = {
  videoId: string;
  url: string;
};

type VideoSourceKind = "channel" | "playlist";

type ContinuableFeed = {
  videos?: unknown[];
  has_continuation?: boolean;
  getContinuation?: () => Promise<ContinuableFeed>;
};

type ContinuablePlaylist = {
  items?: unknown[];
  info?: { title?: string };
  has_continuation?: boolean;
  getContinuation?: () => Promise<ContinuablePlaylist>;
};

const DEFAULT_MAX_VIDEOS = 5000;

function normalizeMaxVideos(value: unknown) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return DEFAULT_MAX_VIDEOS;
  return Math.min(Math.max(1, Math.floor(numberValue)), DEFAULT_MAX_VIDEOS);
}

function normalizePlaylistId(rawId: string): string | null {
  const id = (rawId || "").trim();
  if (!id) return null;
  return id.startsWith("VL") ? id.slice(2) || null : id;
}

function extractPlaylistIdFromUrlString(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    const listParam = url.searchParams.get("list");
    if (listParam) return normalizePlaylistId(listParam);

    const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
    const playlistIndex = segments.findIndex((segment) => segment === "playlist");
    if (playlistIndex !== -1) {
      const candidate = segments[playlistIndex + 1];
      if (candidate) return normalizePlaylistId(candidate);
    }
    return null;
  } catch {
    return null;
  }
}

function extractChannelIdFromUrlString(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
    const channelIndex = segments.findIndex((segment) => segment === "channel");
    if (channelIndex !== -1) {
      const id = segments[channelIndex + 1];
      if (id && typeof id === "string") return id;
    }
    return null;
  } catch {
    return null;
  }
}

function extractBrowseIdFromEndpointPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  const candidates = [
    record.browseId,
    record.browse_id,
    (record.browseEndpoint as Record<string, unknown> | undefined)?.browseId,
    (record.browseEndpoint as Record<string, unknown> | undefined)?.browse_id,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function extractPlaylistIdFromEndpointPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const record = payload as Record<string, unknown>;
  const playlistCandidates = [
    record.playlistId,
    record.playlist_id,
    (record.browseEndpoint as Record<string, unknown> | undefined)?.playlistId,
    (record.browseEndpoint as Record<string, unknown> | undefined)?.playlist_id,
  ];
  for (const candidate of playlistCandidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    const normalized = normalizePlaylistId(candidate.trim());
    if (normalized) return normalized;
  }

  const browseCandidates = [
    record.browseId,
    record.browse_id,
    (record.browseEndpoint as Record<string, unknown> | undefined)?.browseId,
    (record.browseEndpoint as Record<string, unknown> | undefined)?.browse_id,
  ];
  for (const candidate of browseCandidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    if (!candidate.startsWith("VL")) continue;
    const normalized = normalizePlaylistId(candidate.trim());
    if (normalized) return normalized;
  }

  return null;
}

function pickVideoId(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const raw = record.video_id ?? record.id;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return id || null;
}

function isShortItem(item: unknown): boolean {
  const type = (item as { type?: unknown } | undefined)?.type;
  if (type === "ShortsLockupView" || type === "ReelItem") return true;
  if (type === "PlaylistVideo") {
    const style = (item as { style?: unknown }).style;
    return typeof style === "string" && style.toUpperCase().includes("SHORT");
  }
  return false;
}

function isLiveItem(item: unknown): boolean {
  const type = (item as { type?: unknown } | undefined)?.type;
  if (type === "Video") {
    const video = item as { is_live?: boolean; is_upcoming?: boolean };
    return Boolean(video.is_live || video.is_upcoming);
  }
  if (type === "GridVideo") {
    const video = item as { is_upcoming?: boolean; duration?: unknown };
    if (video.duration == null && video.is_upcoming) return true;
  }
  if (type === "PlaylistVideo") {
    const video = item as { is_live?: boolean; is_upcoming?: boolean };
    return Boolean(video.is_live || video.is_upcoming);
  }
  return false;
}

async function listChannelVideos(params: {
  youtube: Innertube;
  channelUrl: string;
  maxVideos: number;
  resolvedPayload?: unknown;
}): Promise<{
  channelId: string;
  channelName?: string;
  videos: ChannelVideo[];
  excludedShorts: number;
  excludedLive: number;
}> {
  const normalizedUrl = normalizeYouTubeUrl(params.channelUrl);
  if (!normalizedUrl) throw new BadRequestError("inputUrl is required");

  let channelId = extractChannelIdFromUrlString(normalizedUrl);
  if (!channelId) channelId = extractBrowseIdFromEndpointPayload(params.resolvedPayload);
  if (!channelId) {
    const endpoint = await params.youtube.resolveURL(normalizedUrl);
    channelId = extractBrowseIdFromEndpointPayload(endpoint?.payload);
  }
  if (!channelId) {
    throw new BadRequestError("チャンネルIDを解決できませんでした（URLを確認してください）");
  }

  let channel = await params.youtube.getChannel(channelId);
  if (channel.has_videos) {
    channel = await channel.getVideos();
  } else {
    channel = await channel.getVideos().catch(() => channel);
  }

  const videos: ChannelVideo[] = [];
  const seen = new Set<string>();
  let excludedShorts = 0;
  let excludedLive = 0;

  let feed = channel as unknown as ContinuableFeed;

  const collectFromFeed = (current: ContinuableFeed) => {
    const items = Array.isArray(current.videos) ? current.videos : [];
    for (const item of items) {
      if (isShortItem(item)) {
        excludedShorts += 1;
        continue;
      }
      if (isLiveItem(item)) {
        excludedLive += 1;
        continue;
      }

      const videoId = pickVideoId(item);
      if (!videoId || seen.has(videoId)) continue;
      seen.add(videoId);
      videos.push({ videoId, url: `https://www.youtube.com/watch?v=${videoId}` });
      if (videos.length >= params.maxVideos) return;
    }
  };

  collectFromFeed(feed);
  while (videos.length < params.maxVideos && feed.has_continuation && feed.getContinuation) {
    feed = await feed.getContinuation();
    collectFromFeed(feed);
  }

  return {
    channelId,
    channelName: channel.metadata?.title,
    videos,
    excludedShorts,
    excludedLive,
  };
}

async function listPlaylistVideos(params: {
  youtube: Innertube;
  playlistId: string;
  maxVideos: number;
}): Promise<{
  playlistId: string;
  playlistName?: string;
  videos: ChannelVideo[];
  excludedShorts: number;
  excludedLive: number;
}> {
  const playlist = await params.youtube.getPlaylist(params.playlistId);

  const videos: ChannelVideo[] = [];
  const seen = new Set<string>();
  let excludedShorts = 0;
  let excludedLive = 0;
  let feed = playlist as unknown as ContinuablePlaylist;

  const collectFromFeed = (current: ContinuablePlaylist) => {
    const items = Array.isArray(current.items) ? current.items : [];
    for (const item of items) {
      if (isShortItem(item)) {
        excludedShorts += 1;
        continue;
      }
      if (isLiveItem(item)) {
        excludedLive += 1;
        continue;
      }

      const videoId = pickVideoId(item);
      if (!videoId || seen.has(videoId)) continue;
      seen.add(videoId);
      videos.push({ videoId, url: `https://www.youtube.com/watch?v=${videoId}` });
      if (videos.length >= params.maxVideos) return;
    }
  };

  collectFromFeed(feed);
  while (videos.length < params.maxVideos && feed.has_continuation && feed.getContinuation) {
    feed = await feed.getContinuation();
    collectFromFeed(feed);
  }

  return {
    playlistId: params.playlistId,
    playlistName: playlist.info?.title,
    videos,
    excludedShorts,
    excludedLive,
  };
}

export async function resolveSourceUrls(input: ResolveSourceInput): Promise<ResolveSourceResponse> {
  const inputUrl = normalizeYouTubeUrl(input.inputUrl || "");
  if (!inputUrl) throw new BadRequestError("inputUrl is required");

  const maxVideos = normalizeMaxVideos(input.maxVideos);
  const youtube = await Innertube.create({ lang: "ja", location: "JP" });

  const playlistIdFromUrl = extractPlaylistIdFromUrlString(inputUrl);
  if (playlistIdFromUrl) {
    const result = await listPlaylistVideos({ youtube, playlistId: playlistIdFromUrl, maxVideos });
    return {
      sourceType: "playlist",
      sourceId: result.playlistId,
      sourceName: result.playlistName,
      urls: result.videos.map((video) => video.url),
      excluded: { shorts: result.excludedShorts, live: result.excludedLive },
    };
  }

  const endpoint = await youtube.resolveURL(inputUrl).catch(() => null);
  const playlistIdFromEndpoint = extractPlaylistIdFromEndpointPayload(endpoint?.payload);
  if (playlistIdFromEndpoint) {
    const result = await listPlaylistVideos({ youtube, playlistId: playlistIdFromEndpoint, maxVideos });
    return {
      sourceType: "playlist",
      sourceId: result.playlistId,
      sourceName: result.playlistName,
      urls: result.videos.map((video) => video.url),
      excluded: { shorts: result.excludedShorts, live: result.excludedLive },
    };
  }

  const result = await listChannelVideos({
    youtube,
    channelUrl: inputUrl,
    maxVideos,
    resolvedPayload: endpoint?.payload,
  });

  return {
    sourceType: "channel",
    sourceId: result.channelId,
    sourceName: result.channelName,
    urls: result.videos.map((video) => video.url),
    excluded: { shorts: result.excludedShorts, live: result.excludedLive },
  };
}
