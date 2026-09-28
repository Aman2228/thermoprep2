"use client";

import { useEffect, useState } from "react";
import Chip from "@/components/Chip";
import { FigureCard } from "@/components/FigureCard";
import MathMarkdown from "@/components/MathMarkdown";
import { letterFor } from "@/lib/scoring";
import type { FigureRecord, Question } from "@/types/app";

export interface Revealed {
  answer: string;
  solution: string[];
  explanation: string;
  trap: string;
  source: string;
  figureIds: string[];
}

export interface AnswerResult {
  correct: boolean | null;
  quality: number | null;
  feedback?: string;
  revealed: Revealed | null;
}

interface Props {
  question: Question;
  index: number;
  total: number;
  submitting: boolean;
  result: AnswerResult | null;
  figures: FigureRecord[];
  onSubmit: (answer: string) => void;
  onNext: () => void;
  isLast: boolean;
}

const TYPE_LABEL: Record<Question["type"], string> = {
  mcq: "Single correct",
  multi: "Multi-correct",
  integer: "Integer",
  numerical: "Numerical",
  assertion: "Assertion-Reason",
  short: "Short answer",
  derivation: "Derivation",
  interview: "Interview",
};

export default function QuestionCard({ question, index, total, submitting, result, figures, onSubmit, onNext, isLast }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");

  const isChoice = question.type === "mcq" || question.type === "assertion" || question.type === "multi";
  const locked = submitting || result !== null;

  const toggle = (letter: string) => {
    if (locked) return;
    setSelected((prev) =>
      question.type === "multi"
        ? prev.includes(letter)
          ? prev.filter((l) => l !== letter)
          : [...prev, letter].sort()
        : [letter],
    );
  };

  const answerValue = isChoice ? selected.join(",") : text;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") return;

      if (result) {
        if (e.key === "Enter") onNext();
        return;
      }

      if (isChoice) {
        const n = Number(e.key);
        if (n >= 1 && n <= question.options.length) toggle(letterFor(n - 1));
      }

      if (e.key === "Enter" && answerValue && !submitting) onSubmit(answerValue);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, answerValue, submitting, question.id]);

  const shownFigures = result?.revealed ? figures.filter((f) => result.revealed?.figureIds.includes(f.id)) : [];

  return (
    <div className="worksheet p-5 md:p-7 space-y-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-chalk-400">
          Question {index + 1} of {total}
        </span>
        <Chip tone="brass">{TYPE_LABEL[question.type]}</Chip>
        {question.topicLabel && <Chip>{question.topicLabel}</Chip>}
        <Chip>Difficulty {question.difficulty}/5</Chip>
      </div>

      <MathMarkdown>{question.question}</MathMarkdown>

      {isChoice && (
        <div className="space-y-2">
          {question.options.map((option, i) => {
            const letter = letterFor(i);
            const picked = selected.includes(letter);
            const expected = result?.revealed?.answer ?? "";
            const isCorrectOption = result ? expected.split(",").map((s) => s.trim().toUpperCase()).includes(letter) : false;

            let style = "border-ink-600 hover:border-brass-400";
            if (picked && !result) style = "border-brass-400 bg-brass-400/10";
            if (result && isCorrectOption) style = "border-ok-500 bg-ok-500/10";
            if (result && picked && !isCorrectOption) style = "border-danger-500 bg-danger-500/10";

            return (
              <button
                key={letter}
                onClick={() => toggle(letter)}
                disabled={locked}
                className={`w-full text-left rounded-lg border px-4 py-3 transition-colors flex gap-3 ${style}`}
              >
                <span className="font-display text-brass-300 shrink-0">{i + 1}</span>
                <span className="min-w-0">
                  <MathMarkdown>{option}</MathMarkdown>
                </span>
              </button>
            );
          })}
          <p className="text-xs text-chalk-400">Press 1–{question.options.length} to choose, Enter to submit.</p>
        </div>
      )}

      {!isChoice && (
        <div className="space-y-2">
          {question.type === "short" || question.type === "derivation" || question.type === "interview" ? (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={locked}
              rows={5}
              placeholder="Write your answer…"
              className="w-full bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 outline-none focus:border-brass-400"
            />
          ) : (
            <div className="flex items-center gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={locked}
                inputMode="decimal"
                placeholder="Your answer"
                className="w-48 bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 outline-none focus:border-brass-400"
                onKeyDown={(e) => e.key === "Enter" && answerValue && !locked && onSubmit(answerValue)}
              />
              {question.unit && <span className="text-chalk-400 text-sm">{question.unit}</span>}
            </div>
          )}
        </div>
      )}

      {!result && (
        <button
          onClick={() => onSubmit(answerValue)}
          disabled={locked || !answerValue}
          className="bg-brass-400 hover:bg-brass-300 disabled:opacity-40 text-ink-950 font-semibold px-5 py-2.5 rounded-lg transition-colors"
        >
          {submitting ? "Checking…" : "Submit"}
        </button>
      )}

      {result && (
        <div className="space-y-4 border-t border-ink-700 pt-5">
          {result.revealed === null ? (
            <p className="text-chalk-400 text-sm">Answer recorded. Results are revealed when you finish the test.</p>
          ) : (
            <>
              <p className={`font-display text-lg font-semibold ${result.correct ? "text-ok-300" : result.correct === false ? "text-danger-300" : "text-chalk-50"}`}>
                {result.correct ? "Correct" : result.correct === false ? "Not quite" : "Recorded"}
              </p>

              {result.feedback && <p className="text-chalk-200 text-sm">{result.feedback}</p>}

              <div className="text-sm">
                <span className="text-chalk-400">Answer: </span>
                <MathMarkdown>{result.revealed.answer}</MathMarkdown>
              </div>

              {result.revealed.solution.length > 0 && (
                <ol className="list-decimal pl-5 space-y-1 text-sm text-chalk-200">
                  {result.revealed.solution.map((step, i) => (
                    <li key={i}>
                      <MathMarkdown>{step}</MathMarkdown>
                    </li>
                  ))}
                </ol>
              )}

              {result.revealed.explanation && <MathMarkdown>{result.revealed.explanation}</MathMarkdown>}

              {result.revealed.trap && (
                <div className="border-l-2 border-brass-400 pl-3 text-sm text-chalk-200">
                  <span className="text-brass-300 font-medium">Common trap: </span>
                  {result.revealed.trap}
                </div>
              )}

              <p className="text-xs text-chalk-400">
                {result.revealed.source}
                {question.pageStart ? ` · textbook p.${question.pageStart}${question.pageEnd && question.pageEnd !== question.pageStart ? `–${question.pageEnd}` : ""}` : ""}
              </p>

              {shownFigures.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-3">
                  {shownFigures.map((f) => (
                    <FigureCard key={f.id} figure={f} />
                  ))}
                </div>
              )}
            </>
          )}

          <button
            onClick={onNext}
            className="bg-ink-700 hover:bg-ink-600 px-5 py-2.5 rounded-lg font-medium transition-colors"
          >
            {isLast ? "Finish" : "Next question"} <span className="text-chalk-400 text-xs ml-1">Enter</span>
          </button>
        </div>
      )}
    </div>
  );
}
