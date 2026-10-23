import { describe, expect, it } from "vitest";
import { gradeItem, gradeQuiz, normalizeAnswer, type QuizItem } from "../src/index";

const item = (over: Partial<QuizItem>): QuizItem => ({
  questionId: "q",
  lessonId: "l",
  objectiveId: "o",
  difficulty: 1,
  type: "mcq",
  style: "choose",
  prompt: "?",
  answerKey: "x",
  ...over,
});

describe("grading", () => {
  it("normalizes case, spaces, punctuation and Arabic spelling", () => {
    expect(normalizeAnswer("  Magnifying   Glass. ")).toBe("magnifying glass");
    expect(normalizeAnswer("أَحْمَد")).toBe(normalizeAnswer("احمد"));
    expect(normalizeAnswer("مدرسة")).toBe(normalizeAnswer("مدرسه"));
  });

  it("grades multiple choice and true/false", () => {
    expect(gradeItem(item({ answerKey: "Air" }), "air")).toBe(1);
    expect(gradeItem(item({ answerKey: "Air" }), "Tree")).toBe(0);
  });

  it("gives partial credit in choose-all and subtracts wrong picks", () => {
    const q = item({ type: "multi_select", answerKey: ["shape", "color", "size"] });
    expect(gradeItem(q, ["shape", "color", "size"])).toBe(1);
    expect(gradeItem(q, ["shape", "color"])).toBeCloseTo(2 / 3);
    expect(gradeItem(q, ["shape", "weight"])).toBe(0);
  });

  it("accepts blanks in any order but not the same word twice", () => {
    const q = item({ type: "fill_blank", anyOrder: true, acceptable: [["rocks", "water", "air"], ["rocks", "water", "air"]], answerKey: ["rocks", "water"] });
    expect(gradeItem(q, ["water", "rocks"])).toBe(1);
    expect(gradeItem(q, ["rocks", "rocks"])).toBe(0.5);
  });

  it("gives partial credit for match/classify and half at most for a wrong order", () => {
    expect(gradeItem(item({ type: "classify", answerKey: ["A", "B", "A", "B"] }), ["A", "B", "B", "B"])).toBe(0.75);
    expect(gradeItem(item({ type: "order", answerKey: ["Guess", "Search", "Record"] }), ["Guess", "Search", "Record"])).toBe(1);
    expect(gradeItem(item({ type: "order", answerKey: ["Guess", "Search", "Record"] }), ["Guess", "Record", "Search"])).toBeCloseTo(1 / 6);
  });

  it("breaks the result down by lesson, objective and question style", () => {
    const quiz = {
      id: "z",
      kind: "weekly" as const,
      lessonIds: ["l"],
      seed: 1,
      meta: {},
      items: [item({ questionId: "a", answerKey: "1" }), item({ questionId: "b", answerKey: "2", style: "give_reason" })],
    };
    const result = gradeQuiz(quiz, { a: "1", b: "3" });
    expect(result.score).toBe(0.5);
    expect(result.byStyle.choose).toEqual({ earned: 1, total: 1 });
    expect(result.byStyle.give_reason).toEqual({ earned: 0, total: 1 });
  });
});
