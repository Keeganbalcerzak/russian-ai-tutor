import type { Level } from "./types";

interface ChatContext {
  level: Level;
  topic?: string | null;
  targetWords?: string[]; // due/struggling words to weave in
  weakConcepts?: string[]; // concepts to give practice on
}

const LEVEL_GUIDANCE: Record<Level, string> = {
  beginner:
    "The learner is a BEGINNER. Use short, simple Russian sentences (mostly present tense, common vocabulary). " +
    "After any non-trivial Russian word or phrase, add an inline English gloss in parentheses, e.g. «Привет (hi)». " +
    "Keep your replies to 1-3 short sentences and always end with a simple question to keep the conversation going. " +
    "Do NOT correct the learner mid-conversation — corrections are handled separately afterwards. Stay warm and encouraging.",
  intermediate:
    "The learner is INTERMEDIATE. Speak mostly in Russian with occasional English glosses only for harder words. " +
    "Use a natural mix of tenses and cases. Keep replies to 2-4 sentences and end with a question. " +
    "Do NOT correct the learner mid-conversation; just model correct, natural Russian.",
  advanced:
    "The learner is ADVANCED. Speak entirely in natural, idiomatic Russian (no glosses unless asked). " +
    "Use varied vocabulary, aspect, and complex sentences. Keep the conversation flowing with follow-up questions. " +
    "Do NOT correct the learner mid-conversation.",
};

/** System prompt for the conversational tutor. */
export function buildChatSystemPrompt(ctx: ChatContext): string {
  const parts: string[] = [
    "You are a friendly Russian conversation partner and tutor named «Иван».",
    LEVEL_GUIDANCE[ctx.level],
  ];

  if (ctx.topic) {
    parts.push(`Today's conversation topic: ${ctx.topic}. Steer the chat naturally around it.`);
  }
  if (ctx.targetWords && ctx.targetWords.length) {
    parts.push(
      `Try to naturally elicit or reuse these words the learner is practicing (don't force all of them, ~2-4 per turn): ${ctx.targetWords.join(
        ", "
      )}.`
    );
  }
  if (ctx.weakConcepts && ctx.weakConcepts.length) {
    parts.push(
      `Gently create opportunities for the learner to practice these grammar concepts they struggle with: ${ctx.weakConcepts.join(
        ", "
      )}.`
    );
  }

  parts.push(
    "Always reply in Russian (with glosses as appropriate for the level). Never break character or switch fully to English."
  );
  return parts.join("\n\n");
}

// ---------------------------------------------------------------------------
// Analyzer: extracts corrections, words, and concepts from the learner's turn.
// ---------------------------------------------------------------------------

export const ANALYZER_SYSTEM_PROMPT =
  "You are a meticulous Russian-language tutor analyzing a learner's latest message. " +
  "Identify grammar/spelling/word-choice mistakes and provide natural corrections with short, friendly English explanations. " +
  "List the meaningful Russian words the learner used (as dictionary lemmas) and whether each was used correctly. " +
  "List notable NEW words the assistant introduced that are worth learning. " +
  "Tag the grammar/usage concepts involved. Be encouraging and concise. " +
  "If the learner wrote in English or made no Russian attempt, return empty arrays except for newWords from the assistant. " +
  "Only include real, substantive words (skip punctuation and trivial particles unless relevant to a mistake).";

// Strict JSON schema for OpenAI Structured Outputs.
export const ANALYZER_SCHEMA = {
  name: "russian_turn_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      corrections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            original: { type: "string" },
            corrected: { type: "string" },
            explanation: { type: "string" },
            concept: { type: "string" },
          },
          required: ["original", "corrected", "explanation", "concept"],
        },
      },
      wordsUsed: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            lemma: { type: "string" },
            translation: { type: "string" },
            transliteration: { type: "string" },
            partOfSpeech: { type: "string" },
            correct: { type: "boolean" },
          },
          required: [
            "lemma",
            "translation",
            "transliteration",
            "partOfSpeech",
            "correct",
          ],
        },
      },
      newWords: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            lemma: { type: "string" },
            translation: { type: "string" },
            transliteration: { type: "string" },
            partOfSpeech: { type: "string" },
            correct: { type: "boolean" },
          },
          required: [
            "lemma",
            "translation",
            "transliteration",
            "partOfSpeech",
            "correct",
          ],
        },
      },
      concepts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            category: {
              type: "string",
              enum: ["grammar", "usage", "vocab-theme"],
            },
            performedWell: { type: "boolean" },
          },
          required: ["name", "category", "performedWell"],
        },
      },
      encouragement: { type: "string" },
    },
    required: [
      "corrections",
      "wordsUsed",
      "newWords",
      "concepts",
      "encouragement",
    ],
  },
} as const;

// ---------------------------------------------------------------------------
// Topic planner: suggests future conversations targeting weak items.
// ---------------------------------------------------------------------------

export const PLANNER_SYSTEM_PROMPT =
  "You are a Russian curriculum planner. Given a learner's level, the words they need to review, " +
  "and the grammar concepts they struggle with, propose engaging, concrete conversation scenarios " +
  "that would naturally force practice of those items. Each scenario should be everyday and motivating. " +
  "Provide a Russian opening line appropriate to the learner's level.";

export const PLANNER_SCHEMA = {
  name: "topic_suggestions",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            practices: { type: "array", items: { type: "string" } },
            openingLine: { type: "string" },
          },
          required: ["title", "description", "practices", "openingLine"],
        },
      },
    },
    required: ["suggestions"],
  },
} as const;

// ---------------------------------------------------------------------------
// End-of-session review.
// ---------------------------------------------------------------------------

export const REVIEW_SYSTEM_PROMPT =
  "You are a supportive Russian tutor writing a brief end-of-session review for the learner. " +
  "Use the transcript and the list of logged mistakes/concepts. Summarize what went well, what to keep working on, " +
  "and propose a few next conversation topics that would reinforce the weak areas. Be warm and specific.";

export const REVIEW_SCHEMA = {
  name: "session_review",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      strengths: { type: "array", items: { type: "string" } },
      toReview: { type: "array", items: { type: "string" } },
      nextTopics: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            practices: { type: "array", items: { type: "string" } },
            openingLine: { type: "string" },
          },
          required: ["title", "description", "practices", "openingLine"],
        },
      },
    },
    required: ["summary", "strengths", "toReview", "nextTopics"],
  },
} as const;
