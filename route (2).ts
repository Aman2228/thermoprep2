import type { NextRequest } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { db } from "@/lib/supabase";
import type { StatsSummary } from "@/types/app";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    const now = new Date();
    const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: docs }, { data: reviewsDue }, { data: mastery }, { data: attempts }] = await Promise.all([
      db().from("documents").select("id,status").eq("user_email", user.email),
      db().from("question_reviews").select("id,due_at").eq("user_email", user.email).lte("due_at", now.toISOString()),
      db()
        .from("topic_mastery")
        .select("mastery,topics(label)")
        .eq("user_email", user.email)
        .order("mastery", { ascending: true }),
      db().from("attempts").select("id,correct,created_at").eq("user_email", user.email).gte("created_at", since30d),
    ]);

    const documents = docs?.length ?? 0;
    const processedDocuments = (docs ?? []).filter((d) => d.status === "processed").length;
    const dueToday = reviewsDue?.length ?? 0;

    const masteryRows = mastery ?? [];
    const masteredTopics = masteryRows.filter((m) => Number(m.mastery) >= 0.75).length;
    const weakTopics = masteryRows
      .filter((m) => Number(m.mastery) < 0.6)
      .slice(0, 5)
      .map((m) => ({
        label: String((m as unknown as { topics?: { label?: string } }).topics?.label ?? "Topic"),
        mastery: Number(m.mastery),
      }));

    const scored = (attempts ?? []).filter((a) => a.correct !== null);
    const averageAccuracy = scored.length > 0 ? scored.filter((a) => a.correct).length / scored.length : 0;

    const days = new Set((attempts ?? []).map((a) => String(a.created_at).slice(0, 10)));
    let streakDays = 0;
    for (let i = 0; i < 60; i += 1) {
      const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      if (days.has(day)) streakDays += 1;
      else if (i > 0) break;
    }

    const summary: StatsSummary = {
      documents,
      processedDocuments,
      dueToday,
      masteredTopics,
      weakTopics,
      streakDays,
      averageAccuracy,
      attempts30d: attempts?.length ?? 0,
    };

    return { stats: summary };
  });
}
