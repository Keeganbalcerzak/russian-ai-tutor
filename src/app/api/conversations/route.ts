import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Create a new conversation (optionally with a chosen topic).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { topic, title, openingLine } = body as {
    topic?: string;
    title?: string;
    openingLine?: string;
  };

  const conversation = await prisma.conversation.create({
    data: {
      topic: topic || null,
      title: title || topic || null,
    },
  });

  // If the chosen topic came with a Russian opening line, seed it as the
  // assistant's first message so the chat starts immediately.
  if (openingLine && openingLine.trim()) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: openingLine.trim(),
      },
    });
  }

  const full = await prisma.conversation.findUnique({
    where: { id: conversation.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return NextResponse.json(full);
}

// List recent conversations.
export async function GET() {
  const conversations = await prisma.conversation.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { _count: { select: { messages: true, mistakes: true } } },
  });
  return NextResponse.json(conversations);
}
