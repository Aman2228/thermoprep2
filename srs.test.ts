import assert from "node:assert/strict";
import { test } from "node:test";
import { gradeReview, initialReviewState, qualityFromResult, updateMastery } from "../lib/srs";

test("correct answers grow the interval 1 -> 6 -> longer", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  let s = initialReviewState(now);
  s = gradeReview(s, 5, now);
  assert.equal(s.intervalDays, 1);
  s = gradeReview(s, 5, now);
  assert.equal(s.intervalDays, 6);
  s = gradeReview(s, 5, now);
  assert.ok(s.intervalDays > 6);
});

test("a failure resets repetitions and interval", () => {
  const now = new Date();
  let s = gradeReview(gradeReview(initialReviewState(now), 5, now), 5, now);
  s = gradeReview(s, 1, now);
  assert.equal(s.repetitions, 0);
  assert.equal(s.intervalDays, 1);
});

test("ease never drops below the floor", () => {
  const now = new Date();
  let s = initialReviewState(now);
  for (let i = 0; i < 20; i += 1) s = gradeReview(s, 0, now);
  assert.ok(s.ease >= 1.3);
});

test("quality mapping and mastery EMA", () => {
  assert.equal(qualityFromResult(false), 1);
  assert.equal(qualityFromResult(true, 5000), 5);
  assert.ok(updateMastery(0.2, 5) > 0.2);
  assert.ok(updateMastery(0.9, 0) < 0.9);
});
