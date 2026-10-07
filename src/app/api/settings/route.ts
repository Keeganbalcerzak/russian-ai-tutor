import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { seedStarterWordsIfEmpty } from "@/lib/seed";
import { hasOpenAIKey, TTS_VOICES } from "@/lib/openai";

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json({ ...settings, hasApiKey: hasOpenAIKey() });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { level, voice, chatModel, analyzerModel, ttsModel, onboarded } =
    body as Record<string, unknown>;

  await getSettings(); // ensure row exists

  const data: Record<string, unknown> = {};
  if (level && ["beginner", "intermediate", "advanced"].includes(level as string))
    data.level = level;
  if (voice && (TTS_VOICES as readonly string[]).includes(voice as string))
    data.voice = voice;
  if (typeof chatModel === "string" && chatModel) data.chatModel = chatModel;
  if (typeof analyzerModel === "string" && analyzerModel)
    data.analyzerModel = analyzerModel;
  if (typeof ttsModel === "string" && ttsModel) data.ttsModel = ttsModel;
  if (typeof onboarded === "boolean") data.onboarded = onboarded;

  const updated = await prisma.settings.update({ where: { id: 1 }, data });

  // On first completion of onboarding, seed beginner starter vocabulary.
  let seeded = 0;
  if (onboarded === true) {
    seeded = await seedStarterWordsIfEmpty();
  }

  return NextResponse.json({ ...updated, seeded });
}
