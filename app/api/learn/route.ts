import type { NextRequest } from "next/server";
import { generateJson } from "@/lib/ai";
import { cleanText, enforceGenerationQuota, handle, logGeneration, readJson, requireUser } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { normalizeLearning } from "@/lib/normalize";
import { buildLearningPrompt } from "@/lib/prompts";
import { retrieveContext } from "@/lib/retrieval";
import { db } from "@/lib/supabase";
import { getFiguresForPages } from "@/lib/figures";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    const body = await readJson(req);

    const topicId = typeof body.topicId === "string" ? body.topicId : null;
    const level = cleanText(body.level, 60, "GATE / ESE");
    const style = cleanText(body.style, 40, "Derivation heavy");
    let topicLabel = cleanText(body.topic, 200);
    let documentId: string | null = null;

    if (topicId) {
      const { data: topic } = await db().from("topics").select("label,document_id").eq("id", topicId).eq("user_email", user.email).maybeSingle();
      if (!topic) throw new ApiError(404, "Topic not found.");
      topicLabel = topic.label;
      documentId = topic.document_id;
    }

    if (!topicLabel) throw new ApiError(400, "topic or topicId is required.");

    await enforceGenerationQuota(user.email);

    const { text: context, sources } = await retrieveContext(user.email, topicLabel, { topicId, documentId, topK: 6 });

    const { system, prompt, maxOutputTokens } = buildLearningPrompt({
      subject: "Thermal / mechanical engineering",
      topic: topicLabel,
      level,
      style,
      context,
    });

    const raw = await generateJson({ system, prompt, maxOutputTokens });
    const content = normalizeLearning(raw);

    const { data: saved, error } = await db()
      .from("learning_sessions")
      .insert({ user_email: user.email, topic: topicLabel, level, content })
      .select()
      .single();

    if (error) throw error;

    await logGeneration(user.email, "learn");

    const bestSource = sources[0];
    const figures = bestSource
      ? await getFiguresForPages(user.email, bestSource.documentId, bestSource.pageStart ?? 0, bestSource.pageEnd ?? bestSource.pageStart ?? 0, 3)
      : [];

    return { session: saved, sources, figures };
  });
}
