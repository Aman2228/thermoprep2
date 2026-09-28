"use client";

import { createWorker, type Worker } from "tesseract.js";

/**
 * Point 4 of the brief: "read text that's in image format, i.e. can't be selected".
 * Runs entirely in the browser (no server round-trip, no per-page timeout risk) and
 * is used for two things by lib/pdf-extract.ts:
 *   1. Pages pdf.js finds almost no selectable text on (scanned textbook pages).
 *   2. Optionally, individual figure crops, to pull axis/curve labels off a diagram.
 */

let worker: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  worker ??= createWorker("eng");
  return worker;
}

export async function ocrDataUrl(dataUrl: string): Promise<string> {
  try {
    const w = await getWorker();
    const {
      data: { text },
    } = await w.recognize(dataUrl);
    return text.trim();
  } catch (error) {
    console.error("OCR_FAILED:", error);
    return "";
  }
}

export async function terminateOcrWorker(): Promise<void> {
  if (!worker) return;
  const w = await worker;
  worker = null;
  await w.terminate();
}
