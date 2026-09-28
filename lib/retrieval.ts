import { currentEmbeddingTag, embedQuery } from "@/lib/ai";
import { ApiError } from "@/lib/errors";
import { db } from "@/lib/supabase";
import type { SourceRef } from "@/types/app";

interface ChunkRow {
  id: string;
  document_id: string;
  topic_id: string | null;
  content: string;
  page_start: number | null;
  page_end: number | null;
  section_title: string;
  similarity: number;
}

export interface RetrievedContext {
  /** Prompt-ready text; every passage is labelled [S1 · Title, p.12–13]. */
  text: string;
  sources: SourceRef[];
  chunkIds: string[];
}

const pageLabel = (start: number | null, end: number | null) => {
  if (!start) return "";
  return end && end !== start ? `, p.${start}–${end}` : `, p.${start}`;
};

/**
 * Retrieve passages for a query, optionally scoped to one auto-detected topic (the
 * usual case: the student picked a topic from Library rather than typing free text).
 */
export async function retrieveContext(
  email: string,
  query: string,
  options: { topicId?: string | null; documentId?: string | null; topK?: number } = {},
): Promise<RetrievedContext> {
  const topK = options.topK ?? 6;

  let docQuery = db().from("documents").select("id,title,embedding_model").eq("user_email", email).eq("status", "processed");
  if (options.documentId) docQuery = docQuery.eq("id", options.documentId);

  const { data: documents, error: docError } = await docQuery;
  if (docError) throw docError;

  if (!documents?.length) {
    throw new ApiError(400, "No processed textbook found. Add a PDF in Library and process it first.");
  }

  const tag = currentEmbeddingTag();
  const eligible = documents.filter((d) => d.embedding_model === tag);

  if (eligible.length === 0) {
    throw new ApiError(
      409,
      "Your textbooks were processed with a different embedding setup. Open Library and press “Re-process” once.",
    );
  }

  const queryEmbedding = await embedQuery(query);

  const { data, error } = await db().rpc("match_document_chunks", {
    query_embedding: queryEmbedding,
    match_count: topK,
    filter_user_email: email,
    filter_document_ids: eligible.map((d) => String(d.id)),
    filter_topic_id: options.topicId ?? null,
  });

  if (error) throw error;

  const rows = (data ?? []) as ChunkRow[];

  if (rows.length === 0) {
    throw new ApiError(400, "No relevant textbook passages were found for that topic.");
  }

  const titles = new Map(documents.map((d) => [String(d.id), String(d.title)]));

  const sources: SourceRef[] = rows.map((row, i) => ({
    index: i + 1,
    documentId: row.document_id,
    title: titles.get(row.document_id) ?? "Textbook",
    pageStart: row.page_start,
    pageEnd: row.page_end,
    similarity: row.similarity,
    preview: row.content.slice(0, 400),
    topicLabel: row.section_title,
    figureIds: [],
  }));

  const text = rows
    .map((row, i) => {
      const s = sources[i];
      return `[S${s.index} · ${s.title}${pageLabel(s.pageStart, s.pageEnd)}]\n${row.content}`;
    })
    .join("\n\n");

  return { text, sources, chunkIds: rows.map((r) => r.id) };
}
