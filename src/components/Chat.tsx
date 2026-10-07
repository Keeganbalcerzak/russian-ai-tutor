"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import AudioButton from "./AudioButton";
import type {
  AnalysisResult,
  AnalysisCorrection,
  Level,
  ReviewSummary,
  TopicSuggestion,
} from "@/lib/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface SettingsState {
  level: Level;
  voice: string;
  onboarded: boolean;
  hasApiKey: boolean;
}

export default function Chat() {
  const [settings, setSettings] = useState<SettingsState | null>(null);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [corrections, setCorrections] = useState<AnalysisCorrection[]>([]);
  const [encouragement, setEncouragement] = useState("");
  const [error, setError] = useState("");

  const [topics, setTopics] = useState<TopicSuggestion[] | null>(null);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [review, setReview] = useState<ReviewSummary | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // ---- helpers ----------------------------------------------------------
  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Stream a bot reply into the last assistant message.
  const streamBot = useCallback(
    async (convId: number, opts: { message?: string; start?: boolean }) => {
      setStreaming(true);
      setError("");
      // Add an empty assistant bubble we will fill as tokens arrive.
      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: convId, ...opts }),
        });
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Chat request failed");
        }
        const userMessageId = res.headers.get("X-User-Message-Id");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: "assistant", content: full };
            return copy;
          });
        }

        // After a learner turn, analyze it retrospectively.
        if (!opts.start && opts.message) {
          analyzeTurn(convId, opts.message, full, userMessageId);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Something went wrong";
        setError(msg);
        // remove the empty assistant bubble on failure
        setMessages((m) => {
          const copy = [...m];
          if (copy.length && copy[copy.length - 1].content === "") copy.pop();
          return copy;
        });
      } finally {
        setStreaming(false);
      }
    },
    []
  );

  const analyzeTurn = useCallback(
    async (
      convId: number,
      userText: string,
      assistantText: string,
      userMessageId: string | null
    ) => {
      setAnalyzing(true);
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: convId,
            userText,
            assistantText,
            userMessageId: userMessageId ? Number(userMessageId) : undefined,
          }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as AnalysisResult;
        if (data.corrections?.length) {
          setCorrections((c) => [...data.corrections, ...c]);
        }
        if (data.encouragement) setEncouragement(data.encouragement);
      } finally {
        setAnalyzing(false);
      }
    },
    []
  );

  const startConversation = useCallback(
    async (topic?: string, openingLine?: string) => {
      setError("");
      setCorrections([]);
      setEncouragement("");
      setReview(null);
      setTopics(null);
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, openingLine }),
      });
      const conv = await res.json();
      setConversationId(conv.id);
      const initial: ChatMessage[] = (conv.messages || []).map(
        (m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        })
      );
      setMessages(initial);
      // If no opening line was seeded, ask the bot to greet.
      if (!initial.length) {
        streamBot(conv.id, { start: true });
      }
    },
    [streamBot]
  );

  // ---- init -------------------------------------------------------------
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/settings");
      const s = await res.json();
      setSettings({
        level: s.level,
        voice: s.voice,
        onboarded: s.onboarded,
        hasApiKey: s.hasApiKey,
      });
      if (s.onboarded) {
        startConversation();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- actions ----------------------------------------------------------
  function handleSend() {
    const text = input.trim();
    if (!text || streaming || !conversationId) return;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    streamBot(conversationId, { message: text });
  }

  async function completeOnboarding(level: Level) {
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, onboarded: true }),
    });
    setSettings((s) => (s ? { ...s, level, onboarded: true } : s));
    startConversation();
  }

  async function loadTopics() {
    setTopicsLoading(true);
    setReview(null);
    try {
      const res = await fetch("/api/session/plan", { method: "POST" });
      const data = await res.json();
      setTopics(data.suggestions || []);
    } catch {
      setError("Could not load topic suggestions.");
    } finally {
      setTopicsLoading(false);
    }
  }

  async function endAndReview() {
    if (!conversationId) return;
    setReviewLoading(true);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      const data = await res.json();
      setReview(data);
    } catch {
      setError("Could not generate review.");
    } finally {
      setReviewLoading(false);
    }
  }

  // ---- render -----------------------------------------------------------
  if (settings && !settings.onboarded) {
    return <Onboarding hasApiKey={settings.hasApiKey} onDone={completeOnboarding} />;
  }

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 flex flex-col md:flex-row gap-4 p-4">
      {/* Chat column */}
      <section className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden min-h-[60vh]">
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 bg-slate-50">
          <div className="text-sm text-slate-500">
            {settings ? `Level: ${settings.level}` : ""}
          </div>
          <div className="flex gap-2">
            <button
              onClick={loadTopics}
              className="text-sm px-3 py-1.5 rounded-md bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium"
            >
              ✨ Topics
            </button>
            <button
              onClick={endAndReview}
              disabled={!conversationId || reviewLoading}
              className="text-sm px-3 py-1.5 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium disabled:opacity-50"
            >
              {reviewLoading ? "Reviewing…" : "End & review"}
            </button>
          </div>
        </div>

        {settings && !settings.hasApiKey && (
          <div className="bg-amber-50 text-amber-800 text-sm px-4 py-2 border-b border-amber-100">
            No OpenAI API key detected. Add <code>OPENAI_API_KEY</code> to{" "}
            <code>.env</code> and restart the dev server.
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <MessageBubble key={i} role={m.role} content={m.content} voice={settings?.voice} />
          ))}
          {streaming && messages[messages.length - 1]?.content === "" && (
            <div className="text-slate-400 text-sm">Иван печатает…</div>
          )}
          {error && <div className="text-red-600 text-sm">{error}</div>}
        </div>

        <div className="border-t border-slate-100 p-3">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder="Печатайте по-русски… (type in Russian, Enter to send)"
              className="flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <button
              onClick={handleSend}
              disabled={streaming || !input.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </section>

      {/* Side column: corrections */}
      <aside className="md:w-80 flex-shrink-0 flex flex-col gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            📝 Corrections
            {analyzing && <span className="text-xs text-slate-400">analyzing…</span>}
          </h2>
          {encouragement && (
            <p className="mt-2 text-sm text-emerald-700 bg-emerald-50 rounded-md px-2 py-1">
              {encouragement}
            </p>
          )}
          <div className="mt-3 space-y-3">
            {corrections.length === 0 && !analyzing && (
              <p className="text-sm text-slate-400">
                No corrections yet — keep chatting and I&apos;ll review your Russian here.
              </p>
            )}
            {corrections.map((c, i) => (
              <CorrectionItem key={i} c={c} voice={settings?.voice} />
            ))}
          </div>
        </div>
      </aside>

      {/* Topic suggestions overlay */}
      {(topics || topicsLoading) && (
        <Overlay onClose={() => setTopics(null)} title="✨ Suggested topics">
          {topicsLoading ? (
            <p className="text-slate-500">Thinking of good topics for you…</p>
          ) : (
            <div className="space-y-3">
              <button
                onClick={() => startConversation()}
                className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50"
              >
                <div className="font-medium text-slate-800">Free chat</div>
                <div className="text-sm text-slate-500">Just start an open conversation.</div>
              </button>
              {topics?.map((t, i) => (
                <button
                  key={i}
                  onClick={() => startConversation(`${t.title} — ${t.description}`, t.openingLine)}
                  className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50"
                >
                  <div className="font-medium text-slate-800">{t.title}</div>
                  <div className="text-sm text-slate-500">{t.description}</div>
                  {t.practices?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {t.practices.map((p, j) => (
                        <span key={j} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </Overlay>
      )}

      {/* Review overlay */}
      {review && (
        <Overlay onClose={() => setReview(null)} title="Session review">
          <p className="text-slate-700">{review.summary}</p>
          {review.strengths?.length > 0 && (
            <ReviewList title="What went well 👍" items={review.strengths} />
          )}
          {review.toReview?.length > 0 && (
            <ReviewList title="Keep working on 🎯" items={review.toReview} />
          )}
          {review.nextTopics?.length > 0 && (
            <div className="mt-4">
              <h3 className="font-medium text-slate-800 mb-2">Next time, try:</h3>
              <div className="space-y-2">
                {review.nextTopics.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => startConversation(`${t.title} — ${t.description}`, t.openingLine)}
                    className="w-full text-left p-3 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50"
                  >
                    <div className="font-medium text-slate-800">{t.title}</div>
                    <div className="text-sm text-slate-500">{t.description}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={() => startConversation()}
            className="mt-4 w-full px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            Start a new conversation
          </button>
        </Overlay>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function MessageBubble({
  role,
  content,
  voice,
}: {
  role: "user" | "assistant";
  content: string;
  voice?: string;
}) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
          isUser
            ? "bg-indigo-600 text-white rounded-br-sm"
            : "bg-slate-100 text-slate-800 rounded-bl-sm"
        }`}
      >
        <div>{content}</div>
        {!isUser && content.trim() && (
          <div className="mt-1">
            <AudioButton text={stripGlosses(content)} voice={voice} />
          </div>
        )}
      </div>
    </div>
  );
}

function CorrectionItem({ c, voice }: { c: AnalysisCorrection; voice?: string }) {
  return (
    <div className="text-sm border-l-2 border-indigo-300 pl-2">
      <div className="text-red-600 line-through">{c.original}</div>
      <div className="text-emerald-700 flex items-center gap-2">
        {c.corrected}
        <AudioButton text={c.corrected} voice={voice} />
      </div>
      {c.explanation && <div className="text-slate-600 mt-0.5">{c.explanation}</div>}
      {c.concept && (
        <span className="inline-block mt-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
          {c.concept}
        </span>
      )}
    </div>
  );
}

function Onboarding({
  hasApiKey,
  onDone,
}: {
  hasApiKey: boolean;
  onDone: (level: Level) => void;
}) {
  const levels: { key: Level; label: string; blurb: string }[] = [
    { key: "beginner", label: "Beginner", blurb: "Know the alphabet & basics." },
    { key: "intermediate", label: "Intermediate", blurb: "Can hold simple chats." },
    { key: "advanced", label: "Advanced", blurb: "Fairly fluent, refining nuance." },
  ];
  return (
    <div className="mx-auto max-w-lg p-6 mt-10">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h1 className="text-xl font-semibold text-slate-800">Welcome! 🇷🇺</h1>
        <p className="text-slate-600 mt-1 text-sm">
          Chat in Russian with a friendly tutor. It tracks the words you&apos;re
          learning, notices what you forget, corrects your mistakes afterwards, and
          suggests topics to practice your weak spots.
        </p>
        {!hasApiKey && (
          <div className="mt-3 bg-amber-50 text-amber-800 text-sm px-3 py-2 rounded-md">
            Heads up: no <code>OPENAI_API_KEY</code> detected. Add it to{" "}
            <code>.env</code> and restart, or audio/chat won&apos;t work.
          </div>
        )}
        <h2 className="mt-5 font-medium text-slate-700">Pick your level:</h2>
        <div className="mt-2 grid gap-2">
          {levels.map((l) => (
            <button
              key={l.key}
              onClick={() => onDone(l.key)}
              className="text-left p-3 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50"
            >
              <div className="font-medium text-slate-800">{l.label}</div>
              <div className="text-sm text-slate-500">{l.blurb}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Overlay({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-20 bg-black/30 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ReviewList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="mt-3">
      <h3 className="font-medium text-slate-800">{title}</h3>
      <ul className="mt-1 list-disc list-inside text-sm text-slate-600 space-y-0.5">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

/** Remove inline English glosses like «word (gloss)» before sending to TTS. */
function stripGlosses(text: string): string {
  return text.replace(/\s*\([^)]*\)/g, "").replace(/[«»]/g, "").trim();
}
