"use client";

import { useEffect, useMemo, useState } from "react";
import AudioButton from "./AudioButton";

interface Word {
  id: number;
  lemma: string;
  translation: string;
  transliteration: string | null;
  partOfSpeech: string | null;
  status: string;
  dueAt: string;
  exposureCount: number;
  correctCount: number;
  incorrectCount: number;
}
interface Concept {
  id: number;
  name: string;
  category: string;
  masteryScore: number;
  errorCount: number;
  practiceCount: number;
}
interface Mistake {
  id: number;
  original: string;
  correction: string;
  explanation: string | null;
  createdAt: string;
  concept: { name: string } | null;
}
interface DashboardData {
  stats: {
    totalWords: number;
    dueCount: number;
    learning: number;
    known: number;
    struggling: number;
    new: number;
    totalConcepts: number;
  };
  words: Word[];
  concepts: Concept[];
  recentMistakes: Mistake[];
}

const FILTERS = ["all", "due", "struggling", "learning", "known", "new"] as const;
type Filter = (typeof FILTERS)[number];

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dashboard");
        setData(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const now = Date.now();
  const filteredWords = useMemo(() => {
    if (!data) return [];
    return data.words.filter((w) => {
      switch (filter) {
        case "all":
          return true;
        case "due":
          return new Date(w.dueAt).getTime() <= now;
        case "struggling":
          return w.status === "STRUGGLING";
        case "learning":
          return w.status === "LEARNING";
        case "known":
          return w.status === "KNOWN";
        case "new":
          return w.status === "NEW";
      }
    });
  }, [data, filter, now]);

  if (loading) {
    return <div className="mx-auto max-w-5xl p-6 text-slate-500">Loading…</div>;
  }
  if (!data) {
    return <div className="mx-auto max-w-5xl p-6 text-red-600">Failed to load.</div>;
  }

  const s = data.stats;

  return (
    <div className="mx-auto max-w-5xl w-full p-4 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        <Stat label="Words" value={s.totalWords} />
        <Stat label="Due now" value={s.dueCount} accent="amber" />
        <Stat label="Learning" value={s.learning} accent="indigo" />
        <Stat label="Struggling" value={s.struggling} accent="red" />
        <Stat label="Known" value={s.known} accent="emerald" />
        <Stat label="Concepts" value={s.totalConcepts} />
      </div>

      {/* Vocabulary */}
      <section className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between flex-wrap gap-2 p-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Vocabulary</h2>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-2.5 py-1 rounded-full capitalize ${
                  filter === f
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        {filteredWords.length === 0 ? (
          <p className="p-4 text-sm text-slate-400">No words in this view yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-2 font-medium">Word</th>
                  <th className="px-4 py-2 font-medium">Translation</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Accuracy</th>
                  <th className="px-4 py-2 font-medium">Next review</th>
                </tr>
              </thead>
              <tbody>
                {filteredWords.map((w) => (
                  <tr key={w.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{w.lemma}</span>
                        <AudioButton text={w.lemma} />
                      </div>
                      {w.transliteration && (
                        <div className="text-xs text-slate-400">{w.transliteration}</div>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{w.translation}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={w.status} />
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {w.exposureCount > 0
                        ? `${Math.round((w.correctCount / w.exposureCount) * 100)}% (${w.exposureCount})`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{relTime(w.dueAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Concepts */}
      <section className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="font-semibold text-slate-800 mb-3">Grammar concepts</h2>
        {data.concepts.length === 0 ? (
          <p className="text-sm text-slate-400">
            None tracked yet — they appear as you chat and make mistakes.
          </p>
        ) : (
          <div className="space-y-2">
            {data.concepts.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <div className="w-40 shrink-0 text-sm text-slate-700 truncate" title={c.name}>
                  {c.name}
                </div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500"
                    style={{ width: `${Math.round(c.masteryScore * 100)}%` }}
                  />
                </div>
                <div className="w-24 text-right text-xs text-slate-400">
                  {Math.round(c.masteryScore * 100)}% · {c.errorCount} err
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent mistakes */}
      <section className="bg-white rounded-xl border border-slate-200 p-4">
        <h2 className="font-semibold text-slate-800 mb-3">Recent corrections</h2>
        {data.recentMistakes.length === 0 ? (
          <p className="text-sm text-slate-400">No corrections logged yet.</p>
        ) : (
          <ul className="space-y-3">
            {data.recentMistakes.map((m) => (
              <li key={m.id} className="text-sm border-l-2 border-indigo-200 pl-3">
                <span className="text-red-600 line-through">{m.original}</span>{" "}
                <span className="text-slate-400">→</span>{" "}
                <span className="text-emerald-700">{m.correction}</span>
                {m.explanation && (
                  <div className="text-slate-500">{m.explanation}</div>
                )}
                <div className="mt-0.5 flex items-center gap-2">
                  {m.concept && (
                    <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">
                      {m.concept.name}
                    </span>
                  )}
                  <span className="text-xs text-slate-400">{relTime(m.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "amber" | "indigo" | "red" | "emerald";
}) {
  const color =
    accent === "amber"
      ? "text-amber-600"
      : accent === "indigo"
      ? "text-indigo-600"
      : accent === "red"
      ? "text-red-600"
      : accent === "emerald"
      ? "text-emerald-600"
      : "text-slate-800";
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3">
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    NEW: "bg-slate-100 text-slate-600",
    LEARNING: "bg-indigo-50 text-indigo-700",
    KNOWN: "bg-emerald-50 text-emerald-700",
    STRUGGLING: "bg-red-50 text-red-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${map[status] || map.NEW}`}>
      {status.toLowerCase()}
    </span>
  );
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = t - Date.now();
  const abs = Math.abs(diff);
  const day = 24 * 60 * 60 * 1000;
  const hour = 60 * 60 * 1000;
  if (diff <= 0) return "due now";
  if (abs < hour) return `${Math.round(abs / (60 * 1000))} min`;
  if (abs < day) return `${Math.round(abs / hour)} h`;
  return `${Math.round(abs / day)} d`;
}
