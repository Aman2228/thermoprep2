/**
 * Normalise the different LaTeX delimiters models produce into what remark-math expects:
 * \( … \) → $…$ · \[ … \] and $$ … $$ → a display block on its own lines.
 *
 * (The previous version's regexes were corrupted: most never matched, and the ones that did
 * used "$$" as a replacement string, which JavaScript turns into a single "$" — silently
 * downgrading display equations to inline ones.) Function replacers avoid that trap.
 */
export function normalizeMath(content?: string): string {
  if (!content) return "";

  return String(content)
    .replace(/\\\[([\s\S]+?)\\\]/g, (_m, eq: string) => `\n\n$$\n${eq.trim()}\n$$\n\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_m, eq: string) => `$${eq.trim()}$`)
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, eq: string) => `\n\n$$\n${eq.trim()}\n$$\n\n`);
}
