import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const now = new Date();

  const [words, concepts, recentMistakes, totalWords, dueCount, statusGroups] =
    await Promise.all([
      prisma.word.findMany({ orderBy: [{ dueAt: "asc" }] }),
      prisma.concept.findMany({ orderBy: [{ masteryScore: "asc" }] }),
      prisma.mistake.findMany({
        orderBy: { createdAt: "desc" },
        take: 25,
        include: { concept: true },
      }),
      prisma.word.count(),
      prisma.word.count({ where: { dueAt: { lte: now } } }),
      prisma.word.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

  const byStatus: Record<string, number> = {};
  for (const g of statusGroups) byStatus[g.status] = g._count._all;

  return NextResponse.json({
    stats: {
      totalWords,
      dueCount,
      learning: byStatus["LEARNING"] || 0,
      known: byStatus["KNOWN"] || 0,
      struggling: byStatus["STRUGGLING"] || 0,
      new: byStatus["NEW"] || 0,
      totalConcepts: concepts.length,
    },
    words,
    concepts,
    recentMistakes,
  });
}
