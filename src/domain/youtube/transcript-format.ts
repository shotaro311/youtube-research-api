export type FormattedTranscriptSection = {
  heading: string;
  body: string;
};

export type FormattedTranscript = {
  title: string;
  sections: FormattedTranscriptSection[];
};
