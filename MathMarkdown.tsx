"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

/**
 * The AI is asked for $...$ / $$...$$, but sometimes still writes \( \) or \[ \]
 * (both valid LaTeX, neither understood by remark-math), so normalise those too.
 */
function normalizeMath(content?: string): string {
  if (!content) return "";

  let text = String(content);

  text = text.replace(/\\\(/g, "$").replace(/\\\)/g, "$");
  text = text.replace(/\\\[/g, "$$$$").replace(/\\\]/g, "$$$$");

  // Give display maths its own line so remark-math reliably detects block mode.
  text = text.replace(/\$\$([^$]+)\$\$/g, (_match, equation) => `\n\n$$\n${equation.trim()}\n$$\n\n`);

  return text;
}

export default function MathMarkdown({ content, children }: { content?: string; children?: string }) {
  const source = content ?? children;
  if (!source) return null;

  return (
    <div className="prose prose-invert max-w-none prose-p:leading-7 prose-li:leading-7 prose-strong:text-chalk-50 prose-code:text-brass-300">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {normalizeMath(source)}
      </ReactMarkdown>
    </div>
  );
}
