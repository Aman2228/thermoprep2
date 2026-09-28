"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Callout from "@/components/Callout";
import { CommonsFigureCard, FigureCard } from "@/components/FigureCard";
import MathMarkdown from "@/components/MathMarkdown";
import Navbar from "@/components/Navbar";
import RequireAuth from "@/components/RequireAuth";
import { useApi } from "@/hooks/useApi";
import { LEARN_STYLES, LEVELS } from "@/lib/constants";
import type { CommonsImage, FigureRecord, LearningContent, SourceRef, TopicRow } from "@/types/app";

interface LearnResponse {
  session: { id: string; content: LearningContent };
  sources: SourceRef[];
  figures: FigureRecord[];
}

function LearnInner() {
  const params = useSearchParams();
  const topicsApi = useApi<{ topics: TopicRow[] }>();
  const learnApi = useApi<LearnResponse>();
  const commonsApi = useApi<{ images: CommonsImage[] }>();

  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [topicId, setTopicId] = useState(params.get("topicId") ?? "");
  const [level, setLevel] = useState<string>("GATE / ESE");
  const [style, setStyle] = useState<string>(LEARN_STYLES[0]);
  const [data, setData] = useState<LearnResponse | null>(null);
  const [commons, setCommons] = useState<CommonsImage[]>([]);

  useEffect(() => {
    topicsApi.call("/api/topics").then((d) => {
      if (d) {
        setTopics(d.topics);
        if (!topicId && d.topics[0]) setTopicId(d.topics[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = async () => {
    setData(null);
    setCommons([]);
    const result = await learnApi.postJson("/api/learn", { topicId, level, style });
    if (!result) return;
    setData(result);

    // Wikimedia is only a fallback when the textbook page carried no captured figure.
    const query = result.session.content.figureQueries[0];
    if (result.figures.length === 0 && query) {
      const found = await commonsApi.call(`/api/figures/search?q=${encodeURIComponent(query)}`);
      if (found) setCommons(found.images);
    }
  };

  const c = data?.session.content;
  const error = topicsApi.error || learnApi.error;

  return (
    <main className="min-h-screen">
      <Navbar />
      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
        <section>
          <h1 className="font-display text-3xl font-semibold mb-1">Learn</h1>
          <p className="text-chalk-400">A derivation-first explainer built from the passages of the topic you pick.</p>
        </section>

        {error && <Callout kind="error">{error}</Callout>}

        <section className="worksheet p-5 space-y-4">
          <div>
            <label className="block text-sm text-chalk-400 mb-1">Topic</label>
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2">
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label} — {t.document_title}
                </option>
              ))}
            </select>
            {topics.length === 0 && (
              <p className="text-sm text-chalk-400 mt-2">
                No processed topics yet. <Link href="/library" className="text-brass-400">Add a textbook</Link>.
              </p>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-chalk-400 mb-1">Level</label>
              <select value={level} onChange={(e) => setLevel(e.target.value)} className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2">
                {LEVELS.map((l) => <option key={l.value}>{l.value}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-chalk-400 mb-1">Style</label>
              <select value={style} onChange={(e) => setStyle(e.target.value)} className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2">
                {LEARN_STYLES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <button
            onClick={generate}
            disabled={learnApi.loading || !topicId}
            className="bg-brass-400 hover:bg-brass-300 disabled:opacity-50 text-ink-950 font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            {learnApi.loading ? "Writing module…" : "Generate module"}
          </button>
        </section>

        {c && data && (
          <article className="space-y-6">
            <header>
              <h2 className="font-display text-2xl font-semibold">{c.topic}</h2>
              {c.sourceNote && <p className="text-xs text-chalk-400 mt-1">{c.sourceNote}</p>}
            </header>

            {data.figures.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-3">
                {data.figures.map((f) => <FigureCard key={f.id} figure={f} />)}
              </div>
            )}
            {commons.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-3">
                {commons.map((img) => <CommonsFigureCard key={img.fullUrl} image={img} />)}
              </div>
            )}

            <Section title="Overview"><MathMarkdown>{c.overview}</MathMarkdown></Section>
            <Section title="First principles"><MathMarkdown>{c.firstPrinciples}</MathMarkdown></Section>

            {c.equations.length > 0 && (
              <Section title="Governing equations">
                <div className="space-y-4">
                  {c.equations.map((eq, i) => (
                    <div key={i} className="border border-ink-700 rounded-lg p-3">
                      <MathMarkdown>{`$$${eq.latex}$$`}</MathMarkdown>
                      <p className="text-sm text-chalk-200">{eq.meaning}</p>
                      <p className="text-xs text-chalk-400 mt-1">Units: {eq.units} · Valid when: {eq.validity}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {c.derivation && (
              <Section title="Derivation">
                <p className="text-sm text-chalk-400 mb-2">{c.derivation.goal}</p>
                <ol className="list-decimal pl-5 space-y-2">
                  {c.derivation.steps.map((s, i) => <li key={i}><MathMarkdown>{s}</MathMarkdown></li>)}
                </ol>
                <MathMarkdown>{c.derivation.result}</MathMarkdown>
              </Section>
            )}

            <Section title="Intuition"><MathMarkdown>{c.intuition}</MathMarkdown></Section>

            {c.traps.length > 0 && (
              <Section title="Traps">
                <ul className="list-disc pl-5 space-y-1">
                  {c.traps.map((t, i) => <li key={i}><MathMarkdown>{t}</MathMarkdown></li>)}
                </ul>
              </Section>
            )}

            {c.example && (
              <Section title="Worked example">
                <MathMarkdown>{c.example.problem}</MathMarkdown>
                <ol className="list-decimal pl-5 space-y-1 mt-2">
                  {c.example.steps.map((s, i) => <li key={i}><MathMarkdown>{s}</MathMarkdown></li>)}
                </ol>
                <p className="mt-2"><span className="text-chalk-400">Answer: </span><MathMarkdown>{c.example.answer}</MathMarkdown></p>
              </Section>
            )}

            <div className="flex gap-3">
              <Link href={`/session?mode=topic&topicId=${topicId}`} className="bg-brass-400 hover:bg-brass-300 text-ink-950 font-semibold px-5 py-2.5 rounded-lg transition-colors">
                Practice this topic
              </Link>
            </div>

            {data.sources.length > 0 && (
              <details className="text-sm text-chalk-400">
                <summary className="cursor-pointer">Textbook passages used ({data.sources.length})</summary>
                <ul className="mt-2 space-y-2">
                  {data.sources.map((s) => (
                    <li key={s.index}>
                      [S{s.index}] {s.title}{s.pageStart ? `, p.${s.pageStart}${s.pageEnd && s.pageEnd !== s.pageStart ? `–${s.pageEnd}` : ""}` : ""}: {s.preview.slice(0, 160)}…
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        )}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="worksheet p-5 space-y-2">
      <h3 className="font-display font-semibold text-brass-300">{title}</h3>
      {children}
    </section>
  );
}

export default function LearnPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <LearnInner />
      </Suspense>
    </RequireAuth>
  );
}
