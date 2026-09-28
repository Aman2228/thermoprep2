/** Shared constants (safe to import from both server and client code). */

/** Must match the vector(768) column in Supabase. */
export const EMBED_DIMENSIONS = 768;

/** Bump when chunking / embedding logic changes so stale documents get re-processed. */
export const PIPELINE_VERSION = "v2";

export const LEVELS = [
  { value: "Fundamentals", hint: "Strong BTech fundamentals" },
  { value: "GATE / ESE", hint: "GATE-difficult / ESE conventional" },
  { value: "MTech / IITD", hint: "Multi-concept, trap-based, non-routine" },
  { value: "Placement interview", hint: "Core placement / oral exam reasoning" },
] as const;

export const LEARN_STYLES = [
  "Derivation heavy",
  "Numerical focus",
  "Conceptual traps",
  "Quick revision",
] as const;

export const QUESTION_KINDS = [
  { value: "mixed", label: "Mixed" },
  { value: "mcq", label: "MCQ (single correct)" },
  { value: "multi", label: "Multi-correct" },
  { value: "integer", label: "Integer type" },
  { value: "numerical", label: "Numerical" },
  { value: "assertion", label: "Assertion-Reason" },
  { value: "short", label: "Short answer" },
] as const;

export const MAX_QUESTIONS_PRACTICE = 12;
export const MAX_QUESTIONS_MOCK = 30;

/** Chunking targets (approx. characters, not tokens — good enough for splitting prose). */
export const CHUNK_TARGET_CHARS = 1100;
export const CHUNK_OVERLAP_CHARS = 160;
export const CHUNK_MIN_CHARS = 150;

/** Processing guardrails. */
export const MAX_PDF_PAGES = 700;
export const MAX_CHUNKS_PER_DOCUMENT = 1200;
export const MAX_FIGURES_PER_DOCUMENT = 60;
export const MAX_FIGURE_BYTES = 220_000; // per stored (compressed) image, roughly

/** A page is treated as scanned/image-only when it has fewer selectable characters than this. */
export const SCANNED_PAGE_CHAR_THRESHOLD = 40;

/** SM-2 style spaced repetition defaults. */
export const SRS_DEFAULT_EASE = 2.5;
export const SRS_MIN_EASE = 1.3;

export const SESSION_TARGET_SIZE = 8;
