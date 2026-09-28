import type { NextRequest } from "next/server";
import { handle, readJson, requireUser } from "@/lib/api";
import { MAX_FIGURE_BYTES, MAX_FIGURES_PER_DOCUMENT } from "@/lib/constants";
import { ApiError } from "@/lib/errors";
import { db } from "@/lib/supabase";

interface IncomingFigure {
  page: number;
  kind: "embedded" | "full-page";
  caption?: string;
  ocrText?: string;
  imageDataUrl: string;
}

/**
 * Phase 1b: real images captured from the textbook by the browser (embedded raster
 * crops pulled from the PDF's own image objects, plus full-page renders for pages
 * whose caption line couldn't be matched to a specific embedded image). Capped per
 * document so a picture-heavy book can't balloon storage.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const user = await requireUser(req);
    const { id } = await params;
    const body = await readJson(req);

    const { data: doc } = await db().from("documents").select("id").eq("id", id).eq("user_email", user.email).maybeSingle();
    if (!doc) throw new ApiError(404, "Document not found.");

    const { count: existing } = await db()
      .from("figures")
      .select("id", { count: "exact", head: true })
      .eq("document_id", id)
      .eq("user_email", user.email);

    const room = Math.max(0, MAX_FIGURES_PER_DOCUMENT - (existing ?? 0));
    if (room === 0) return { ingested: 0, skipped: "figure cap reached" };

    const figures = Array.isArray(body.figures) ? (body.figures as IncomingFigure[]) : [];

    const rows = figures
      .filter((f) => typeof f.imageDataUrl === "string" && f.imageDataUrl.length > 0 && f.imageDataUrl.length < MAX_FIGURE_BYTES * 1.4)
      .slice(0, room)
      .map((f) => ({
        document_id: id,
        user_email: user.email,
        page: Number(f.page) || 0,
        kind: f.kind === "full-page" ? "full-page" : "embedded",
        caption: (f.caption ?? "").slice(0, 200),
        ocr_text: f.ocrText ? f.ocrText.slice(0, 4000) : null,
        image_data_url: f.imageDataUrl,
      }));

    if (rows.length === 0) return { ingested: 0 };

    const { error } = await db().from("figures").insert(rows);
    if (error) throw error;

    await db()
      .from("documents")
      .update({ figure_count: (existing ?? 0) + rows.length })
      .eq("id", id)
      .eq("user_email", user.email);

    return { ingested: rows.length };
  });
}
