"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Callout from "@/components/Callout";
import Chip from "@/components/Chip";
import Navbar from "@/components/Navbar";
import RequireAuth from "@/components/RequireAuth";
import { useApi } from "@/hooks/useApi";
import { useDocumentPipeline } from "@/hooks/useDocumentPipeline";
import type { DocumentRow } from "@/types/app";

const STATUS_TONE: Record<DocumentRow["status"], "neutral" | "brass" | "ok" | "danger"> = {
  uploading: "neutral",
  extracting: "brass",
  chunking: "brass",
  embedding: "brass",
  processed: "ok",
  failed: "danger",
};

export default function LibraryPage() {
  const { call, error: listError } = useApi<{ documents: DocumentRow[] }>();
  const { progress, process, reset } = useDocumentPipeline();

  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [title, setTitle] = useState("");
  const [ocrScanned, setOcrScanned] = useState(true);
  const [ocrFigures, setOcrFigures] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const data = await call("/api/documents");
    if (data) setDocuments(data.documents);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFileChange = (file: File | null) => {
    if (file && !title) setTitle(file.name.replace(/\.pdf$/i, ""));
  };

  const onUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    const documentId = await process(file, title || file.name, { ocrScannedPages: ocrScanned, ocrFigureLabels: ocrFigures });
    if (documentId) {
      await refresh();
      setTitle("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const isBusy = progress.phase !== "idle" && progress.phase !== "done" && progress.phase !== "error";

  const onDelete = async (id: string) => {
    if (!confirm("Delete this document, its chunks, figures and question bank?")) return;
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <RequireAuth>
      <main className="min-h-screen">
        <Navbar />

        <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-8">
          <section>
            <h1 className="font-display text-3xl font-semibold mb-1">Library</h1>
            <p className="text-chalk-400">
              Everything runs in your browser — text extraction, scanned-page OCR and figure capture — before
              anything is sent to the server.
            </p>
          </section>

          <section className="worksheet p-5 space-y-4">
            <div>
              <label className="block text-sm text-chalk-400 mb-1">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Cengel — Thermodynamics, Ch. 8-10"
                className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 outline-none focus:border-brass-400"
              />
            </div>

            <div>
              <label className="block text-sm text-chalk-400 mb-1">PDF file</label>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf"
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                className="w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-ink-700 file:px-3 file:py-2 file:text-chalk-50"
              />
            </div>

            <div className="flex flex-wrap gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={ocrScanned} onChange={(e) => setOcrScanned(e.target.checked)} />
                OCR scanned pages
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={ocrFigures} onChange={(e) => setOcrFigures(e.target.checked)} />
                OCR text inside figures (slower)
              </label>
            </div>

            <button
              onClick={onUpload}
              disabled={isBusy}
              className="bg-brass-400 hover:bg-brass-300 disabled:opacity-50 text-ink-950 font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              {isBusy ? "Processing…" : "Process document"}
            </button>

            {progress.phase !== "idle" && (
              <div className="space-y-1">
                <div className="h-2 w-full rounded-full bg-ink-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${progress.phase === "error" ? "bg-danger-500" : "bg-brass-400"}`}
                    style={{ width: `${progress.pct}%` }}
                  />
                </div>
                <p className="text-sm text-chalk-400">{progress.message}</p>
              </div>
            )}

            {progress.phase === "error" && <Callout kind="error">{progress.message}</Callout>}
            {progress.phase === "done" && (
              <Callout kind="success">
                Processed. <button onClick={reset} className="underline">Dismiss</button>
              </Callout>
            )}
          </section>

          {listError && <Callout kind="error">{listError}</Callout>}

          <section className="space-y-3">
            <h2 className="font-medium">Your documents</h2>

            {documents.length === 0 && <p className="text-chalk-400 text-sm">No documents yet.</p>}

            {documents.map((doc) => (
              <div key={doc.id} className="worksheet p-4 flex items-center justify-between gap-4">
                <Link href={`/library/${doc.id}`} className="min-w-0">
                  <p className="font-medium truncate">{doc.title}</p>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    <Chip tone={STATUS_TONE[doc.status]}>{doc.status}</Chip>
                    {doc.page_count !== null && <Chip>{doc.page_count} pages</Chip>}
                    {!!doc.scanned_page_count && <Chip>{doc.scanned_page_count} OCR'd</Chip>}
                    {doc.topic_count !== null && <Chip>{doc.topic_count} topics</Chip>}
                    {doc.figure_count !== null && <Chip>{doc.figure_count} figures</Chip>}
                  </div>
                </Link>

                <button onClick={() => onDelete(doc.id)} className="text-sm text-danger-300 hover:text-danger-500 shrink-0">
                  Delete
                </button>
              </div>
            ))}
          </section>
        </div>
      </main>
    </RequireAuth>
  );
}
