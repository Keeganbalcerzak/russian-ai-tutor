import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { getOpenAI, hasOpenAIKey, openAIErrorMessage, isGeminiActive } from "@/lib/openai";
import { getSettings } from "@/lib/settings";

const AUDIO_DIR = path.join(process.cwd(), "public", "audio");

function getElevenLabsVoiceId(openAIVoice: string): string {
  const maleVoices = ["echo", "fable", "onyx", "ash", "ballad", "sage"];
  const name = openAIVoice.toLowerCase();
  if (maleVoices.includes(name)) {
    return "pNInz6obpgDQGcFmaJgB"; // Adam - Dominant, Firm
  }
  return "Xb7hH8MSUJpSbSDYk0k2"; // Alice - Clear, Engaging Educator
}

async function fetchElevenLabsTTS(text: string, voiceId: string, apiKey: string): Promise<Buffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs TTS failed with status ${response.status}: ${errText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function fetchChunk(chunk: string): Promise<Buffer> {
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(chunk)}&tl=ru&client=tw-ob`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`Google Translate TTS fetch failed: ${res.status} ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function fetchGoogleTTS(text: string): Promise<Buffer> {
  const maxLen = 200;
  if (text.length <= maxLen) {
    return fetchChunk(text);
  }

  const chunks: string[] = [];
  let current = "";
  const parts = text.split(/([.!?。！？、，,;；：:\s]+)/);

  for (const part of parts) {
    if (current.length + part.length > maxLen) {
      if (current.trim()) chunks.push(current.trim());
      current = part;
    } else {
      current += part;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  const buffers: Buffer[] = [];
  for (const chunk of chunks) {
    if (chunk.trim()) {
      buffers.push(await fetchChunk(chunk));
    }
  }

  return Buffer.concat(buffers);
}

export async function POST(req: Request) {
  if (!hasOpenAIKey()) {
    return NextResponse.json({ error: "API key is not set." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { text, voice } = body as { text?: string; voice?: string };
  if (!text || !text.trim()) {
    return NextResponse.json({ error: "text required" }, { status: 400 });
  }

  const settings = await getSettings();
  const useVoice = voice || settings.voice || "alloy";
  const model = settings.ttsModel;

  const isGemini = isGeminiActive();
  const elevenlabsApiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = getElevenLabsVoiceId(useVoice);

  // Define potential cache file paths
  const elevenLabsHash = createHash("sha256")
    .update(`elevenlabs|${voiceId}|${text}`)
    .digest("hex")
    .slice(0, 32);
  const elevenLabsPath = path.join(AUDIO_DIR, `${elevenLabsHash}.mp3`);

  const googleHash = createHash("sha256")
    .update(`google-translate-ru|${text}`)
    .digest("hex")
    .slice(0, 32);
  const googlePath = path.join(AUDIO_DIR, `${googleHash}.mp3`);

  const openAIHash = createHash("sha256")
    .update(`${model}|${useVoice}|${text}`)
    .digest("hex")
    .slice(0, 32);
  const openAIPath = path.join(AUDIO_DIR, `${openAIHash}.mp3`);

  // 1. Try loading cached audio based on active provider
  if (elevenlabsApiKey) {
    try {
      const cached = await fs.readFile(elevenLabsPath);
      return audioResponse(cached);
    } catch {
      // not cached
    }
  } else if (isGemini) {
    try {
      const cached = await fs.readFile(googlePath);
      return audioResponse(cached);
    } catch {
      // not cached
    }
  } else {
    try {
      const cached = await fs.readFile(openAIPath);
      return audioResponse(cached);
    } catch {
      // not cached
    }
  }

  // Generate if not cached
  try {
    let buffer: Buffer;

    if (elevenlabsApiKey) {
      try {
        console.log("Generating audio with ElevenLabs neural voice...");
        buffer = await fetchElevenLabsTTS(text, voiceId, elevenlabsApiKey);
        await fs.mkdir(AUDIO_DIR, { recursive: true });
        await fs.writeFile(elevenLabsPath, buffer);
        return audioResponse(buffer);
      } catch (err) {
        console.error("ElevenLabs failed, falling back to Google Translate TTS:", err);
        // continue to Google Translate TTS fallback
      }
    }

    if (isGemini) {
      console.log("Generating audio with Google Translate TTS...");
      buffer = await fetchGoogleTTS(text);
      await fs.mkdir(AUDIO_DIR, { recursive: true });
      await fs.writeFile(googlePath, buffer);
      return audioResponse(buffer);
    } else {
      console.log("Generating audio with OpenAI TTS...");
      const client = getOpenAI();
      const speech = await client.audio.speech.create({
        model,
        voice: useVoice,
        input: text,
        instructions:
          "Speak clearly in Russian at a slightly slow, learner-friendly pace.",
      });
      buffer = Buffer.from(await speech.arrayBuffer());
      await fs.mkdir(AUDIO_DIR, { recursive: true });
      await fs.writeFile(openAIPath, buffer);
      return audioResponse(buffer);
    }
  } catch (err) {
    console.error("tts error", err);
    return NextResponse.json({ error: openAIErrorMessage(err) }, { status: 502 });
  }
}

function audioResponse(buf: Buffer) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
