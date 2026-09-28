import { CHUNK_MIN_CHARS, CHUNK_OVERLAP_CHARS, CHUNK_TARGET_CHARS } from "@/lib/constants";

/**
 * v1 flattened every page into one giant string and cut it every ~1200 characters,
 * ignoring section structure entirely — a chunk could start mid-sentence and
 * straddle two unrelated topics, and "topic" for a quiz was just whatever the user
 * typed into a text box.
 *
 * v2 is structure-aware:
 *   1. Lines with an unusually large font size (relative to the page's body text)
 *      or a numbered-heading shape ("5.3 Rankine Cycle") are treated as section
 *      headings — the client sends font size per line from pdf.js's text content.
 *   2. Text is grouped into sections under their nearest heading, then each
 *      section is split into overlapping chunks *only* on sentence boundaries.
 *   3. Every chunk remembers its section heading, which becomes an auto-detected
 *      "topic" the app can list and schedule reviews for, instead of a free-text box.
 */

export interface ExtractedLine {
  text: string;
  /** Font size in PDF points, as reported by pdf.js. */
  size: number;
}

export interface ExtractedPage {
  pageNumber: number;
  lines: ExtractedLine[];
  isScanned: boolean;
}

export interface FigureRef {
  page: number;
  caption: string;
}

export interface Chunk {
  content: string;
  pageStart: number;
  pageEnd: number;
  sectionTitle: string;
  topicKey: string;
  figures: FigureRef[];
}

export interface TopicSummary {
  key: string;
  label: string;
  firstPage: number;
  chunkCount: number;
}

export const collapse = (text: string) => text.replace(/\s+/g, " ").trim();

const CAPTION_LINE = /^(fig(?:ure|\.)?)\.?\s*(\d+(?:[.\-–]\d+)*[a-z]?)\s*[:.\-–)]*\s*(.{3,})$/i;

export function extractCaption(line: string): string | null {
  const match = collapse(line).match(CAPTION_LINE);
  if (!match) return null;
  return `Fig. ${match[2]} ${match[3]}`.slice(0, 140);
}

const NUMBERED_HEADING = /^(?:chapter|section|unit|module)?\s*\d+(?:\.\d+){0,3}\s+[A-Z][\w].{2,90}$/;
const ALL_CAPS_HEADING = /^[A-Z][A-Z0-9 .,'&\-:]{4,70}$/;

function looksLikeHeading(text: string, size: number, bodySize: number): boolean {
  const trimmed = collapse(text);
  if (!trimmed || trimmed.length > 90) return false;
  if (extractCaption(trimmed)) return false; // captions aren't headings

  const bigEnough = bodySize > 0 && size >= bodySize * 1.15 && size > 0;
  const numbered = NUMBERED_HEADING.test(trimmed);
  const shouty = ALL_CAPS_HEADING.test(trimmed) && trimmed.split(" ").length <= 10;

  // A short, non-terminal-punctuation line in a larger font is very likely a heading.
  const shortAndBig = bigEnough && !/[.,;]$/.test(trimmed);

  return numbered || shouty || shortAndBig;
}

function normalizeTopicKey(label: string): string {
  return collapse(label)
    .toLowerCase()
    .replace(/^(?:chapter|section|unit|module)\s*/i, "")
    .replace(/^\d+(?:\.\d+){0,3}\s*/, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

function bodyFontSize(pages: ExtractedPage[]): number {
  const counts = new Map<number, number>();

  for (const page of pages) {
    for (const line of page.lines) {
      const rounded = Math.round(line.size);
      if (rounded <= 0) continue;
      counts.set(rounded, (counts.get(rounded) ?? 0) + line.text.length);
    }
  }

  let best = 0;
  let bestWeight = -1;

  for (const [size, weight] of counts) {
    if (weight > bestWeight) {
      best = size;
      bestWeight = weight;
    }
  }

  return best;
}

/** Split into sentences without cutting "Fig. 5.3", "e.g.", "3.5 kg", initials, etc. */
const ABBREVIATIONS = new Set([
  "fig",
  "eq",
  "eqn",
  "e.g",
  "i.e",
  "etc",
  "vs",
  "no",
  "approx",
  "ref",
  "ch",
  "sec",
  "eqs",
  "figs",
  "vol",
  "cf",
]);

export function splitSentences(text: string): string[] {
  const raw = text.split(/(?<=[.?!])\s+(?=[A-Z0-9(])/);
  const sentences: string[] = [];

  for (const piece of raw) {
    const prev = sentences[sentences.length - 1];
    const lastWord = prev?.trim().split(/\s+/).pop()?.replace(/[^a-zA-Z.]/g, "");
    const lastToken = lastWord?.replace(/\.$/, "").toLowerCase();

    const isAbbrevBreak =
      prev &&
      lastToken &&
      (ABBREVIATIONS.has(lastToken) || /^\d+$/.test(lastToken) || /^[a-zA-Z]$/.test(lastToken));

    if (isAbbrevBreak) {
      sentences[sentences.length - 1] = `${prev} ${piece}`;
    } else {
      sentences.push(piece);
    }
  }

  return sentences.map(collapse).filter(Boolean);
}

interface SentenceUnit {
  text: string;
  page: number;
}

interface Section {
  title: string;
  topicKey: string;
  sentences: SentenceUnit[];
  captions: FigureRef[];
}

function packSection(section: Section, target: number, overlap: number, minLength: number): Chunk[] {
  const chunks: Chunk[] = [];
  let i = 0;

  while (i < section.sentences.length) {
    let length = 0;
    let j = i;
    const parts: SentenceUnit[] = [];

    while (j < section.sentences.length && (length < target || parts.length === 0)) {
      const s = section.sentences[j];
      parts.push(s);
      length += s.text.length + 1;
      j += 1;
    }

    const content = parts.map((p) => p.text).join(" ").trim();
    const pageStart = parts[0].page;
    const pageEnd = parts[parts.length - 1].page;

    if (content.length >= minLength || chunks.length === 0) {
      chunks.push({
        content,
        pageStart,
        pageEnd,
        sectionTitle: section.title,
        topicKey: section.topicKey,
        figures: section.captions.filter((c) => c.page >= pageStart && c.page <= pageEnd),
      });
    } else if (chunks.length > 0) {
      // Too short to stand alone: fold into the previous chunk.
      const prev = chunks[chunks.length - 1];
      prev.content = `${prev.content} ${content}`.trim();
      prev.pageEnd = Math.max(prev.pageEnd, pageEnd);
    }

    if (j >= section.sentences.length) break;

    // Step back a little for overlap, but always make forward progress.
    let back = 0;
    let k = j - 1;
    while (k > i && back < overlap) {
      back += section.sentences[k].text.length + 1;
      k -= 1;
    }

    i = Math.max(i + 1, k + 1);
  }

  return chunks;
}

export interface ChunkResult {
  chunks: Chunk[];
  topics: TopicSummary[];
}

export function chunkDocument(pages: ExtractedPage[]): ChunkResult {
  const bodySize = bodyFontSize(pages);
  const sections: Section[] = [{ title: "Introduction", topicKey: "introduction", sentences: [], captions: [] }];

  const seenTopicLabels = new Map<string, string>(); // key -> first-seen display label

  for (const page of pages) {
    if (page.isScanned) continue;

    let buffer: string[] = [];

    const flushBuffer = () => {
      if (buffer.length === 0) return;
      const text = collapse(buffer.join(" "));
      buffer = [];
      if (!text) return;

      for (const sentence of splitSentences(text)) {
        sections[sections.length - 1].sentences.push({ text: sentence, page: page.pageNumber });
      }
    };

    for (const line of page.lines) {
      const caption = extractCaption(line.text);
      if (caption) {
        flushBuffer();
        sections[sections.length - 1].captions.push({ page: page.pageNumber, caption });
        continue;
      }

      if (looksLikeHeading(line.text, line.size, bodySize)) {
        flushBuffer();
        const title = collapse(line.text).slice(0, 100);
        const key = normalizeTopicKey(title) || title.toLowerCase();

        if (!seenTopicLabels.has(key)) seenTopicLabels.set(key, title);

        sections.push({ title: seenTopicLabels.get(key) ?? title, topicKey: key, sentences: [], captions: [] });
        continue;
      }

      buffer.push(line.text);
    }

    flushBuffer();
  }

  const chunks = sections
    .filter((s) => s.sentences.length > 0)
    .flatMap((s) => packSection(s, CHUNK_TARGET_CHARS, CHUNK_OVERLAP_CHARS, CHUNK_MIN_CHARS));

  const topicOrder: TopicSummary[] = [];
  const topicIndex = new Map<string, TopicSummary>();

  for (const chunk of chunks) {
    let summary = topicIndex.get(chunk.topicKey);

    if (!summary) {
      summary = { key: chunk.topicKey, label: chunk.sectionTitle, firstPage: chunk.pageStart, chunkCount: 0 };
      topicIndex.set(chunk.topicKey, summary);
      topicOrder.push(summary);
    }

    summary.chunkCount += 1;
  }

  return { chunks, topics: topicOrder };
}
