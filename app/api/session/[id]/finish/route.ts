import type { NextRequest } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { normalizeQuestion } from "@/lib/normalize";
import { db } from "@/lib/supabase";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { id: sessionId } = await params;

    const { data: session } = await db()
      .from("sessions")
      .select("id,mode,question_ids,finished_at")
      .eq("id", sessionId)
      .eq("user_email", user.email)
      .maybeSingle();

    if (!session) throw new ApiError(404, "Session not found.");

    const { data: attempts, error } = await db()
      .from("attempts")
      .select("question_id,user_answer,correct,quality")
      .eq("session_id", sessionId)
      .eq("user_email", user.email);

    if (error) throw error;

    const objective = (attempts ?? []).filter((a) => a.correct !== null);
    const score = objective.filter((a) => a.correct).length;
    const total = objective.length;

    if (!session.finished_at) {
      await db()
        .from("sessions")
        .update({ finished_at: new Date().toISOString(), score, total })
        .eq("id", sessionId)
        .eq("user_email", user.email);
    }

    const questionIds = Array.isArray(session.question_ids) ? (session.question_ids as string[]) : [];

    const { data: rows } = await db()
      .from("questions")
      .select(
        "id,document_id,topic_id,type,question,options,answer,unit,tolerance_pct,solution,explanation,trap,source,difficulty,page_start,page_end,figure_ids,topics(label)",
      )
      .in("id", questionIds);

    const attemptByQuestion = new Map((attempts ?? []).map((a) => [String(a.question_id), a]));

    const review = (rows ?? []).map((row) => {
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

      const attempt = attemptByQuestion.get(row.id);

      return {
        question,
        userAnswer: attempt?.user_answer ?? "",
        correct: attempt?.correct ?? null,
      };
    });

    return { score, total, review };
  });
}
