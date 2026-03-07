export type CommentItem = {
  author: string;
  text: string;
  likes: number;
};

export type TranscriptSegment = {
  time: string;
  text: string;
};

export type RawVideoData = {
  videoId: string;
  url: string;
  thumbnailUrl: string;
  title: string;
  channelId?: string;
  channelName: string;
  subscribers: number;
  channelCreatedAt: string;
  publishedAt: string;
  views: number;
  duration: string;
  transcript: TranscriptSegment[];
  comments: CommentItem[];
};

export type VideoMetadata = {
  title: string;
  thumbnailUrl: string;
  viewCount: string;
  publishDate: string;
  author: string;
};

export type StageDiagnostic = {
  stage: string;
  success: boolean;
  error?: string;
};

export type ExtractVideoInput = {
  url: string;
  includeTranscript?: boolean;
  includeComments?: boolean;
};

export type ExtractVideoResponse = {
  rawData: RawVideoData;
  metadata: VideoMetadata;
  diagnostics: {
    transcript: StageDiagnostic[];
    comments: StageDiagnostic[];
    metadata: StageDiagnostic[];
  };
};

export type ResolveSourceInput = {
  inputUrl: string;
  maxVideos?: number;
};

export type ResolveSourceResponse = {
  sourceType: "channel" | "playlist";
  sourceId: string;
  sourceName?: string;
  urls: string[];
  excluded: {
    shorts: number;
    live: number;
  };
};
