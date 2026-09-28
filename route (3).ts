import type { NextRequest } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { db } from "@/lib/supabase";
import type { TopicRow } from "@/types/app";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);

    const { data: topics, error } = await db()
      .from("topics")
      .select("id,label,chunk_count,document_id,documents(title,status)")
      .eq("user_email", user.email)
      .order("first_page", { ascending: true });

    if (error) throw error;

    const processed = (topics ?? []).filter(
      (t) => (t as unknown as { documents?: { status?: string } }).documents?.status === "processed",
    );

    const topicIds = processed.map((t) => String(t.id));

    const [{ data: mastery }, { data: questions }, { data: reviews }] = await Promise.all([
      db().from("topic_mastery").select("topic_id,mastery").eq("user_email", user.email),
      db().from("questions").select("id,topic_id").eq("user_email", user.email).in("topic_id", topicIds),
      db().from("question_reviews").select("question_id,due_at").eq("user_email", user.email),
    ]);

    const masteryMap = new Map((mastery ?? []).map((m) => [String(m.topic_id), Number(m.mastery)]));
    const reviewedIds = new Set((reviews ?? []).map((r) => String(r.question_id)));
    const dueIds = new Set(
      (reviews ?? []).filter((r) => new Date(String(r.due_at)).getTime() <= Date.now()).map((r) => String(r.question_id)),
    );

    const bankByTopic = new Map<string, string[]>();
    for (const q of questions ?? []) {
      const key = String(q.topic_id);
      const list = bankByTopic.get(key) ?? [];
      list.push(String(q.id));
      bankByTopic.set(key, list);
    }

    const result: TopicRow[] = processed.map((t) => {
      const id = String(t.id);
      const bank = bankByTopic.get(id) ?? [];
      const due = bank.filter((qid) => dueIds.has(qid)).length;
      const fresh = bank.filter((qid) => !reviewedIds.has(qid)).length;

      return {
        id,
        document_id: String(t.document_id),
        document_title: String((t as unknown as { documents?: { title?: string } }).documents?.title ?? "Textbook"),
        label: String(t.label),
        chunk_count: Number(t.chunk_count),
        question_bank_count: bank.length,
        mastery: masteryMap.get(id) ?? 0,
        due_count: due,
        new_count: fresh,
      };
    });

    return { topics: result };
  });
}
