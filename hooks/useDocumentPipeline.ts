"use client";

import { useCallback, useState } from "react";
import { extractPdf } from "@/lib/pdf-extract";

export interface PipelineProgress {
  phase: "idle" | "creating" | "extracting" | "uploading" | "finalizing" | "embedding" | "done" | "error";
  pct: number;
  message: string;
}

const PAGE_BATCH = 120;
const FIGURE_BATCH = 8;

async function postJson(url: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
  return data;
}

export function useDocumentPipeline() {
  const [progress, setProgress] = useState<PipelineProgress>({ phase: "idle", pct: 0, message: "" });

  const process = useCallback(
    async (file: File, title: string, options: { ocrScannedPages: boolean; ocrFigureLabels: boolean }): Promise<string | null> => {
      try {
        setProgress({ phase: "creating", pct: 2, message: "Creating document…" });
        const created = await postJson("/api/documents", { title });
        const documentId = String(created.documentId);

        setProgress({ phase: "extracting", pct: 5, message: "Reading PDF…" });
        const extracted = await extractPdf(file, {
          ocrScannedPages: options.ocrScannedPages,
          ocrFigureLabels: options.ocrFigureLabels,
          onProgress: ({ page, totalPages }) =>
            setProgress({
              phase: "extracting",
              pct: 5 + Math.round((page / totalPages) * 50),
              message: `Reading page ${page} of ${totalPages}…`,
            }),
        });

        setProgress({ phase: "uploading", pct: 56, message: "Uploading extracted text…" });

        for (let i = 0; i < extracted.pages.length; i += PAGE_BATCH) {
          const batch = extracted.pages.slice(i, i + PAGE_BATCH).map((p) => ({
            pageNumber: p.pageNumber,
            lines: p.lines,
            ocrUsed: p.ocrUsed,
          }));
          await postJson(`/api/documents/${documentId}/pages`, { pages: batch });
          setProgress((prev) => ({
            ...prev,
            pct: 56 + Math.round(((i + batch.length) / Math.max(1, extracted.pages.length)) * 9),
          }));
        }

        setProgress((prev) => ({ ...prev, message: `Uploading ${extracted.figures.length} captured figures…` }));

        for (let i = 0; i < extracted.figures.length; i += FIGURE_BATCH) {
          const batch = extracted.figures.slice(i, i + FIGURE_BATCH);
          await postJson(`/api/documents/${documentId}/figures`, { figures: batch });
        }

        setProgress({ phase: "finalizing", pct: 72, message: "Splitting into sections and topics…" });
        await postJson(`/api/documents/${documentId}/finalize`, {});

        setProgress({ phase: "embedding", pct: 78, message: "Embedding chunks…" });

        let done = false;
        while (!done) {
          const result = await postJson(`/api/documents/${documentId}/embed`, {});
          done = Boolean(result.done);
          const remaining = Number(result.remaining ?? 0);

          setProgress((prev) => ({
            ...prev,
            pct: Math.min(98, prev.pct + 4),
            message: done ? "Almost done…" : `Embedding… ${remaining} chunks left`,
          }));
        }

        setProgress({ phase: "done", pct: 100, message: "Ready." });
        return documentId;
      } catch (error) {
        setProgress({ phase: "error", pct: 0, message: error instanceof Error ? error.message : "Something went wrong." });
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => setProgress({ phase: "idle", pct: 0, message: "" }), []);

  return { progress, process, reset };
}
