"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Callout from "@/components/Callout";
import Chip from "@/components/Chip";
import Navbar from "@/components/Navbar";
import RequireAuth from "@/components/RequireAuth";
import { useApi } from "@/hooks/useApi";

interface Detail {
  document: {
    id: string;
    title: string;
    status: string;
    page_count: number | null;
    scanned_page_count: number | null;
    chunk_count: number | null;
  };
  topics: { id: string; label: string; first_page: number | null; chunk_count: number }[];
  figures: { id: string; page: number; kind: string; caption: string; image_data_url: string }[];
}

export default function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { call, error } = useApi<Detail>();
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    call(`/api/documents/${id}`).then((d) => d && setDetail(d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <RequireAuth>
      <main className="min-h-screen">
        <Navbar />
        <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-8">
          <Link href="/library" className="text-sm text-chalk-400 hover:text-chalk-50">← Library</Link>

          {error && <Callout kind="error">{error}</Callout>}

          {detail && (
            <>
              <section>
                <h1 className="font-display text-3xl font-semibold mb-2">{detail.document.title}</h1>
                <div className="flex flex-wrap gap-2">
                  <Chip tone={detail.document.status === "processed" ? "ok" : "brass"}>{detail.document.status}</Chip>
                  {detail.document.page_count !== null && <Chip>{detail.document.page_count} pages</Chip>}
                  {!!detail.document.scanned_page_count && <Chip>{detail.document.scanned_page_count} scanned (OCR)</Chip>}
                  {detail.document.chunk_count !== null && <Chip>{detail.document.chunk_count} chunks</Chip>}
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="font-medium">Detected topics</h2>
                {detail.topics.length === 0 && <p className="text-sm text-chalk-400">No topics detected.</p>}
                <div className="grid sm:grid-cols-2 gap-3">
                  {detail.topics.map((t) => (
                    <div key={t.id} className="worksheet p-4">
                      <p className="font-medium">{t.label}</p>
                      <p className="text-xs text-chalk-400 mb-3">
                        from p.{t.first_page ?? "?"} · {t.chunk_count} chunks
                      </p>
                      <div className="flex gap-4 text-sm">
                        <Link href={`/session?mode=topic&topicId=${t.id}`} className="text-brass-400 hover:text-brass-300">
                          Practice
                        </Link>
                        <Link href={`/learn?topicId=${t.id}`} className="text-brass-400 hover:text-brass-300">
                          Learn
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="font-medium">Captured figures ({detail.figures.length})</h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {detail.figures.map((f) => (
                    <figure key={f.id} className="worksheet p-3 space-y-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.image_data_url} alt={f.caption || `Page ${f.page}`} className="rounded-lg w-full object-contain bg-ink-950" />
                      <figcaption className="text-xs text-chalk-400">
                        p.{f.page} · {f.kind === "embedded" ? "cropped image" : "full page"}
                        {f.caption ? ` · ${f.caption}` : ""}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>
      </main>
    </RequireAuth>
  );
}
