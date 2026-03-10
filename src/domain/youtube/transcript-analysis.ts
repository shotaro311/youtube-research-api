export type TranscriptAnalysisFlowStage = {
  stage: string;
  summary: string;
  viewerPsychology: string;
};

export type TranscriptAnalysis = {
  title: string;
  flowStages: TranscriptAnalysisFlowStage[];
  empathyMoments: string[];
  creatorIntent: string;
  viewerStrengths: string[];
  viewerImprovements: string[];
  overallScore: number;
  overallVerdict: string;
  overallEvaluation: string;
};
