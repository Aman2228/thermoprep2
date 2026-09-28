import type { NextRequest } from "next/server";
import { chunkDocument, type ExtractedPage } from "@/lib/chunking";
import { handle, requireUser } from "@/lib/api";
import { MAX_CHUNKS_PER_DOCUMENT } from "@/lib/constants";
import { ApiError } from "@/lib/errors";
import { db } from "@/lib/supabase";

/**
 * Phase 2: once every page has been ingested, build the structure-aware chunks and
 * auto-detected topics (see lib/chunking.ts) in one pass, then hand off to /embed.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { id } = await params;

    const { data: doc } = await db().from("documents").select("id,status").eq("id", id).eq("user_email", user.email).maybeSingle();
    if (!doc) throw new ApiError(404, "Document not found.");

    const { data: pageRows, error: pageError } = await db()
      .from("document_pages")
      .select("page_number,lines,text,is_scanned")
      .eq("document_id", id)
      .eq("user_email", user.email)
      .order("page_number", { ascending: true });

    if (pageError) throw pageError;
    if (!pageRows?.length) throw new ApiError(400, "No pages were ingested for this document.");

    const pages: ExtractedPage[] = pageRows.map((row) => {
      const lines = Array.isArray(row.lines) && row.lines.length > 0
        ? (row.lines as { text: string; size: number }[])
        : String(row.text ?? "")
            .split("\n")
            .filter(Boolean)
            .map((text) => ({ text, size: 0 }));

      return { pageNumber: Number(row.page_number), lines, isScanned: Boolean(row.is_scanned) };
    });

    const { chunks: allChunks, topics } = chunkDocument(pages);
    const chunks = allChunks.slice(0, MAX_CHUNKS_PER_DOCUMENT);

    await db().from("document_chunks").delete().eq("document_id", id).eq("user_email", user.email);
    await db().from("topics").delete().eq("document_id", id).eq("user_email", user.email);

    const { data: topicRows, error: topicError } = await db()
      .from("topics")
      .insert(
        topics.map((t) => ({
          document_id: id,
          user_email: user.email,
          key: t.key,
          label: t.label,
          first_page: t.firstPage,
          chunk_count: t.chunkCount,
        })),
      )
      .select("id,key");

    if (topicError) throw topicError;

    const topicIdByKey = new Map((topicRows ?? []).map((t) => [String(t.key), String(t.id)]));

    for (let i = 0; i < chunks.length; i += 200) {
      const batch = chunks.slice(i, i + 200).map((chunk, offset) => ({
        document_id: id,
        user_email: user.email,
        topic_id: topicIdByKey.get(chunk.topicKey) ?? null,
        chunk_index: i + offset,
        content: chunk.content,
        page_start: chunk.pageStart,
        page_end: chunk.pageEnd,
        section_title: chunk.sectionTitle,
        embedding: null,
      }));

      const { error } = await db().from("document_chunks").insert(batch);
      if (error) throw error;
    }

    const scannedCount = pages.filter((p) => p.isScanned).length;

    await db()
      .from("documents")
      .update({
        status: "embedding",
        page_count: pages.length,
        scanned_page_count: scannedCount,
        chunk_count: chunks.length,
        topic_count: topics.length,
        embedding_model: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_email", user.email);

    // Line-level font data is only needed for this pass; drop it to keep rows small.
    await db().from("document_pages").update({ lines: [] }).eq("document_id", id).eq("user_email", user.email);

    return { chunkCount: chunks.length, topicCount: topics.length, scannedPages: scannedCount, pageCount: pages.length };
  });
}
