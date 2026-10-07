import { prisma } from "./prisma";

/**
 * Words/concepts the learner most needs to practice right now:
 *  - words past their due date (being forgotten) or marked STRUGGLING
 *  - concepts with the lowest mastery / most errors
 */
export async function getPracticeTargets(opts?: {
  wordLimit?: number;
  conceptLimit?: number;
}) {
  const wordLimit = opts?.wordLimit ?? 8;
  const conceptLimit = opts?.conceptLimit ?? 5;
  const now = new Date();

  const dueWords = await prisma.word.findMany({
    where: {
      OR: [{ dueAt: { lte: now } }, { status: "STRUGGLING" }],
    },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    take: wordLimit,
  });

  const weakConcepts = await prisma.concept.findMany({
    orderBy: [{ masteryScore: "asc" }, { errorCount: "desc" }],
    take: conceptLimit,
  });

  return { dueWords, weakConcepts };
}

/** Render targets as simple string lists for prompts. */
export function targetsToStrings(
  dueWords: { lemma: string; translation: string }[],
  weakConcepts: { name: string }[]
) {
  return {
    targetWords: dueWords.map((w) =>
      w.translation ? `${w.lemma} (${w.translation})` : w.lemma
    ),
    weakConcepts: weakConcepts.map((c) => c.name),
  };
}
