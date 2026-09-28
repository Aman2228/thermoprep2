import type { Question } from "@/types/app";

const LETTERS = "ABCDEFGH";

export function letterFor(index: number): string {
  return LETTERS[index] ?? String(index + 1);
}

function norm(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function parseLetterList(raw: string): string[] | null {
  const cleaned = raw.replace(/[()[\].]/g, "").trim();
  if (!cleaned) return null;

  const parts = cleaned
    .split(/\s*(?:,|;|&|\/|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return null;
  if (!parts.every((part) => /^[A-Ha-h]$/.test(part))) return null;

  return [...new Set(parts.map((part) => part.toUpperCase()))].sort();
}

export function expectedLetters(q: Question): string[] {
  const direct = parseLetterList(q.answer);
  if (direct) return direct;

  const answerText = norm(q.answer);
  const letters: string[] = [];

  q.options.forEach((option, index) => {
    const optionText = norm(option);
    if (optionText && (optionText === answerText || answerText.includes(optionText))) {
      letters.push(letterFor(index));
    }
  });

  return letters.sort();
}

export function parseNumber(raw: string): number | null {
  const match = raw.replace(/,/g, "").match(/-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/);
  if (!match) return null;

  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

/** Can this question type be scored without another AI call? */
export function isObjective(q: Question): boolean {
  switch (q.type) {
    case "mcq":
    case "assertion":
    case "multi":
      return q.options.length > 0 && expectedLetters(q).length > 0;
    case "integer":
    case "numerical":
      return parseNumber(q.answer) !== null;
    default:
      return false;
  }
}

/** Returns null when the question needs AI grading (short/derivation/interview). */
export function evaluateObjective(q: Question, userAnswer: string): boolean | null {
  if (!isObjective(q)) return null;

  const answer = userAnswer.trim();
  if (!answer) return false;

  switch (q.type) {
    case "mcq":
    case "assertion":
    case "multi": {
      const given = parseLetterList(answer) ?? [];
      const expected = expectedLetters(q);
      return given.length === expected.length && given.every((l, i) => l === expected[i]);
    }

    case "integer": {
      const given = parseNumber(answer);
      const expected = parseNumber(q.answer);
      return given !== null && expected !== null && Math.round(given) === Math.round(expected);
    }

    case "numerical": {
      const given = parseNumber(answer);
      const expected = parseNumber(q.answer);
      if (given === null || expected === null) return false;

      const tolerance = (q.tolerancePct ?? 2) / 100;
      const allowed = Math.max(Math.abs(expected) * tolerance, 1e-9);
      return Math.abs(given - expected) <= allowed;
    }

    default:
      return null;
  }
}
