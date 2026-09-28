import type { Difficulty, Equation, LearningContent, Question, QuestionType } from "@/types/app";

/** Model output is funnelled through here so the rest of the app only deals with one clean shape. */

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function strList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(str).filter(Boolean);
  const single = str(value);
  return single ? [single] : [];
}

function records(value: unknown): Raw[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function pick(raw: Raw, ...keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null && raw[key] !== "") return raw[key];
  }
  return undefined;
}

const TYPE_ALIASES: Record<string, QuestionType> = {
  mcq: "mcq",
  "single-correct": "mcq",
  multi: "multi",
  "multi-correct": "multi",
  "multiple-correct": "multi",
  integer: "integer",
  "integer type": "integer",
  numerical: "numerical",
  numeric: "numerical",
  assertion: "assertion",
  "assertion-reason": "assertion",
  short: "short",
  "short answer": "short",
  conceptual: "short",
  derivation: "derivation",
  interview: "interview",
};

function normalizeType(value: unknown): QuestionType {
  const key = str(value).toLowerCase().trim();
  return TYPE_ALIASES[key] ?? "numerical";
}

function normalizeDifficulty(value: unknown): Difficulty {
  const n = Math.round(Number(value));
  if (Number.isFinite(n) && n >= 1 && n <= 5) return n as Difficulty;
  return 3;
}

export function normalizeQuestion(input: unknown, defaults: Partial<Question> = {}): Question {
  const raw: Raw = isRecord(input) ? input : {};
  const solution = strList(pick(raw, "solution", "solutionSteps"));
  const answer = str(pick(raw, "answer", "correctAnswer", "finalAnswer"));
  const tolerance = Number(raw.tolerancePct);

  return {
    id: str(raw.id) || crypto.randomUUID(),
    type: normalizeType(raw.type),
    question: str(raw.question),
    options: strList(raw.options),
    answer,
    unit: str(raw.unit) || undefined,
    tolerancePct: Number.isFinite(tolerance) && tolerance > 0 ? tolerance : undefined,
    solution,
    explanation: str(raw.explanation),
    trap: str(pick(raw, "trap", "commonWrongApproach")),
    source: str(raw.source),
    difficulty: normalizeDifficulty(pick(raw, "difficulty")),
    topicId: defaults.topicId ?? null,
    topicLabel: defaults.topicLabel ?? "",
    documentId: defaults.documentId ?? null,
    pageStart: defaults.pageStart ?? null,
    pageEnd: defaults.pageEnd ?? null,
    figureIds: defaults.figureIds ?? [],
  };
}

/** What a student sees while a mock test is still running: no answer key leaked. */
export function stripSolution(q: Question): Question {
  return {
    ...q,
    answer: "",
    solution: [],
    explanation: "",
    trap: "",
    source: "",
  };
}

function normalizeEquation(raw: Raw): Equation {
  return {
    latex: str(pick(raw, "latex", "equation", "formula")),
    meaning: str(pick(raw, "meaning", "terms")),
    units: str(raw.units),
    validity: str(pick(raw, "validity", "assumptions")),
  };
}

export function normalizeLearning(input: unknown): LearningContent {
  const raw: Raw = isRecord(input) ? input : {};

  const equations = records(pick(raw, "equations", "governingEquations")).map(normalizeEquation).filter((e) => e.latex);

  const derivationRaw = pick(raw, "derivation");
  const derivation = isRecord(derivationRaw)
    ? {
        goal: str(derivationRaw.goal),
        steps: strList(derivationRaw.steps),
        result: str(pick(derivationRaw, "result", "finalResult")),
      }
    : null;

  const exampleRaw = pick(raw, "example", "advancedSolvedExample");
  const example = isRecord(exampleRaw)
    ? { problem: str(exampleRaw.problem), steps: strList(exampleRaw.steps), answer: str(exampleRaw.answer) }
    : null;

  const applicationsRaw = pick(raw, "applications", "practicalApplications");
  const applications = Array.isArray(applicationsRaw)
    ? applicationsRaw.map((item) =>
        isRecord(item) ? [str(item.application), str(item.engineeringRelevance)].filter(Boolean).join(" — ") : str(item),
      )
    : [];

  const limitingCases = records(raw.limitingCases).map((c) => ({
    case: str(c.case),
    result: [str(c.result), str(c.physicalMeaning)].filter(Boolean).join(" — "),
  }));

  return {
    topic: str(raw.topic),
    sourceNote: str(raw.sourceNote),
    overview: str(raw.overview),
    firstPrinciples: str(raw.firstPrinciples),
    equations,
    derivation,
    intuition: str(pick(raw, "intuition", "physicalInterpretation")),
    limitingCases,
    traps: [...strList(pick(raw, "traps", "conceptualTraps")), ...strList(raw.commonMisconceptions)],
    example,
    applications: applications.filter(Boolean),
    nextTopics: strList(pick(raw, "nextTopics", "recommendedNextTopics")),
    figureQueries: strList(raw.figureQueries).slice(0, 3),
  };
}
