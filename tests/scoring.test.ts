import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateObjective } from "../lib/scoring";
import type { Question } from "../types/app";

const base: Question = {
  id: "q", type: "mcq", question: "", options: ["a", "b", "c", "d"], answer: "B", solution: [], explanation: "",
  trap: "", source: "", topicId: null, topicLabel: "", difficulty: 3, documentId: null, pageStart: null, pageEnd: null, figureIds: [],
};

test("mcq / multi", () => {
  assert.equal(evaluateObjective(base, "b"), true);
  assert.equal(evaluateObjective(base, "C"), false);
  assert.equal(evaluateObjective({ ...base, type: "multi", answer: "A,C" }, "c, a"), true);
});

test("numerical tolerance", () => {
  const q: Question = { ...base, type: "numerical", options: [], answer: "100", tolerancePct: 2 };
  assert.equal(evaluateObjective(q, "101.5"), true);
  assert.equal(evaluateObjective(q, "105"), false);
});

test("short answers need AI grading", () => {
  assert.equal(evaluateObjective({ ...base, type: "short", options: [] }, "anything"), null);
});
