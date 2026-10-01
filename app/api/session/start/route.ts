import type { NextRequest } from "next/server";
import { clampInt, cleanText, enforceGenerationQuota, handle, logGeneration, readJson, requireUser } from "@/lib/api";
import { MAX_QUESTIONS_MOCK, MAX_QUESTIONS_PRACTICE, SESSION_TARGET_SIZE } from "@/lib/constants";
import { ApiError } from "@/lib/errors";
import { startSession } from "@/lib/quiz-engine";
import { stripSolution } from "@/lib/normalize";
import type { SessionMode } from "@/types/app";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    const body = await readJson(req);

    const mode = (cleanText(body.mode, 20, "adaptive") as SessionMode) ?? "adaptive";
    if (!["adaptive", "topic", "mock"].includes(mode)) throw new ApiError(400, "Invalid mode.");

    const level = cleanText(body.level, 60, "GATE / ESE");
    const kind = cleanText(body.questionType, 30, "mixed");
    const topicId = typeof body.topicId === "string" ? body.topicId : null;
    const documentId = typeof body.documentId === "string" ? body.documentId : null;

    const maxCount = mode === "mock" ? MAX_QUESTIONS_MOCK : MAX_QUESTIONS_PRACTICE;
    const count = clampInt(body.count, 3, maxCount, mode === "mock" ? 15 : SESSION_TARGET_SIZE);

    if (mode === "topic" && !topicId) throw new ApiError(400, "topicId is required for topic mode.");

    await enforceGenerationQuota(user.email);

    const session = await startSession(user.email, { mode, topicId, documentId, count, level, kind });
    await logGeneration(user.email, `session:${mode}`);

    const questions = mode === "mock" ? session.questions.map(stripSolution) : session.questions;

    return { ...session, questions };
  });
}
