import { NextResponse } from "next/server";
import { getOpenAI, hasOpenAIKey, openAIErrorMessage } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { getPracticeTargets, targetsToStrings } from "@/lib/practice";
import { PLANNER_SCHEMA, PLANNER_SYSTEM_PROMPT } from "@/lib/prompts";
import type { TopicSuggestion } from "@/lib/types";

export async function POST() {
  if (!hasOpenAIKey()) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set." }, { status: 400 });
  }

  const settings = await getSettings();
  const { dueWords, weakConcepts } = await getPracticeTargets();
  const { targetWords, weakConcepts: weakConceptNames } = targetsToStrings(
    dueWords,
    weakConcepts
  );

  const recentMistakes = await prisma.mistake.findMany({
    where: { resolved: false },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { original: true, correction: true },
  });

  const context = [
    `Learner level: ${settings.level}.`,
    targetWords.length
      ? `Words to review: ${targetWords.join(", ")}.`
      : "No specific review words yet (learner is just starting).",
    weakConceptNames.length
      ? `Weak grammar concepts: ${weakConceptNames.join(", ")}.`
      : "No weak concepts logged yet.",
    recentMistakes.length
      ? `Recent mistakes: ${recentMistakes
          .map((m) => `"${m.original}" -> "${m.correction}"`)
          .join("; ")}.`
      : "",
    "Propose 3 conversation topics that would give good practice. For a beginner with no history, suggest friendly everyday starter topics.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: settings.analyzerModel,
      messages: [
        { role: "system", content: PLANNER_SYSTEM_PROMPT },
        { role: "user", content: context },
      ],
      response_format: { type: "json_schema", json_schema: PLANNER_SCHEMA },
    });
    const raw = completion.choices[0]?.message?.content ?? '{"suggestions":[]}';
    const parsed = JSON.parse(raw) as { suggestions: TopicSuggestion[] };
    return NextResponse.json(parsed);
  } catch (err) {
    console.error("plan error", err);
    return NextResponse.json({ error: openAIErrorMessage(err) }, { status: 502 });
  }
}
