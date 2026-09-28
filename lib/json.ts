import { JsonParseError } from "./errors";

/**
 * LaTeX inside JSON is the classic failure: a model that writes "\frac" or
 * "\theta" with a single backslash produces a valid-looking JSON escape
 * (\f = form feed, \t = tab), which silently corrupts the maths.
 *
 * Strategy:
 *  1. Ask the provider for JSON mode (the API then escapes correctly).
 *  2. If parsing still fails, double any backslash that is not a legal JSON escape.
 *  3. After parsing, undo the control characters that could only have come from LaTeX.
 */

const CONTROL_FIXES: Array<[RegExp, string]> = [
  // Form feed / backspace never occur in normal prose, so this is always LaTeX.
  [/\f/g, "\\f"],
  [/\x08/g, "\\b"],
  // Tab / CR / LF only when they are followed by a well-known macro name.
  [/\t(?=(?:heta|au|imes|ext|anh|an|ilde|riangle|herefore|op|o)\b)/g, "\\t"],
  [/\r(?=(?:ightarrow|ight|angle|ho)\b)/g, "\\r"],
  [/\n(?=(?:abla|eq|eg|ot|ewline|u)\b)/g, "\\n"],
];

export function restoreLatexControlChars(input: string): string {
  let out = input;

  for (const [pattern, replacement] of CONTROL_FIXES) {
    out = out.replace(pattern, () => replacement);
  }

  return out;
}

function stripFences(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

/** Double backslashes that are not valid JSON escapes (e.g. "\eta", "\alpha", "\sqrt"). */
export function repairInvalidEscapes(json: string): string {
  return json
    .replace(/\\(?!["\\/bfnrtu])/g, "\\\\")
    .replace(/\\u(?![0-9a-fA-F]{4})/g, "\\\\u");
}

function deepFix<T>(value: T): T {
  if (typeof value === "string") return restoreLatexControlChars(value) as T;
  if (Array.isArray(value)) return value.map(deepFix) as T;

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      out[key] = deepFix(item);
    }

    return out as T;
  }

  return value;
}

export function parseJsonLoose(text: string): unknown {
  const cleaned = stripFences(text);

  const attempts: string[] = [cleaned];
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");

  if (first !== -1 && last > first) {
    attempts.push(cleaned.slice(first, last + 1));
  }

  for (const candidate of [...attempts, ...attempts.map(repairInvalidEscapes)]) {
    try {
      return deepFix(JSON.parse(candidate));
    } catch {
      // try the next candidate
    }
  }

  throw new JsonParseError("The AI returned malformed JSON.");
}
