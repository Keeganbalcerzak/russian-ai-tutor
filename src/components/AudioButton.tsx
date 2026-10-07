"use client";

import { useState } from "react";

interface Props {
  text: string;
  voice?: string;
  className?: string;
  label?: string;
}

/**
 * Plays Russian audio for the given text.
 * Tries the OpenAI-backed /api/tts endpoint first; falls back to the browser's
 * built-in speech synthesis (ru-RU) if that fails (e.g. no API key / offline).
 */
export default function AudioButton({ text, voice, className, label }: Props) {
  const [loading, setLoading] = useState(false);

  async function play() {
    if (loading || !text.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
      });
      if (!res.ok) throw new Error("tts failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch {
      browserSpeak(text);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={play}
      title="Listen"
      aria-label="Listen"
      className={
        className ??
        "inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 transition-colors"
      }
    >
      <span aria-hidden>{loading ? "⏳" : "🔊"}</span>
      {label ? <span>{label}</span> : null}
    </button>
  );
}

function browserSpeak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ru-RU";
  const ru = window.speechSynthesis
    .getVoices()
    .find((v) => v.lang.toLowerCase().startsWith("ru"));
  if (ru) utter.voice = ru;
  utter.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}
