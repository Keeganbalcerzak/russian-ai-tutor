import { prisma } from "./prisma";
import { MODELS } from "./openai";

/** Fetch the single Settings row, creating it with defaults on first run. */
export async function getSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return prisma.settings.create({
    data: {
      id: 1,
      chatModel: MODELS.chat,
      analyzerModel: MODELS.analyzer,
      ttsModel: MODELS.tts,
    },
  });
}
