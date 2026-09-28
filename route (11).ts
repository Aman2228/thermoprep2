import type { NextRequest } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { db } from "@/lib/supabase";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { id } = await params;

    const { data: doc, error } = await db()
      .from("documents")
      .select("*")
      .eq("id", id)
      .eq("user_email", user.email)
      .maybeSingle();

    if (error) throw error;
    if (!doc) throw new ApiError(404, "Document not found.");

    const { data: topics } = await db()
      .from("topics")
      .select("id,label,first_page,chunk_count")
      .eq("document_id", id)
      .eq("user_email", user.email)
      .order("first_page", { ascending: true });

    const { data: figures } = await db()
      .from("figures")
      .select("id,page,kind,caption,image_data_url")
      .eq("document_id", id)
      .eq("user_email", user.email)
      .order("page", { ascending: true });

    return { document: doc, topics: topics ?? [], figures: figures ?? [] };
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { id } = await params;

    const { error } = await db().from("documents").delete().eq("id", id).eq("user_email", user.email);
    if (error) throw error;

    return { deleted: true };
  });
}
