"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Callout from "@/components/Callout";
import MathMarkdown from "@/components/MathMarkdown";
import Navbar from "@/components/Navbar";
import QuestionCard, { type AnswerResult } from "@/components/QuestionCard";
import RequireAuth from "@/components/RequireAuth";
import { useApi } from "@/hooks/useApi";
import { LEVELS, QUESTION_KINDS } from "@/lib/constants";
import type { FigureRecord, Question, SessionMode, TopicRow } from "@/types/app";

interface StartResponse {
  sessionId: string;
  mode: SessionMode;
  topicLabel: string;
  timeLimitSec: number | null;
  questions: Question[];
}

interface FinishResponse {
  score: number;
  total: number;
  review: { question: Question; userAnswer: string; correct: boolean | null }[];
}

const MODES: { value: SessionMode; label: string; hint: string }[] = [
  { value: "adaptive", label: "Adaptive", hint: "Due reviews first, then your weakest topics." },
  { value: "topic", label: "One topic", hint: "Drill a single detected section." },
  { value: "mock", label: "Mock test", hint: "Timed, no feedback until the end." },
];

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function SessionInner() {
  const params = useSearchParams();
  const startApi = useApi<StartResponse>();
  const topicsApi = useApi<{ topics: TopicRow[] }>();
  const answerApi = useApi<AnswerResult>();
  const finishApi = useApi<FinishResponse>();
  const figuresApi = useApi<{ figures: FigureRecord[] }>();

  const initialMode = (params.get("mode") as SessionMode) || "adaptive";
  const [mode, setMode] = useState<SessionMode>(["adaptive", "topic", "mock"].includes(initialMode) ? initialMode : "adaptive");
  const [topicId, setTopicId] = useState(params.get("topicId") ?? "");
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [level, setLevel] = useState<string>("GATE / ESE");
  const [kind, setKind] = useState("mixed");
  const [count, setCount] = useState(8);

  const [session, setSession] = useState<StartResponse | null>(null);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [figures, setFigures] = useState<FigureRecord[]>([]);
  const [summary, setSummary] = useState<FinishResponse | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const shownAt = useRef(Date.now());

  useEffect(() => {
    topicsApi.call("/api/topics").then((d) => {
      if (d) {
        setTopics(d.topics);
        if (!topicId && d.topics[0]) setTopicId(d.topics[0].id);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback(async () => {
    if (!session) return;
    const data = await finishApi.postJson(`/api/session/${session.sessionId}/finish`, {});
    if (data) setSummary(data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    if (!session?.timeLimitSec || summary) return;
    setRemaining(session.timeLimitSec);
    const timer = setInterval(() => setRemaining((r) => (r === null ? r : Math.max(0, r - 1))), 1000);
    return () => clearInterval(timer);
  }, [session, summary]);

  useEffect(() => {
    if (remaining === 0 && session && !summary) finish();
  }, [remaining, session, summary, finish]);

  const start = async () => {
    setSummary(null);
    const data = await startApi.postJson("/api/session/start", {
      mode,
      topicId: mode === "topic" ? topicId : undefined,
      level,
      questionType: kind,
      count,
    });
    if (data) {
      setSession(data);
      setIndex(0);
      setResult(null);
      shownAt.current = Date.now();
    }
  };

  const submit = async (answer: string) => {
    if (!session) return;
    const question = session.questions[index];

    const data = await answerApi.postJson(`/api/session/${session.sessionId}/answer`, {
      questionId: question.id,
      answer,
      timeMs: Date.now() - shownAt.current,
    });

    if (!data) return;
    setResult(data);

    const ids = data.revealed?.figureIds ?? [];
    if (ids.length > 0) {
      const f = await figuresApi.call(`/api/figures?ids=${ids.join(",")}`);
      if (f) setFigures((prev) => [...prev, ...f.figures]);
    }

    // Mock mode gives no feedback, so move straight on.
    if (session.mode === "mock") next(true);
  };

  const next = (auto = false) => {
    if (!session) return;
    if (index + 1 >= session.questions.length) {
      finish();
      return;
    }
    setIndex((i) => i + 1);
    setResult(null);
    shownAt.current = Date.now();
    void auto;
  };

  const error = startApi.error || answerApi.error || finishApi.error || topicsApi.error;

  return (
    <main className="min-h-screen">
      <Navbar />

      <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
        {error && <Callout kind="error">{error}</Callout>}

        {/* ---------- Setup ---------- */}
        {!session && !summary && (
          <>
            <section>
              <h1 className="font-display text-3xl font-semibold mb-1">Practice</h1>
              <p className="text-chalk-400">Questions come from your own textbook and are scheduled for spaced review.</p>
            </section>

            <div className="grid sm:grid-cols-3 gap-3">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  className={`worksheet p-4 text-left transition-colors ${mode === m.value ? "border-brass-400" : "hover:border-ink-600"}`}
                >
                  <p className="font-medium">{m.label}</p>
                  <p className="text-xs text-chalk-400 mt-1">{m.hint}</p>
                </button>
              ))}
            </div>

            <section className="worksheet p-5 space-y-4">
              {mode === "topic" && (
                <div>
                  <label className="block text-sm text-chalk-400 mb-1">Topic</label>
                  <select
                    value={topicId}
                    onChange={(e) => setTopicId(e.target.value)}
                    className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2"
                  >
                    {topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label} — {t.document_title} ({t.due_count} due)
                      </option>
                    ))}
                  </select>
                  {topics.length === 0 && <p className="text-sm text-chalk-400 mt-2">No processed topics yet. <Link href="/library" className="text-brass-400">Add a textbook</Link>.</p>}
                </div>
              )}

              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-chalk-400 mb-1">Level</label>
                  <select value={level} onChange={(e) => setLevel(e.target.value)} className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2">
                    {LEVELS.map((l) => (
                      <option key={l.value}>{l.value}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-chalk-400 mb-1">Question type</label>
                  <select value={kind} onChange={(e) => setKind(e.target.value)} className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2">
                    {QUESTION_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>{k.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-chalk-400 mb-1">Questions</label>
                  <input
                    type="number"
                    min={3}
                    max={mode === "mock" ? 30 : 12}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <button
                onClick={start}
                disabled={startApi.loading || (mode === "topic" && !topicId)}
                className="bg-brass-400 hover:bg-brass-300 disabled:opacity-50 text-ink-950 font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                {startApi.loading ? "Building your session…" : "Start"}
              </button>
              {startApi.loading && <p className="text-xs text-chalk-400">New questions may be generated from your textbook, which can take up to a minute.</p>}
            </section>
          </>
        )}

        {/* ---------- Running ---------- */}
        {session && !summary && session.questions[index] && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-chalk-400">{session.topicLabel}</span>
              {remaining !== null && (
                <span className={`font-display ${remaining < 60 ? "text-danger-300" : "text-chalk-50"}`}>{formatTime(remaining)}</span>
              )}
            </div>

            <div className="flex gap-1">
              {session.questions.map((q, i) => (
                <div key={q.id} className={`h-1 flex-1 rounded-full ${i < index ? "bg-brass-400" : i === index ? "bg-brass-300" : "bg-ink-700"}`} />
              ))}
            </div>

            <QuestionCard
              key={session.questions[index].id}
              question={session.questions[index]}
              index={index}
              total={session.questions.length}
              submitting={answerApi.loading}
              result={session.mode === "mock" ? null : result}
              figures={figures}
              onSubmit={submit}
              onNext={() => next()}
              isLast={index + 1 >= session.questions.length}
            />
          </>
        )}

        {/* ---------- Summary ---------- */}
        {summary && (
          <section className="space-y-6">
            <div className="worksheet p-6">
              <h1 className="font-display text-3xl font-semibold mb-1">Session complete</h1>
              <p className="text-chalk-200">
                {summary.total > 0 ? `${summary.score} of ${summary.total} auto-graded questions correct.` : "Answers recorded."}
              </p>
            </div>

            {session?.mode === "mock" && (
              <div className="space-y-4">
                {summary.review.map(({ question, userAnswer, correct }, i) => (
                  <div key={question.id} className="worksheet p-5 space-y-2">
                    <p className="text-xs text-chalk-400">
                      Q{i + 1} · {correct === null ? "Recorded" : correct ? "Correct" : "Incorrect"} · your answer: {userAnswer || "—"}
                    </p>
                    <MathMarkdown>{question.question}</MathMarkdown>
                    <p className="text-sm"><span className="text-chalk-400">Answer: </span><MathMarkdown>{question.answer}</MathMarkdown></p>
                    {question.explanation && <MathMarkdown>{question.explanation}</MathMarkdown>}
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setSession(null); setSummary(null); setFigures([]); }}
                className="bg-brass-400 hover:bg-brass-300 text-ink-950 font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >
                New session
              </button>
              <Link href="/dashboard" className="bg-ink-700 hover:bg-ink-600 px-5 py-2.5 rounded-lg font-medium transition-colors">
                Dashboard
              </Link>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default function SessionPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <SessionInner />
      </Suspense>
    </RequireAuth>
  );
}
