import type { NextRequest } from "next/server";
import { cleanText, handle, requireUser } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { db } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);

    const { data, error } = await db()
      .from("documents")
      .select("id,title,status,page_count,scanned_page_count,chunk_count,figure_count,topic_count,embedding_model,created_at")
      .eq("user_email", user.email)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return { documents: data ?? [] };
  });
}

/** Creates the row for a PDF the browser is about to extract. No file bytes are sent here. */
export async function POST(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const title = cleanText(body.title, 160);

    if (!title) throw new ApiError(400, "title is required.");

    const { data, error } = await db()
      .from("documents")
      .insert({ user_email: user.email, title, status: "extracting" })
      .select("id")
      .single();

    if (error) throw error;

    return { documentId: data.id };
  });
}
