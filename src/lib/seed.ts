import { prisma } from "./prisma";

// A small set of high-frequency beginner words to give the tracker a starting
// point. They're seeded as NEW and due immediately so they surface for practice.
const STARTER_WORDS: {
  lemma: string;
  translation: string;
  transliteration: string;
  partOfSpeech: string;
}[] = [
  { lemma: "привет", translation: "hi / hello", transliteration: "privet", partOfSpeech: "interjection" },
  { lemma: "спасибо", translation: "thank you", transliteration: "spasibo", partOfSpeech: "interjection" },
  { lemma: "пожалуйста", translation: "please / you're welcome", transliteration: "pozhaluysta", partOfSpeech: "interjection" },
  { lemma: "да", translation: "yes", transliteration: "da", partOfSpeech: "particle" },
  { lemma: "нет", translation: "no", transliteration: "net", partOfSpeech: "particle" },
  { lemma: "как", translation: "how", transliteration: "kak", partOfSpeech: "adverb" },
  { lemma: "хорошо", translation: "good / well", transliteration: "khorosho", partOfSpeech: "adverb" },
  { lemma: "друг", translation: "friend", transliteration: "drug", partOfSpeech: "noun" },
  { lemma: "дом", translation: "house / home", transliteration: "dom", partOfSpeech: "noun" },
  { lemma: "вода", translation: "water", transliteration: "voda", partOfSpeech: "noun" },
  { lemma: "книга", translation: "book", transliteration: "kniga", partOfSpeech: "noun" },
  { lemma: "день", translation: "day", transliteration: "den'", partOfSpeech: "noun" },
  { lemma: "хотеть", translation: "to want", transliteration: "khotet'", partOfSpeech: "verb" },
  { lemma: "говорить", translation: "to speak / to say", transliteration: "govorit'", partOfSpeech: "verb" },
  { lemma: "знать", translation: "to know", transliteration: "znat'", partOfSpeech: "verb" },
];

/** Seed starter words if the vocabulary table is empty. Returns count added. */
export async function seedStarterWordsIfEmpty(): Promise<number> {
  const count = await prisma.word.count();
  if (count > 0) return 0;
  const now = new Date();
  await prisma.word.createMany({
    data: STARTER_WORDS.map((w) => ({
      ...w,
      status: "NEW",
      dueAt: now,
    })),
  });
  return STARTER_WORDS.length;
}
