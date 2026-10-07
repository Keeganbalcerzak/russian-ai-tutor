import { getOpenAI } from "./openai";
import { prisma } from "./prisma";
import { ANALYZER_SCHEMA, ANALYZER_SYSTEM_PROMPT } from "./prompts";
import { applyReview, newWordState, type WordStatus } from "./srs";
import type { AnalysisResult, AnalysisWord } from "./types";

interface AnalyzeArgs {
  analyzerModel: string;
  userText: string;
  assistantText: string;
  conversationId?: number;
  messageId?: number; // the learner's message row id (for linking mistakes)
}

/**
 * Run the analyzer on one turn and persist all derived state:
 * vocabulary (with SRS), concepts, and mistakes.
 */
export async function analyzeAndPersist(
  args: AnalyzeArgs
): Promise<AnalysisResult> {
  const client = getOpenAI();

  const completion = await client.chat.completions.create({
    model: args.analyzerModel,
    messages: [
      { role: "system", content: ANALYZER_SYSTEM_PROMPT },
      {
        role: "user",
        content:
          `Assistant said (Russian):\n${args.assistantText || "(start of conversation)"}\n\n` +
          `Learner replied:\n${args.userText}\n\n` +
          `Analyze the learner's reply.`,
      },
    ],
    response_format: { type: "json_schema", json_schema: ANALYZER_SCHEMA },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let result: AnalysisResult;
  try {
    result = JSON.parse(raw) as AnalysisResult;
  } catch {
    result = {
      corrections: [],
      wordsUsed: [],
      newWords: [],
      concepts: [],
      encouragement: "",
    };
  }

  await persistAnalysis(result, args);
  return result;
}

async function persistAnalysis(result: AnalysisResult, args: AnalyzeArgs) {
  const now = new Date();

  // --- Words: learner-used words drive SRS; new words are introduced as NEW. ---
  for (const w of result.wordsUsed) {
    await upsertWordWithReview(w, w.correct, now);
  }
  for (const w of result.newWords) {
    await introduceNewWord(w, now);
  }

  // --- Concepts: nudge mastery up/down based on performance. ---
  const conceptIdByName = new Map<string, number>();
  for (const c of result.concepts) {
    const name = c.name.trim().toLowerCase();
    if (!name) continue;
    const delta = c.performedWell ? 0.1 : -0.15;
    const existing = await prisma.concept.findUnique({ where: { name } });
    if (existing) {
      const mastery = clamp01(existing.masteryScore + delta);
      const updated = await prisma.concept.update({
        where: { id: existing.id },
        data: {
          masteryScore: mastery,
          practiceCount: existing.practiceCount + 1,
          errorCount: existing.errorCount + (c.performedWell ? 0 : 1),
          lastPracticedAt: now,
        },
      });
      conceptIdByName.set(name, updated.id);
    } else {
      const created = await prisma.concept.create({
        data: {
          name,
          category: c.category,
          masteryScore: clamp01(0.5 + delta),
          practiceCount: 1,
          errorCount: c.performedWell ? 0 : 1,
          lastPracticedAt: now,
        },
      });
      conceptIdByName.set(name, created.id);
    }
  }

  // --- Mistakes: log each with links to concept/word/message when possible. ---
  for (const m of result.corrections) {
    const conceptName = m.concept?.trim().toLowerCase();
    let conceptId = conceptName ? conceptIdByName.get(conceptName) : undefined;
    if (conceptName && !conceptId) {
      // The mistake references a concept the analyzer didn't list separately.
      const c = await prisma.concept.upsert({
        where: { name: conceptName },
        update: { errorCount: { increment: 1 }, lastPracticedAt: now },
        create: {
          name: conceptName,
          category: "grammar",
          masteryScore: 0.35,
          errorCount: 1,
          practiceCount: 1,
          lastPracticedAt: now,
        },
      });
      conceptId = c.id;
    }

    await prisma.mistake.create({
      data: {
        original: m.original,
        correction: m.corrected,
        explanation: m.explanation,
        conceptId: conceptId ?? null,
        messageId: args.messageId ?? null,
        conversationId: args.conversationId ?? null,
      },
    });
  }
}

async function upsertWordWithReview(
  w: AnalysisWord,
  correct: boolean,
  now: Date
) {
  const lemma = w.lemma.trim();
  if (!lemma) return;

  const existing = await prisma.word.findUnique({ where: { lemma } });
  if (existing) {
    const srs = applyReview(
      {
        easeFactor: existing.easeFactor,
        intervalDays: existing.intervalDays,
        repetitions: existing.repetitions,
        status: existing.status as WordStatus,
      },
      correct,
      now
    );
    await prisma.word.update({
      where: { id: existing.id },
      data: {
        easeFactor: srs.easeFactor,
        intervalDays: srs.intervalDays,
        repetitions: srs.repetitions,
        status: srs.status,
        dueAt: srs.dueAt,
        lastSeenAt: srs.lastSeenAt,
        exposureCount: { increment: 1 },
        correctCount: { increment: correct ? 1 : 0 },
        incorrectCount: { increment: correct ? 0 : 1 },
      },
    });
  } else {
    // First time we see it AND the learner used it — seed then immediately review.
    const seed = newWordState(now);
    const srs = applyReview(
      {
        easeFactor: seed.easeFactor,
        intervalDays: seed.intervalDays,
        repetitions: seed.repetitions,
        status: seed.status,
      },
      correct,
      now
    );
    await prisma.word.create({
      data: {
        lemma,
        translation: w.translation || "",
        transliteration: w.transliteration || null,
        partOfSpeech: w.partOfSpeech || null,
        easeFactor: srs.easeFactor,
        intervalDays: srs.intervalDays,
        repetitions: srs.repetitions,
        status: srs.status,
        dueAt: srs.dueAt,
        lastSeenAt: srs.lastSeenAt,
        exposureCount: 1,
        correctCount: correct ? 1 : 0,
        incorrectCount: correct ? 0 : 1,
      },
    });
  }
}

async function introduceNewWord(w: AnalysisWord, now: Date) {
  const lemma = w.lemma.trim();
  if (!lemma) return;
  const seed = newWordState(now);
  await prisma.word.upsert({
    where: { lemma },
    update: {}, // already tracked — leave SRS state alone
    create: {
      lemma,
      translation: w.translation || "",
      transliteration: w.transliteration || null,
      partOfSpeech: w.partOfSpeech || null,
      easeFactor: seed.easeFactor,
      intervalDays: seed.intervalDays,
      repetitions: seed.repetitions,
      status: "NEW",
      dueAt: seed.dueAt,
    },
  });
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
