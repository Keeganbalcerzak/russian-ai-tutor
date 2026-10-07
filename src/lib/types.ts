// Shared types for LLM structured outputs and API payloads.

export type Level = "beginner" | "intermediate" | "advanced";

export interface AnalysisCorrection {
  original: string; // the learner's text (Russian) that was wrong
  corrected: string; // the corrected Russian
  explanation: string; // short, friendly explanation (English)
  concept: string; // grammar/usage concept tag, e.g. "genitive case"
}

export interface AnalysisWord {
  lemma: string; // dictionary form, Russian
  translation: string; // English
  transliteration?: string;
  partOfSpeech?: string;
  correct: boolean; // used correctly by the learner
}

export interface AnalysisConcept {
  name: string; // e.g. "verb aspect"
  category: "grammar" | "usage" | "vocab-theme";
  performedWell: boolean;
}

export interface AnalysisResult {
  corrections: AnalysisCorrection[];
  wordsUsed: AnalysisWord[]; // words the learner used (from their message)
  newWords: AnalysisWord[]; // notable new words the bot introduced
  concepts: AnalysisConcept[];
  encouragement: string; // one short positive note (English)
}

export interface TopicSuggestion {
  title: string; // short topic title (English)
  description: string; // one sentence on the scenario
  practices: string[]; // the words/concepts it targets
  openingLine: string; // a Russian line the bot can open with
}

export interface ReviewSummary {
  summary: string; // 2-3 sentence recap of the session (English)
  strengths: string[];
  toReview: string[]; // concepts/words to keep working on
  nextTopics: TopicSuggestion[];
}
