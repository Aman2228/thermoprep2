import type { NextRequest } from "next/server";
import { currentEmbeddingTag, embedTexts } from "@/lib/ai";
import { handle, requireUser } from "@/lib/api";
import { getEnvInt } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { db } from "@/lib/supabase";

export const maxDuration = 60;

/** Phase 3: embed the next batch of un-embedded chunks. Call until `remaining` is 0. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { id } = await params;

    const { data: doc } = await db().from("documents").select("id,status").eq("id", id).eq("user_email", user.email).maybeSingle();
    if (!doc) throw new ApiError(404, "Document not found.");

    const batchSize = getEnvInt("EMBED_BATCH", 48);

    const { data: rows, error } = await db()
      .from("document_chunks")
      .select("id,content")
      .eq("document_id", id)
      .eq("user_email", user.email)
      .is("embedding", null)
      .order("chunk_index", { ascending: true })
      .limit(batchSize);

    if (error) throw error;

    if (rows && rows.length > 0) {
      const vectors = await embedTexts(rows.map((r) => r.content as string), "document");

      for (let i = 0; i < rows.length; i += 1) {
        const { error: updateError } = await db()
          .from("document_chunks")
          .update({ embedding: vectors[i] })
          .eq("id", rows[i].id);

        if (updateError) throw updateError;
      }
    }

    const { count, error: countError } = await db()
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", id)
      .eq("user_email", user.email)
      .is("embedding", null);

    if (countError) throw countError;

    const remaining = count ?? 0;

    if (remaining === 0) {
      await db()
        .from("documents")
        .update({ status: "processed", embedding_model: currentEmbeddingTag(), updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_email", user.email);
    }

    return { embedded: rows?.length ?? 0, remaining, done: remaining === 0 };
  });
}
