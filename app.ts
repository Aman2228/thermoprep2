export type QuestionType =
  | "mcq"
  | "multi"
  | "integer"
  | "numerical"
  | "assertion"
  | "short"
  | "derivation"
  | "interview";

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export interface Question {
  id: string;
  type: QuestionType;
  question: string;
  /** Option texts without "A)" prefixes; letters are added when rendering. */
  options: string[];
  /** mcq/assertion: "B" · multi: "A,C" · integer: "4" · numerical: "3.25" · others: model answer. */
  answer: string;
  unit?: string;
  tolerancePct?: number;
  solution: string[];
  explanation: string;
  trap: string;
  source: string;
  topicId: string | null;
  topicLabel: string;
  difficulty: Difficulty;
  documentId: string | null;
  pageStart: number | null;
  pageEnd: number | null;
  figureIds: string[];
}

/** A retrieved textbook passage, with its real page numbers. */
export interface SourceRef {
  index: number;
  documentId: string;
  title: string;
  pageStart: number | null;
  pageEnd: number | null;
  similarity: number;
  preview: string;
  topicLabel: string;
  figureIds: string[];
}

export interface FigureRecord {
  id: string;
  documentId: string;
  documentTitle: string;
  page: number;
  kind: "embedded" | "full-page";
  caption: string;
  ocrText: string | null;
  imageDataUrl: string;
}

export interface CommonsImage {
  title: string;
  thumbUrl: string;
  fullUrl: string;
  pageUrl: string;
  license: string;
  artist: string;
}

export interface DocumentRow {
  id: string;
  title: string;
  status: "uploading" | "extracting" | "chunking" | "embedding" | "processed" | "failed";
  page_count: number | null;
  scanned_page_count: number | null;
  chunk_count: number | null;
  figure_count: number | null;
  topic_count: number | null;
  embedding_model: string | null;
  created_at: string;
}

export interface TopicRow {
  id: string;
  document_id: string;
  document_title: string;
  label: string;
  chunk_count: number;
  question_bank_count: number;
  mastery: number; // 0..1, rolling estimate from review history
  due_count: number; // reviews due now
  new_count: number; // never attempted
}

export interface EvaluatedAnswer {
  questionId: string;
  userAnswer: string;
  expected: string;
  correct: boolean | null;
  /** 0..5 SM-2 style quality grade derived from correctness + partial credit. */
  quality: number;
  feedback?: string;
}

export type SessionMode = "adaptive" | "topic" | "mock";

export interface SessionMeta {
  id: string;
  mode: SessionMode;
  topicLabel: string;
  createdAt: string;
  timeLimitSec: number | null;
}

export interface Equation {
  latex: string;
  meaning: string;
  units: string;
  validity: string;
}

export interface LearningContent {
  topic: string;
  sourceNote: string;
  overview: string;
  firstPrinciples: string;
  equations: Equation[];
  derivation: { goal: string; steps: string[]; result: string } | null;
  intuition: string;
  limitingCases: { case: string; result: string }[];
  traps: string[];
  example: { problem: string; steps: string[]; answer: string } | null;
  applications: string[];
  nextTopics: string[];
  figureQueries: string[];
}

export interface StatsSummary {
  documents: number;
  processedDocuments: number;
  dueToday: number;
  masteredTopics: number;
  weakTopics: { label: string; mastery: number }[];
  streakDays: number;
  averageAccuracy: number;
  attempts30d: number;
}
