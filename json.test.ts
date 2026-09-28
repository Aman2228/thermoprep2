import test from "node:test";
import assert from "node:assert/strict";
import { parseJsonLoose } from "@/lib/json";

test("valid JSON with correctly escaped LaTeX is untouched", () => {
  const out = parseJsonLoose('{"a":"$\\\\frac{1}{2}\\\\theta$"}') as { a: string };
  assert.equal(out.a, "$\\frac{1}{2}\\theta$");
});

test("single-backslash \\frac (form feed) is restored", () => {
  const out = parseJsonLoose('{"a":"$\\frac{1}{2}$"}') as { a: string };
  assert.equal(out.a, "$\\frac{1}{2}$");
});

test("single-backslash \\theta / \\tau / \\times (tab) are restored", () => {
  const out = parseJsonLoose('{"a":"$\\theta \\tau \\times x$"}') as { a: string };
  assert.equal(out.a, "$\\theta \\tau \\times x$");
});

test("single-backslash \\beta (backspace) and \\rho (CR) and \\nu (LF) are restored", () => {
  const out = parseJsonLoose('{"a":"$\\beta \\rho \\nu$"}') as { a: string };
  assert.equal(out.a, "$\\beta \\rho \\nu$");
});

test("invalid escapes like \\eta / \\sqrt are repaired", () => {
  const out = parseJsonLoose('{"a":"$\\eta = \\sqrt{x}$"}') as { a: string };
  assert.equal(out.a, "$\\eta = \\sqrt{x}$");
});

test("code fences and surrounding chatter are stripped", () => {
  const out = parseJsonLoose('```json\n{"x":1}\n```') as { x: number };
  assert.equal(out.x, 1);
  const out2 = parseJsonLoose('Here you go: {"x":2} hope it helps') as { x: number };
  assert.equal(out2.x, 2);
});

test("real newlines in prose survive", () => {
  const out = parseJsonLoose('{"a":"line one\\nunits are kPa"}') as { a: string };
  // "\nunits" is legit prose here: 'units' is not a bare \nu macro
  assert.equal(out.a, "line one\nunits are kPa");
});

test("truly broken JSON throws", () => {
  assert.throws(() => parseJsonLoose('{"a": '), /malformed/);
});
