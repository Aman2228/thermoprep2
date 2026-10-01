import { LEVELS } from "@/lib/constants";

export interface PromptBundle {
  system: string;
  prompt: string;
  maxOutputTokens: number;
}

const SYSTEM = `You are a mechanical / thermal engineering professor (IIT Delhi, MTech level), a GATE/ESE examiner and a core-placement interviewer.
Rules:
- Ground everything in the numbered textbook passages ([S1], [S2] …). Cite a passage as [S#] when you rely on it. If the passages do not cover something, say so and use standard engineering knowledge. Never invent page numbers.
- Write mathematics as LaTeX: inline $...$ and display $$...$$. Inside JSON every backslash must be doubled ("\\\\frac", "\\\\eta").
- Never draw diagrams or output SVG/image data. Describe geometry in words; the student is shown the textbook's own captured figures separately.
- Be rigorous and concise. No filler, no motivational language.
- Reply with one JSON object and nothing else.`;

function levelText(level: string): string {
  const match = LEVELS.find((l) => l.value === level);
  return match ? `${match.value} (${match.hint})` : level;
}

export function buildQuizPrompt(input: {
  topic: string;
  level: string;
  kind: string;
  count: number;
  mode: string;
  context: string;
  targetDifficulty: number; // 1..5, the session's current difficulty aim
}): PromptBundle {
  const kindLine =
    input.kind === "mixed"
      ? "a mix of mcq, multi, integer, numerical, assertion and short-answer questions"
      : `all of type "${input.kind}"`;

  const prompt = `Create a ${input.mode} set of ${input.count} questions on "${input.topic}".
Level: ${levelText(input.level)}
Types: ${kindLine}
Target difficulty: aim most questions at ${input.targetDifficulty}/5, with one a step easier and one a step harder for calibration (report each question's own "difficulty" 1-5 honestly — don't just repeat the target).

Textbook passages:
${input.context}

Requirements:
- Multi-concept, trap-based, non-routine. No plain recall. At least 30% contain a conceptual trap; numericals need more than one governing relation.
- Every question is self-contained: give all data and describe any schematic in words.
- mcq / multi / assertion: exactly 4 options as plain text (no "A)" prefixes). "answer" is the letter(s): "B" or "A,C".
- integer / numerical: "answer" is only the number. numerical also needs "unit" and "tolerancePct" (default 2).
- short: a conceptual question with no fixed options; "answer" is a 2-4 sentence model answer covering the key points a grader should look for.
- Re-check the arithmetic: the answer must agree with the solution.
- "solution" at most 6 short steps; "explanation" at most 2 sentences; "trap" one sentence on the usual wrong approach.

JSON:
{"topic":"","questions":[{"type":"mcq|multi|integer|numerical|assertion|short","question":"","options":[],"answer":"","unit":"","tolerancePct":2,"solution":[],"explanation":"","trap":"","source":"textbook [S#] | general knowledge","difficulty":3}]}`;

  return { system: SYSTEM, prompt, maxOutputTokens: Math.min(12000, 1200 + input.count * 700) };
}

export function buildGradePrompt(input: {
  question: string;
  modelAnswer: string;
  studentAnswer: string;
  level: string;
}): PromptBundle {
  const prompt = `Grade a student's free-text answer against the model answer for a ${levelText(input.level)} question.

Question: ${input.question}
Model answer (key points): ${input.modelAnswer}
Student's answer: ${input.studentAnswer || "(left blank)"}

Score generously for correct physical reasoning even with imperfect wording; score strictly if the core mechanism is wrong or missing. "score" is 0 to 1.

JSON:
{"score":0.0,"feedback":"one or two sentences, addressed to the student, naming what was right or missing"}`;

  return { system: SYSTEM, prompt, maxOutputTokens: 500 };
}

export function buildLearningPrompt(input: {
  subject: string;
  topic: string;
  level: string;
  style: string;
  context: string;
}): PromptBundle {
  const STYLE_HINTS: Record<string, string> = {
    "Derivation heavy": "Give the derivation the most space and justify each step.",
    "Numerical focus": "Emphasise the worked example and unit handling.",
    "Conceptual traps": "Emphasise limiting cases and traps.",
    "Quick revision": "Keep every section short; favour equations over prose.",
  };

  const prompt = `Write a learning module on "${input.topic}" (${input.subject}).
Level: ${levelText(input.level)}
Style: ${input.style}. ${STYLE_HINTS[input.style] ?? ""}

Textbook passages:
${input.context}

Requirements:
- Build from first principles without oversimplifying; state assumptions and validity limits inside the equations.
- Overview at most 120 words, first principles at most 150 words. Derivation at most 8 steps. Exactly 2 limiting cases, 3 traps, 1 worked example.
- "figureQueries": at most 3 short search phrases for standard diagrams of this topic (for example "Rankine cycle T-s diagram"), used only as a fallback if the textbook itself has no figure here.

JSON:
{"topic":"","sourceNote":"which passages were used, and what came from general knowledge","overview":"","firstPrinciples":"","equations":[{"latex":"","meaning":"","units":"","validity":""}],"derivation":{"goal":"","steps":[],"result":""},"intuition":"","limitingCases":[{"case":"","result":""}],"traps":[],"example":{"problem":"","steps":[],"answer":""},"applications":[],"nextTopics":[],"figureQueries":[]}`;

  return { system: SYSTEM, prompt, maxOutputTokens: 4500 };
}
