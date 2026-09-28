"use client";

/**
 * The heart of points 3 and 4 of the brief ("better chunking + image capture", "read
 * text that's in image format"). Runs entirely client-side against the File the user
 * picked — nothing here needs the PDF to be uploaded anywhere first.
 *
 * For every page:
 *   1. Render it once to a canvas (pdf.js). That canvas is reused for: OCR of scanned
 *      pages, and cropping embedded figures.
 *   2. Pull text content with per-line font size (for heading detection downstream).
 *   3. If almost no selectable text came out, the page is "scanned" -> OCR the
 *      rendered canvas with Tesseract (lib/ocr.ts) so its content still becomes
 *      searchable/quizzable text, not a dead end.
 *   4. Walk the page's operator list, replaying just the save/restore/transform ops
 *      on a throwaway (never-drawn-to) 2D context to track the CTM natively via
 *      DOMMatrix. Whenever a `paintImageXObject` is hit, the current transform maps
 *      the unit square onto exactly the image's bounding box in *canvas pixel
 *      space* — no hand-rolled matrix math, and no dependency on decoding pdf.js's
 *      internal raw image formats.
 *   5. Caption lines ("Fig. 5.3 …") are matched to the nearest image bbox below
 *      them; matched pairs are cropped straight out of the rendered canvas. A
 *      caption with no nearby raster image (very common — property diagrams like
 *      T-s/p-V charts are often vector line art, not an embedded image) instead
 *      captures the whole page, so the diagram is still saved as a picture.
 */

import { GlobalWorkerOptions, getDocument, OPS } from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { collapse, extractCaption } from "@/lib/chunking";
import { MAX_PDF_PAGES, SCANNED_PAGE_CHAR_THRESHOLD } from "@/lib/constants";
import { ocrDataUrl } from "@/lib/ocr";

GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const RENDER_SCALE = 1.7;
const MIN_FIGURE_AREA = 70 * 70;
const LARGE_UNCAPTIONED_AREA = 220 * 220;
const CAPTION_MATCH_DIST_PX = 260;
const MAX_UNCAPTIONED_PER_PAGE = 2;
const CROP_MAX_DIM = 720;
const FULLPAGE_MAX_DIM = 900;

export interface ExtractedLineOut {
  text: string;
  size: number;
}

export interface ExtractedPageOut {
  pageNumber: number;
  lines: ExtractedLineOut[];
  isScanned: boolean;
  ocrUsed: boolean;
}

export interface ExtractedFigureOut {
  page: number;
  kind: "embedded" | "full-page";
  caption: string;
  ocrText: string | null;
  imageDataUrl: string;
}

export interface ExtractOptions {
  ocrScannedPages?: boolean;
  ocrFigureLabels?: boolean;
  maxFigures?: number;
  onProgress?: (info: { page: number; totalPages: number; phase: string }) => void;
}

export interface ExtractResult {
  pageCount: number;
  pages: ExtractedPageOut[];
  figures: ExtractedFigureOut[];
  scannedPageCount: number;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boxFromPoints(points: DOMPoint[]): Box {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

function boxArea(box: Box): number {
  return Math.max(0, box.maxX - box.minX) * Math.max(0, box.maxY - box.minY);
}

/** Every `paintImageXObject` in the page, in canvas-pixel space, via native CTM tracking. */
async function findImageBoxes(page: PDFPageProxy, viewport: { transform: number[] }): Promise<Box[]> {
  const opList = await page.getOperatorList();
  const tracker = document.createElement("canvas").getContext("2d");
  if (!tracker) return [];

  const [a, b, c, d, e, f] = viewport.transform;
  tracker.setTransform(a, b, c, d, e, f);

  const boxes: Box[] = [];
  const { fnArray, argsArray } = opList;

  for (let i = 0; i < fnArray.length; i += 1) {
    const fn = fnArray[i];
    const args = (argsArray[i] ?? []) as number[];

    switch (fn) {
      case OPS.save:
        tracker.save();
        break;

      case OPS.restore:
        tracker.restore();
        break;

      case OPS.transform: {
        const [ta, tb, tc, td, te, tf] = args;
        tracker.transform(ta, tb, tc, td, te, tf);
        break;
      }

      case OPS.paintFormXObjectBegin: {
        tracker.save();
        const matrix = args[0] as unknown as number[] | null;
        if (Array.isArray(matrix) && matrix.length === 6) {
          const [ma, mb, mc, md, me, mf] = matrix;
          tracker.transform(ma, mb, mc, md, me, mf);
        }
        break;
      }

      case OPS.paintFormXObjectEnd:
        tracker.restore();
        break;

      case OPS.paintImageXObject: {
        const t = tracker.getTransform();
        const corners = [new DOMPoint(0, 0), new DOMPoint(1, 0), new DOMPoint(1, 1), new DOMPoint(0, 1)].map((p) =>
          t.transformPoint(p),
        );
        boxes.push(boxFromPoints(corners));
        break;
      }

      default:
        break;
    }
  }

  return boxes;
}

function cropToDataUrl(source: HTMLCanvasElement, box: Box, maxDim: number, quality: number): string | null {
  const sx = Math.max(0, Math.floor(box.minX));
  const sy = Math.max(0, Math.floor(box.minY));
  const sw = Math.min(source.width, Math.ceil(box.maxX)) - sx;
  const sh = Math.min(source.height, Math.ceil(box.maxY)) - sy;

  if (sw < 8 || sh < 8) return null;

  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const outW = Math.max(1, Math.round(sw * scale));
  const outH = Math.max(1, Math.round(sh * scale));

  const out = document.createElement("canvas");
  out.width = outW;
  out.height = outH;
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH);
  return out.toDataURL("image/jpeg", quality);
}

interface RawTextItem {
  str: string;
  x: number;
  y: number;
  size: number;
}

function groupIntoLines(items: RawTextItem[]): { text: string; size: number; y: number }[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { text: string; size: number; y: number }[] = [];

  for (const item of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - item.y) < 2.5) {
      last.text += (last.text.endsWith(" ") ? "" : " ") + item.str;
      last.size = Math.max(last.size, item.size);
    } else {
      lines.push({ text: item.str, size: item.size, y: item.y });
    }
  }

  return lines.map((l) => ({ ...l, text: collapse(l.text) })).filter((l) => l.text.length > 0);
}

async function extractPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  options: Required<Pick<ExtractOptions, "ocrScannedPages" | "ocrFigureLabels">>,
): Promise<{ page: ExtractedPageOut; figures: ExtractedFigureOut[] }> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: RENDER_SCALE });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable.");

  await page.render({ canvas, canvasContext: ctx, viewport }).promise;

  const textContent = await page.getTextContent();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawItems: RawTextItem[] = (textContent.items as any[])
    .filter((item) => typeof item.str === "string" && item.str.trim().length > 0)
    .map((item) => {
      const transform = item.transform as number[];
      const [vx, vy] = viewport.convertToViewportPoint(transform[4], transform[5]);
      return { str: item.str as string, x: vx, y: vy, size: Math.hypot(transform[2], transform[3]) || 10 };
    });

  const charCount = rawItems.reduce((sum, i) => sum + i.str.trim().length, 0);
  const isScanned = charCount < SCANNED_PAGE_CHAR_THRESHOLD;

  let lines: ExtractedLineOut[];
  let ocrUsed = false;
  const figures: ExtractedFigureOut[] = [];

  if (isScanned && options.ocrScannedPages) {
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const text = await ocrDataUrl(dataUrl);
    lines = text
      .split(/\r?\n/)
      .map((t) => collapse(t))
      .filter(Boolean)
      .map((text) => ({ text, size: 0 }));
    ocrUsed = true;

    for (const line of lines) {
      const caption = extractCaption(line.text);
      if (caption) {
        const full = cropToDataUrl(canvas, { minX: 0, minY: 0, maxX: canvas.width, maxY: canvas.height }, FULLPAGE_MAX_DIM, 0.7);
        if (full) figures.push({ page: pageNumber, kind: "full-page", caption, ocrText: null, imageDataUrl: full });
      }
    }
  } else {
    const grouped = groupIntoLines(rawItems);
    lines = grouped.map((l) => ({ text: l.text, size: l.size }));

    const captionLines = grouped
      .map((l) => ({ caption: extractCaption(l.text), y: l.y }))
      .filter((l): l is { caption: string; y: number } => Boolean(l.caption));

    let imageBoxes: Box[] = [];
    try {
      imageBoxes = (await findImageBoxes(page, viewport)).filter((b) => boxArea(b) >= MIN_FIGURE_AREA);
    } catch (error) {
      console.error(`IMAGE_BBOX_FAILED page ${pageNumber}:`, error);
    }

    const claimed = new Set<number>();

    for (const cap of captionLines) {
      let bestIdx = -1;
      let bestDist = Infinity;

      imageBoxes.forEach((box, idx) => {
        if (claimed.has(idx)) return;
        const centerY = (box.minY + box.maxY) / 2;
        const dist = Math.abs(centerY - cap.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });

      if (bestIdx >= 0 && bestDist <= CAPTION_MATCH_DIST_PX) {
        claimed.add(bestIdx);
        const cropped = cropToDataUrl(canvas, imageBoxes[bestIdx], CROP_MAX_DIM, 0.78);
        if (cropped) {
          figures.push({ page: pageNumber, kind: "embedded", caption: cap.caption, ocrText: null, imageDataUrl: cropped });
          continue;
        }
      }

      const full = cropToDataUrl(canvas, { minX: 0, minY: 0, maxX: canvas.width, maxY: canvas.height }, FULLPAGE_MAX_DIM, 0.7);
      if (full) figures.push({ page: pageNumber, kind: "full-page", caption: cap.caption, ocrText: null, imageDataUrl: full });
    }

    let uncaptionedAdded = 0;
    imageBoxes.forEach((box, idx) => {
      if (claimed.has(idx) || uncaptionedAdded >= MAX_UNCAPTIONED_PER_PAGE) return;
      if (boxArea(box) < LARGE_UNCAPTIONED_AREA) return;

      const cropped = cropToDataUrl(canvas, box, CROP_MAX_DIM, 0.78);
      if (cropped) {
        figures.push({ page: pageNumber, kind: "embedded", caption: "", ocrText: null, imageDataUrl: cropped });
        uncaptionedAdded += 1;
      }
    });
  }

  if (options.ocrFigureLabels) {
    for (const figure of figures) {
      figure.ocrText = (await ocrDataUrl(figure.imageDataUrl)) || null;
    }
  }

  return { page: { pageNumber, lines, isScanned, ocrUsed }, figures };
}

export async function extractPdf(file: File, options: ExtractOptions = {}): Promise<ExtractResult> {
  const ocrScannedPages = options.ocrScannedPages ?? true;
  const ocrFigureLabels = options.ocrFigureLabels ?? false;
  const maxFigures = options.maxFigures ?? 60;

  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);

  const pages: ExtractedPageOut[] = [];
  const figures: ExtractedFigureOut[] = [];
  let scannedPageCount = 0;
  let figureOcrBudget = 25; // cap how many figures get individually OCR'd, for time

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    options.onProgress?.({ page: pageNumber, totalPages: pageCount, phase: "extracting" });

    try {
      const { page, figures: pageFigures } = await extractPage(pdf, pageNumber, {
        ocrScannedPages,
        ocrFigureLabels: ocrFigureLabels && figureOcrBudget > 0,
      });

      if (page.isScanned) scannedPageCount += 1;
      pages.push(page);

      for (const figure of pageFigures) {
        if (figures.length >= maxFigures) break;
        figures.push(figure);
        if (figure.ocrText) figureOcrBudget -= 1;
      }
    } catch (error) {
      console.error(`PAGE_EXTRACTION_FAILED page ${pageNumber}:`, error);
      pages.push({ pageNumber, lines: [], isScanned: true, ocrUsed: false });
    }
  }

  return { pageCount, pages, figures, scannedPageCount };
}
