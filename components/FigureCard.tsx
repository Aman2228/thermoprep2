"use client";

import { useState } from "react";
import type { CommonsImage, FigureRecord } from "@/types/app";

export function FigureCard({ figure }: { figure: FigureRecord }) {
  const [showOcr, setShowOcr] = useState(false);

  return (
    <figure className="worksheet p-3 space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={figure.imageDataUrl} alt={figure.caption || `Page ${figure.page}`} className="rounded-lg w-full object-contain bg-ink-950" />

      <figcaption className="text-xs text-chalk-400 flex items-center justify-between gap-2">
        <span>{figure.caption || `${figure.documentTitle}, p.${figure.page}`}</span>
        {figure.ocrText && (
          <button onClick={() => setShowOcr((v) => !v)} className="text-brass-400 hover:text-brass-300 shrink-0">
            {showOcr ? "Hide OCR text" : "OCR text"}
          </button>
        )}
      </figcaption>

      {showOcr && figure.ocrText && (
        <p className="text-xs text-chalk-400 border-t border-ink-700 pt-2 whitespace-pre-wrap">{figure.ocrText}</p>
      )}
    </figure>
  );
}

export function CommonsFigureCard({ image }: { image: CommonsImage }) {
  return (
    <figure className="worksheet p-3 space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image.thumbUrl} alt={image.title} className="rounded-lg w-full object-contain bg-ink-950" />
      <figcaption className="text-xs text-chalk-400">
        {image.title} {"·"}{" "}
        <a href={image.pageUrl} target="_blank" rel="noreferrer" className="text-brass-400 hover:text-brass-300">
          {image.license}
        </a>
      </figcaption>
    </figure>
  );
}
