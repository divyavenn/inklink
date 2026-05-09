import nlp from 'compromise';
import { countWords } from '../content/line-normalize';

export interface ChapterStats {
  wordCount: number;
  sentenceCount: number;
  avgSentenceLength: number;
  sentenceLengthVariance: number;
  paragraphCount: number;
  avgParagraphLength: number;
  paragraphLengthVariance: number;
  readingLevel: number;
  topVerbs: { word: string; count: number }[];
  topAdjectives: { word: string; count: number }[];
  sentences: { text: string; words: number }[];
  paragraphs: { text: string; words: number }[];
}

// Stopwords filtered from "top verbs/adjectives" — common literary throwaways
// where the raw count is uninformative ("said" dominates every chapter).
const VERB_STOPWORDS = new Set([
  'be', 'is', 'are', 'was', 'were', 'been', 'being', 'am',
  'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing',
  'say', 'said', 'says',
  'go', 'goes', 'went', 'gone', 'going',
  'get', 'got', 'gotten', 'getting',
  'make', 'made', 'making',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
]);

const ADJECTIVE_STOPWORDS = new Set([
  'other', 'such', 'same', 'own', 'own', 'few', 'more', 'most', 'much',
  'many', 'some', 'any', 'all', 'every', 'each',
]);

function stripMarkdownToText(rawMarkdown: string): string {
  // Remove fenced code blocks first so their contents don't leak through.
  let text = rawMarkdown.replace(/```[\s\S]*?```/g, '');
  // Inline code.
  text = text.replace(/`[^`]*`/g, '');
  // Images & links — keep the link/alt text.
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // Strip emphasis markers.
  text = text.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1');
  // Strip ATX headings, blockquote markers, list bullets, hr.
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/^>\s?/gm, '');
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');
  text = text.replace(/^\s*[-*_]{3,}\s*$/gm, '');
  // HTML tags (some chapters embed raw html).
  text = text.replace(/<[^>]+>/g, '');
  return text;
}

function splitParagraphs(plainText: string): string[] {
  return plainText
    .split(/\n\s*\n+/)
    .map(p => p.replace(/\s+/g, ' ').trim())
    .filter(p => p.length > 0);
}

// Sentence splitter: split on terminal punctuation followed by whitespace.
// Avoids splitting on common abbreviations (Mr., Mrs., Dr., etc.).
const ABBREV = new Set([
  'mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'prof', 'rev',
  'vs', 'etc', 'e.g', 'i.e', 'ave', 'blvd', 'ft', 'in',
]);

function splitSentences(paragraph: string): string[] {
  const out: string[] = [];
  let buf = '';
  const tokens = paragraph.split(/(\s+)/);
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    buf += tok;
    if (/[.!?]["')\]]*$/.test(tok)) {
      const lastWord = tok.replace(/[.!?"')\]]+$/, '').toLowerCase();
      if (ABBREV.has(lastWord)) continue;
      const trimmed = buf.trim();
      if (trimmed.length > 0) out.push(trimmed);
      buf = '';
    }
  }
  const tail = buf.trim();
  if (tail.length > 0) out.push(tail);
  return out;
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  let stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  stripped = stripped.replace(/^y/, '');
  const groups = stripped.match(/[aeiouy]+/g);
  return groups ? groups.length : 1;
}

function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sq = values.reduce((acc, v) => acc + (v - mean) ** 2, 0);
  return sq / (values.length - 1);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function tally(words: string[], stopwords: Set<string>): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  const order = new Map<string, number>();
  for (let i = 0; i < words.length; i++) {
    const raw = words[i].toLowerCase().replace(/[^a-z'-]/g, '').trim();
    if (raw.length < 2) continue;
    if (stopwords.has(raw)) continue;
    counts.set(raw, (counts.get(raw) ?? 0) + 1);
    if (!order.has(raw)) order.set(raw, i);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || (order.get(a[0])! - order.get(b[0])!))
    .slice(0, 3)
    .map(([word, count]) => ({ word, count }));
}

export function computeChapterStats(rawMarkdown: string): ChapterStats {
  const plain = stripMarkdownToText(rawMarkdown);
  const paragraphTexts = splitParagraphs(plain);

  const paragraphs = paragraphTexts.map(text => ({ text, words: countWords(text) }));
  const sentences: { text: string; words: number }[] = [];
  for (const p of paragraphTexts) {
    for (const s of splitSentences(p)) {
      sentences.push({ text: s, words: countWords(s) });
    }
  }

  const sentenceWordCounts = sentences.map(s => s.words);
  const paragraphWordCounts = paragraphs.map(p => p.words);
  const wordCount = sentenceWordCounts.reduce((a, b) => a + b, 0);
  const sentenceCount = sentences.length;
  const paragraphCount = paragraphs.length;

  const avgSentenceLength = sentenceCount > 0 ? wordCount / sentenceCount : 0;
  const avgParagraphLength = paragraphCount > 0 ? wordCount / paragraphCount : 0;

  // Reading level — Flesch-Kincaid Grade.
  let totalSyllables = 0;
  for (const s of sentences) {
    for (const w of s.text.split(/\s+/)) totalSyllables += countSyllables(w);
  }
  const readingLevel = sentenceCount > 0 && wordCount > 0
    ? 0.39 * (wordCount / sentenceCount) + 11.8 * (totalSyllables / wordCount) - 15.59
    : 0;

  // POS tagging via compromise.
  const doc = nlp(plain);
  const verbs: string[] = doc.verbs().toInfinitive().out('array');
  const adjectives: string[] = doc.adjectives().out('array');

  return {
    wordCount,
    sentenceCount,
    avgSentenceLength: round1(avgSentenceLength),
    sentenceLengthVariance: round1(variance(sentenceWordCounts)),
    paragraphCount,
    avgParagraphLength: round1(avgParagraphLength),
    paragraphLengthVariance: round1(variance(paragraphWordCounts)),
    readingLevel: round1(readingLevel),
    topVerbs: tally(verbs, VERB_STOPWORDS),
    topAdjectives: tally(adjectives, ADJECTIVE_STOPWORDS),
    sentences,
    paragraphs,
  };
}
