import OpenAI from "openai";

let client: any = null;

export function hasOpenAIKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);
}

export function isGeminiActive(): boolean {
  return Boolean(process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY);
}

/** Lazily-created client. Supports OpenAI and Google Gemini. */
export function getOpenAI(): OpenAI {
  const openAIKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!openAIKey && !geminiKey) {
    throw new Error(
      "No API key set. Please configure OPENAI_API_KEY or GEMINI_API_KEY in your .env file."
    );
  }

  if (client) return client as OpenAI;

  if (geminiKey) {
    // Return a proxy that uses Gemini's OpenAI-compatible endpoint and maps model names.
    const rawClient = new OpenAI({
      apiKey: geminiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });

    client = {
      chat: {
        completions: {
          create: async (params: any) => {
            let model = params.model;
            // Map any requested model to the configured Gemini equivalent
            if (typeof model === "string") {
              if (model.includes("mini") || model.includes("analyzer")) {
                model = process.env.GEMINI_ANALYZER_MODEL || "gemini-2.5-flash";
              } else {
                model = process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash";
              }
            }
            return rawClient.chat.completions.create({
              ...params,
              model,
            });
          },
        },
      },
      audio: {
        speech: {
          create: async () => {
            throw new Error("TTS is not supported on Gemini API. Using browser speech synthesis fallback.");
          },
        },
      },
    };
  } else {
    client = new OpenAI({ apiKey: openAIKey });
  }

  return client as OpenAI;
}

/** Turn an API SDK error into a concise, user-facing message. */
export function openAIErrorMessage(err: unknown): string {
  const e = err as {
    status?: number;
    code?: string;
    error?: { message?: string };
    message?: string;
  };
  const detail = e?.error?.message || e?.message || "Unknown error";
  if (e?.status === 401) return "API key rejected (401). Check your API keys in .env.";
  if (e?.status === 429) {
    if (isGeminiActive()) {
      return "Gemini API rate limit reached (15 requests/min). Please wait 60 seconds and try again.";
    }
    return "API quota/billing issue: " + detail;
  }
  if (e?.code === "insufficient_quota")
    return "API quota/billing issue: " + detail;
  if (e?.status === 404)
    return "Model not found (404): " + detail;
  return "AI error: " + detail;
}

/** Model defaults, overridable per-request from Settings or via env. */
export const MODELS = {
  chat: process.env.OPENAI_CHAT_MODEL || "gpt-5.1-chat-latest",
  analyzer: process.env.OPENAI_ANALYZER_MODEL || "gpt-5-mini",
  tts: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
};

/** Valid OpenAI TTS voices. */
export const TTS_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
] as const;
