import { NextResponse } from "next/server";
import { getOpenAI, hasOpenAIKey, openAIErrorMessage } from "@/lib/openai";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { getPracticeTargets, targetsToStrings } from "@/lib/practice";
import { buildChatSystemPrompt } from "@/lib/prompts";
import type { Level } from "@/lib/types";

const GREET_INSTRUCTION =
  "Начни разговор: тепло поздоровайся с учеником и задай один простой вопрос по теме. " +
  "(Greet the learner warmly and ask one simple question to begin.)";

export async function POST(req: Request) {
  if (!hasOpenAIKey()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set. Add it to .env and restart." },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { conversationId, message, start } = body as {
    conversationId?: number;
    message?: string;
    start?: boolean;
  };

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId required" }, { status: 400 });
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: "asc" }, take: 24 } },
  });
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const settings = await getSettings();
  const { dueWords, weakConcepts } = await getPracticeTargets();
  const { targetWords, weakConcepts: weakConceptNames } = targetsToStrings(
    dueWords,
    weakConcepts
  );

  const systemPrompt = buildChatSystemPrompt({
    level: settings.level as Level,
    topic: conversation.topic,
    targetWords,
    weakConcepts: weakConceptNames,
  });

  // Build the message list sent to the model.
  const history = conversation.messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  let userMessageId: number | null = null;
  const chatMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
    ...history,
  ];

  if (start) {
    chatMessages.push({ role: "user", content: GREET_INSTRUCTION });
  } else {
    const text = (message || "").trim();
    if (!text) {
      return NextResponse.json({ error: "message required" }, { status: 400 });
    }
    const saved = await prisma.message.create({
      data: { conversationId, role: "user", content: text },
    });
    userMessageId = saved.id;
    chatMessages.push({ role: "user", content: text });
  }

  const client = getOpenAI();
  let completion;
  try {
    completion = await client.chat.completions.create({
      model: settings.chatModel,
      messages: chatMessages,
      stream: true,
    });
  } catch (err) {
    console.error("chat create error", err);
    return NextResponse.json({ error: openAIErrorMessage(err) }, { status: 502 });
  }

  const encoder = new TextEncoder();
  let full = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content || "";
          if (delta) {
            full += delta;
            controller.enqueue(encoder.encode(delta));
          }
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode("\n\n[Ошибка: не удалось получить ответ.]")
        );
        console.error("chat stream error", err);
      } finally {
        // Persist the assistant's full reply once streaming completes.
        if (full.trim()) {
          await prisma.message.create({
            data: { conversationId, role: "assistant", content: full.trim() },
          });
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Conversation-Id": String(conversationId),
      ...(userMessageId ? { "X-User-Message-Id": String(userMessageId) } : {}),
    },
  });
}
