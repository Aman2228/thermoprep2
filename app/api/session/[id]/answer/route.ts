import type { NextRequest } from "next/server";
import { handle, readJson, requireUser } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { normalizeQuestion } from "@/lib/normalize";
import { gradeAnswer, persistAnswer } from "@/lib/quiz-engine";
import { db } from "@/lib/supabase";

export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { id: sessionId } = await params;
    const body = await readJson(req);

    const questionId = typeof body.questionId === "string" ? body.questionId : "";
    const userAnswer = typeof body.answer === "string" ? body.answer.slice(0, 1000) : "";
    const timeMs = Number.isFinite(Number(body.timeMs)) ? Number(body.timeMs) : undefined;

    if (!questionId) throw new ApiError(400, "questionId is required.");

    const { data: session } = await db()
      .from("sessions")
      .select("id,mode,level,question_ids,finished_at")
      .eq("id", sessionId)
      .eq("user_email", user.email)
      .maybeSingle();

    if (!session) throw new ApiError(404, "Session not found.");
    if (session.finished_at) throw new ApiError(400, "This session has already been finished.");

    const questionIds = Array.isArray(session.question_ids) ? (session.question_ids as string[]) : [];
    if (!questionIds.includes(questionId)) throw new ApiError(400, "That question is not part of this session.");

    const { data: row, error } = await db()
      .from("questions")
      .select(
        "id,document_id,topic_id,type,question,options,answer,unit,tolerance_pct,solution,explanation,trap,source,difficulty,page_start,page_end,figure_ids,topics(label)",
      )
      .eq("id", questionId)
      .eq("user_email", user.email)
      .maybeSingle();

    if (error) throw error;
    if (!row) throw new ApiError(404, "Question not found.");

    const question = normalizeQuestion(
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
        topicLabel: (row as unknown as { topics?: { label?: string } }).topics?.label ?? "",
        documentId: row.document_id,
        pageStart: row.page_start,
        pageEnd: row.page_end,
        figureIds: Array.isArray(row.figure_ids) ? (row.figure_ids as string[]) : [],
      },
    );

    const graded = await gradeAnswer(user.email, question, userAnswer, timeMs, String(session.level));
    await persistAnswer(user.email, sessionId, question, userAnswer, graded, timeMs);

    const isMock = session.mode === "mock";

    return {
      correct: isMock ? null : graded.correct,
      quality: isMock ? null : graded.quality,
      feedback: isMock ? undefined : graded.feedback,
      revealed: isMock
        ? null
        : {
            answer: question.answer,
            solution: question.solution,
            explanation: question.explanation,
            trap: question.trap,
            source: question.source,
            figureIds: question.figureIds,
          },
    };
  });
}
