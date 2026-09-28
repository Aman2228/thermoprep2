import type { NextRequest } from "next/server";
import { handle, readJson, requireUser } from "@/lib/api";
import { MAX_PDF_PAGES, SCANNED_PAGE_CHAR_THRESHOLD } from "@/lib/constants";
import { ApiError } from "@/lib/errors";
import { db } from "@/lib/supabase";

interface IncomingLine {
  text: string;
  size: number;
}

interface IncomingPage {
  pageNumber: number;
  lines: IncomingLine[];
  ocrUsed?: boolean;
}

/**
 * Phase 1: the browser has already run pdf.js (and, for scanned pages, Tesseract
 * OCR) over the file and sends the extracted lines here in batches of ~100-150
 * pages, so no single request risks a body-size or serverless-timeout limit even
 * for a 700-page book. Nothing heavier than text crosses the wire in this call.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    const body = await readJson(req);

    const { data: doc } = await db().from("documents").select("id").eq("id", id).eq("user_email", user.email).maybeSingle();
    if (!doc) throw new ApiError(404, "Document not found.");

    const pages = Array.isArray(body.pages) ? (body.pages as IncomingPage[]) : [];
    if (pages.length === 0) throw new ApiError(400, "pages is required.");

    const rows = pages
      .filter((p) => Number.isFinite(p.pageNumber) && p.pageNumber >= 1 && p.pageNumber <= MAX_PDF_PAGES)
      .map((p) => {
        const lines = Array.isArray(p.lines) ? p.lines.slice(0, 400) : [];
        const text = lines.map((l) => String(l.text ?? "")).join("\n");

        return {
          document_id: id,
          user_email: user.email,
          page_number: p.pageNumber,
          text,
          lines: lines.map((l) => ({ text: String(l.text ?? "").slice(0, 300), size: Number(l.size) || 0 })),
          char_count: text.length,
          is_scanned: text.length < SCANNED_PAGE_CHAR_THRESHOLD,
          ocr_used: Boolean(p.ocrUsed),
        };
      });

    if (rows.length === 0) throw new ApiError(400, "No valid pages in batch.");

    const { error } = await db().from("document_pages").upsert(rows, { onConflict: "document_id,page_number" });
    if (error) throw error;

    return { ingested: rows.length };
  });
}
