import { NextResponse } from "next/server";
import { getOpenAI, hasOpenAIKey, openAIErrorMessage } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { REVIEW_SCHEMA, REVIEW_SYSTEM_PROMPT } from "@/lib/prompts";
import type { ReviewSummary } from "@/lib/types";

export async function POST(req: Request) {
  if (!hasOpenAIKey()) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { conversationId } = body as { conversationId?: number };
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      mistakes: { include: { concept: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const settings = await getSettings();

  const transcript = conversation.messages
    .map((m) => `${m.role === "user" ? "Learner" : "Tutor"}: ${m.content}`)
    .join("\n");
  const mistakesText = conversation.mistakes.length
    ? conversation.mistakes
        .map(
          (m) =>
            `- "${m.original}" -> "${m.correction}"` +
            (m.concept ? ` [${m.concept.name}]` : "") +
            (m.explanation ? ` (${m.explanation})` : "")
        )
        .join("\n")
    : "(no mistakes logged)";

  const userContent =
    `Learner level: ${settings.level}.\n\n` +
    `Transcript:\n${transcript || "(empty)"}\n\n` +
    `Logged mistakes:\n${mistakesText}\n\n` +
    `Write the session review.`;

  try {
    const client = getOpenAI();
    const completion = await client.chat.completions.create({
      model: settings.analyzerModel,
      messages: [
        { role: "system", content: REVIEW_SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_schema", json_schema: REVIEW_SCHEMA },
    });
    const raw = completion.choices[0]?.message?.content ?? "{}";
    const review = JSON.parse(raw) as ReviewSummary;

    await prisma.conversation.update({
      where: { id: conversationId },
      data: { endedAt: new Date(), summary: review.summary },
    });

    return NextResponse.json(review);
  } catch (err) {
    console.error("review error", err);
    return NextResponse.json({ error: openAIErrorMessage(err) }, { status: 502 });
  }
}
