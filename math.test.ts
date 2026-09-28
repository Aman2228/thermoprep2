import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMath } from "@/lib/math";

test("display and inline delimiters are normalised", () => {
  assert.equal(normalizeMath("a \\(x^2\\) b"), "a $x^2$ b");
  assert.equal(normalizeMath("\\[ E = mc^2 \\]").trim(), "$$\nE = mc^2\n$$");
  assert.equal(normalizeMath("see $$ a+b $$ here").replace(/\s+/g, " ").trim(), "see $$ a+b $$ here");
});

test("display math is NOT downgraded to inline", () => {
  const out = normalizeMath("$$ \\eta = 1 - T_c/T_h $$");
  assert.ok(out.includes("$$\n\\eta = 1 - T_c/T_h\n$$"));
});

test("plain text, currency-like text and trailing backslashes are untouched", () => {
  assert.equal(normalizeMath("cost is 5 dollars"), "cost is 5 dollars");
  assert.equal(normalizeMath("path C:\\"), "path C:\\");
  assert.equal(normalizeMath(undefined), "");
});
