import { generateJson } from "@/lib/ai";
import { ApiError } from "@/lib/errors";
import { normalizeQuestion } from "@/lib/normalize";
import { buildGradePrompt, buildQuizPrompt } from "@/lib/prompts";
import { retrieveContext } from "@/lib/retrieval";
import { isObjective, evaluateObjective } from "@/lib/scoring";
import { gradeReview, initialReviewState, isDue, qualityFromResult, qualityFromScore, updateMastery } from "@/lib/srs";
import { db } from "@/lib/supabase";
import type { Question, SessionMode } from "@/types/app";

/**
 * v1 generated a fresh batch of questions for whatever topic string the user typed
 * and scored the whole quiz once, with no memory across sessions. v2's strategy:
 *
 *   1. Every generated question is saved once to a bank (`questions`), tagged with
 *      its auto-detected topic and difficulty, and reused across sessions instead of
 *      being regenerated (and re-billed) every time.
 *   2. Each (user, question) pair gets an SM-2 review record (lib/srs.ts). A session
 *      pulls whatever is *due* first, then tops up with new questions from the
 *      user's weakest topics (lowest rolling mastery), so weak areas surface
 *      automatically instead of the student having to remember to revisit them.
 *   3. Mock tests instead sample across *all* topics proportional to their size, so
 *      coverage matches the textbook rather than whatever the student thought to ask for.
 *   4. Difficulty adapts: the AI is asked to centre new questions near the topic's
 *      current mastery rather than a fixed level.
 */

interface TopicState {
  id: string;
  label: string;
  documentId: string;
  chunkCount: number;
  mastery: number | null;
}

interface QuestionRow {
  id: string;
  document_id: string | null;
  topic_id: string | null;
  chunk_id: string | null;
  type: string;
  question: string;
  options: unknown;
  answer: string;
  unit: string | null;
  tolerance_pct: number | null;
  solution: unknown;
  explanation: string;
  trap: string;
  source: string;
  difficulty: number;
  page_start: number | null;
  page_end: number | null;
  figure_ids: unknown;
  topics?: { label: string } | null;
}

function rowToQuestion(row: QuestionRow): Question {
  return normalizeQuestion(
    {
      type: row.type,
      question: row.question,
      options: row.options,
      answer: row.answer,
      unit: row.unit ?? undefined,
      tolerancePct: row.tolerance_pct ?? undefined,
      solution: row.solution,
      explanation: row.explanation,
      trap: row.trap,
      source: row.source,
      difficulty: row.difficulty,
      id: row.id,
    },
    {
      topicId: row.topic_id,
      topicLabel: row.topics?.label ?? "",
      documentId: row.document_id,
      pageStart: row.page_start,
      pageEnd: row.page_end,
      figureIds: Array.isArray(row.figure_ids) ? (row.figure_ids as string[]) : [],
    },
  );
}

async function loadTopics(email: string, documentId?: string | null): Promise<TopicState[]> {
  let query = db().from("topics").select("id,label,document_id,chunk_count").eq("user_email", email);
  if (documentId) query = query.eq("document_id", documentId);

  const { data: topics, error } = await query;
  if (error) throw error;
  if (!topics?.length) throw new ApiError(400, "No topics found yet — process a document in Library first.");

  const { data: mastery, error: mError } = await db()
    .from("topic_mastery")
    .select("topic_id,mastery")
    .eq("user_email", email);
  if (mError) throw mError;

  const masteryMap = new Map((mastery ?? []).map((m) => [String(m.topic_id), Number(m.mastery)]));

  return topics.map((t) => ({
    id: String(t.id),
    label: String(t.label),
    documentId: String(t.document_id),
    chunkCount: Number(t.chunk_count),
    mastery: masteryMap.get(String(t.id)) ?? null,
  }));
}

function difficultyForMastery(mastery: number | null): number {
  if (mastery === null) return 2;
  return Math.max(1, Math.min(5, Math.round(1 + mastery * 4)));
}

async function fetchDueQuestions(email: string, topicIds: string[] | null, limit: number): Promise<Question[]> {
  let query = db()
    .from("question_reviews")
    .select("question_id,due_at,questions!inner(id,document_id,topic_id,chunk_id,type,question,options,answer,unit,tolerance_pct,solution,explanation,trap,source,difficulty,page_start,page_end,figure_ids,topics(label))")
    .eq("user_email", email)
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(limit);

  if (topicIds) query = query.in("questions.topic_id", topicIds);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? [])
    .map((row) => row.questions as unknown as QuestionRow)
    .filter(Boolean)
    .map(rowToQuestion);
}

async function fetchUnattemptedBankQuestions(
  email: string,
  topicId: string,
  limit: number,
): Promise<Question[]> {
  const { data: attempted, error: attemptedError } = await db()
    .from("question_reviews")
    .select("question_id")
    .eq("user_email", email);
  if (attemptedError) throw attemptedError;

  const seen = new Set((attempted ?? []).map((r) => String(r.question_id)));

  const { data, error } = await db()
    .from("questions")
    .select(
      "id,document_id,topic_id,chunk_id,type,question,options,answer,unit,tolerance_pct,solution,explanation,trap,source,difficulty,page_start,page_end,figure_ids,topics(label)",
    )
    .eq("user_email", email)
    .eq("topic_id", topicId)
    .limit(limit + seen.size);

  if (error) throw error;

  return (data ?? [])
    .filter((row) => !seen.has(String(row.id)))
    .slice(0, limit)
    .map((row) => rowToQuestion(row as unknown as QuestionRow));
}

async function generateQuestionsForTopic(
  email: string,
  topic: TopicState,
  count: number,
  level: string,
  kind: string,
  mode: string,
): Promise<Question[]> {
  const { text: context, chunkIds } = await retrieveContext(email, topic.label, {
    topicId: topic.id,
    documentId: topic.documentId,
    topK: 6,
  });

  const { data: chunkRows } = await db()
    .from("document_chunks")
    .select("id,page_start,page_end")
    .in("id", chunkIds);

  const primaryChunk = chunkRows?.[0] ?? null;

  const { system, prompt, maxOutputTokens } = buildQuizPrompt({
    topic: topic.label,
    level,
    kind,
    count,
    mode,
    context,
    targetDifficulty: difficultyForMastery(topic.mastery),
  });

  const raw = (await generateJson({ system, prompt, maxOutputTokens })) as { questions?: unknown[] };
  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : [];

  if (rawQuestions.length === 0) {
    throw new ApiError(502, "The AI did not return any usable questions. Try again.");
  }

  const { data: figures } = await db()
    .from("figures")
    .select("id")
    .eq("user_email", email)
    .eq("document_id", topic.documentId)
    .gte("page", primaryChunk?.page_start ?? 0)
    .lte("page", primaryChunk?.page_end ?? 100000)
    .limit(2);

  const figureIds = (figures ?? []).map((f) => String(f.id));

  const toInsert = rawQuestions.map((q) => {
    const question = normalizeQuestion(q, {
      topicId: topic.id,
      topicLabel: topic.label,
      documentId: topic.documentId,
      pageStart: primaryChunk?.page_start ?? null,
      pageEnd: primaryChunk?.page_end ?? null,
      figureIds,
    });

    return {
      document_id: topic.documentId,
      user_email: email,
      topic_id: topic.id,
      chunk_id: primaryChunk?.id ?? null,
      type: question.type,
      question: question.question,
      options: question.options,
      answer: question.answer,
      unit: question.unit ?? null,
      tolerance_pct: question.tolerancePct ?? null,
      solution: question.solution,
      explanation: question.explanation,
      trap: question.trap,
      source: question.source,
      difficulty: question.difficulty,
      page_start: primaryChunk?.page_start ?? null,
      page_end: primaryChunk?.page_end ?? null,
      figure_ids: figureIds,
    };
  });

  const { data: saved, error } = await db().from("questions").insert(toInsert).select(
    "id,document_id,topic_id,chunk_id,type,question,options,answer,unit,tolerance_pct,solution,explanation,trap,source,difficulty,page_start,page_end,figure_ids,topics(label)",
  );

  if (error) throw error;

  return (saved ?? []).map((row) => rowToQuestion(row as unknown as QuestionRow));
}

export interface StartSessionInput {
  mode: SessionMode;
  topicId?: string | null;
  documentId?: string | null;
  count: number;
  level: string;
  kind: string;
  timeLimitSec?: number | null;
}

export interface StartedSession {
  sessionId: string;
  mode: SessionMode;
  topicLabel: string;
  timeLimitSec: number | null;
  questions: Question[];
}

export async function startSession(email: string, input: StartSessionInput): Promise<StartedSession> {
  const topics = await loadTopics(email, input.documentId);

  if (input.mode === "topic") {
    const topic = input.topicId ? topics.find((t) => t.id === input.topicId) : topics[0];
    if (!topic) throw new ApiError(404, "Topic not found.");

    const due = await fetchDueQuestions(email, [topic.id], input.count);
    const fresh = due.length < input.count ? await fetchUnattemptedBankQuestions(email, topic.id, input.count - due.length) : [];

    let pool = [...due, ...fresh];
    if (pool.length < input.count) {
      const generated = await generateQuestionsForTopic(
        email,
        topic,
        Math.max(3, input.count - pool.length),
        input.level,
        input.kind,
        "practice",
      );
      pool = [...pool, ...generated];
    }

    const questions = pool.slice(0, input.count);
    const sessionId = await persistSession(email, "topic", topic.label, questions, null, input.level);
    return { sessionId, mode: "topic", topicLabel: topic.label, timeLimitSec: null, questions };
  }

  if (input.mode === "mock") {
    const totalWeight = topics.reduce((sum, t) => sum + t.chunkCount, 0) || 1;
    const questions: Question[] = [];

    for (const topic of topics) {
      const share = Math.max(1, Math.round((topic.chunkCount / totalWeight) * input.count));
      const existing = await fetchUnattemptedBankQuestions(email, topic.id, share);
      let pool = existing;

      if (pool.length < share) {
        const generated = await generateQuestionsForTopic(email, topic, share - pool.length, input.level, input.kind, "mock-test");
        pool = [...pool, ...generated];
      }

      questions.push(...pool.slice(0, share));
      if (questions.length >= input.count) break;
    }

    const final = questions.slice(0, input.count);
    const timeLimitSec = input.timeLimitSec ?? final.length * 90;
    const sessionId = await persistSession(email, "mock", "Full mock test", final, timeLimitSec, input.level);
    return { sessionId, mode: "mock", topicLabel: "Full mock test", timeLimitSec, questions: final };
  }

  // Adaptive: due reviews first, then top up from the weakest / never-attempted topics.
  const due = await fetchDueQuestions(email, null, input.count);
  let pool = [...due];

  if (pool.length < input.count) {
    const ranked = [...topics].sort((a, b) => (a.mastery ?? -1) - (b.mastery ?? -1));

    for (const topic of ranked) {
      if (pool.length >= input.count) break;
      const need = input.count - pool.length;
      const fresh = await fetchUnattemptedBankQuestions(email, topic.id, need);
      pool = [...pool, ...fresh];

      if (pool.length < input.count) {
        const generated = await generateQuestionsForTopic(
          email,
          topic,
          Math.min(3, input.count - pool.length),
          input.level,
          input.kind,
          "practice",
        );
        pool = [...pool, ...generated];
      }
    }
  }

  const questions = pool.slice(0, input.count);
  const sessionId = await persistSession(email, "adaptive", "Adaptive review", questions, null, input.level);
  return { sessionId, mode: "adaptive", topicLabel: "Adaptive review", timeLimitSec: null, questions };
}

async function persistSession(
  email: string,
  mode: SessionMode,
  topicLabel: string,
  questions: Question[],
  timeLimitSec: number | null,
  level: string,
): Promise<string> {
  const { data, error } = await db()
    .from("sessions")
    .insert({
      user_email: email,
      mode,
      topic_label: topicLabel,
      level,
      time_limit_sec: timeLimitSec,
      question_ids: questions.map((q) => q.id),
    })
    .select("id")
    .single();

  if (error) throw error;
  return String(data.id);
}

export interface GradedAnswer {
  correct: boolean | null;
  quality: number;
  feedback?: string;
}

export async function gradeAnswer(
  email: string,
  question: Question,
  userAnswer: string,
  timeMs: number | undefined,
  level: string,
): Promise<GradedAnswer> {
  if (isObjective(question)) {
    const correct = evaluateObjective(question, userAnswer);
    return { correct, quality: qualityFromResult(correct, timeMs) };
  }

  if (!userAnswer.trim()) {
    return { correct: false, quality: 1, feedback: "No answer given." };
  }

  const { system, prompt, maxOutputTokens } = buildGradePrompt({
    question: question.question,
    modelAnswer: question.answer,
    studentAnswer: userAnswer,
    level,
  });

  const raw = (await generateJson({ system, prompt, maxOutputTokens })) as { score?: unknown; feedback?: unknown };
  const score = Math.max(0, Math.min(1, Number(raw.score) || 0));
  const feedback = typeof raw.feedback === "string" ? raw.feedback : "";

  return { correct: score >= 0.6, quality: qualityFromScore(score), feedback };
}

export async function persistAnswer(
  email: string,
  sessionId: string,
  question: Question,
  userAnswer: string,
  graded: GradedAnswer,
  timeMs: number | undefined,
): Promise<void> {
  const now = new Date();

  const { data: existingReview } = await db()
    .from("question_reviews")
    .select("ease,interval_days,repetitions,due_at,last_quality")
    .eq("user_email", email)
    .eq("question_id", question.id)
    .maybeSingle();

  const prevState = existingReview
    ? {
        ease: Number(existingReview.ease),
        intervalDays: Number(existingReview.interval_days),
        repetitions: Number(existingReview.repetitions),
        dueAt: String(existingReview.due_at),
        lastQuality: existingReview.last_quality === null ? null : Number(existingReview.last_quality),
      }
    : initialReviewState(now);

  const nextState = gradeReview(prevState, graded.quality, now);

  const { error: reviewError } = await db()
    .from("question_reviews")
    .upsert(
      {
        user_email: email,
        question_id: question.id,
        ease: nextState.ease,
        interval_days: nextState.intervalDays,
        repetitions: nextState.repetitions,
        due_at: nextState.dueAt,
        last_quality: nextState.lastQuality,
        updated_at: now.toISOString(),
      },
      { onConflict: "user_email,question_id" },
    );

  if (reviewError) throw reviewError;

  if (question.topicId) {
    const { data: masteryRow } = await db()
      .from("topic_mastery")
      .select("mastery,attempts")
      .eq("user_email", email)
      .eq("topic_id", question.topicId)
      .maybeSingle();

    const nextMastery = updateMastery(masteryRow ? Number(masteryRow.mastery) : null, graded.quality);

    const { error: masteryError } = await db()
      .from("topic_mastery")
      .upsert(
        {
          user_email: email,
          topic_id: question.topicId,
          mastery: nextMastery,
          attempts: (masteryRow?.attempts ?? 0) + 1,
          updated_at: now.toISOString(),
        },
        { onConflict: "user_email,topic_id" },
      );

    if (masteryError) throw masteryError;
  }

  const { error: attemptError } = await db().from("attempts").insert({
    user_email: email,
    session_id: sessionId,
    question_id: question.id,
    user_answer: userAnswer.slice(0, 1000),
    correct: graded.correct,
    quality: graded.quality,
    time_ms: timeMs ?? null,
  });

  if (attemptError) throw attemptError;
}

export function isReviewDue(dueAt: string): boolean {
  return isDue({ dueAt });
}
