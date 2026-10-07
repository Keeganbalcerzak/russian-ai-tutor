import { NextResponse } from "next/server";
import { hasOpenAIKey, openAIErrorMessage } from "@/lib/openai";
import { getSettings } from "@/lib/settings";
import { analyzeAndPersist } from "@/lib/analysis";

export async function POST(req: Request) {
  if (!hasOpenAIKey()) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { conversationId, userText, assistantText, userMessageId } = body as {
    conversationId?: number;
    userText?: string;
    assistantText?: string;
    userMessageId?: number;
  };

  if (!userText || !userText.trim()) {
    return NextResponse.json({ error: "userText required" }, { status: 400 });
  }

  try {
    const settings = await getSettings();
    const result = await analyzeAndPersist({
      analyzerModel: settings.analyzerModel,
      userText,
      assistantText: assistantText || "",
      conversationId,
      messageId: userMessageId,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("analyze error", err);
    return NextResponse.json({ error: openAIErrorMessage(err) }, { status: 502 });
  }
}
