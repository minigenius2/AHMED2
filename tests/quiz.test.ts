import { describe, expect, it } from "vitest";
import { generateQuiz, scienceG4Term1Bank, toStudentView, type QuizRequest } from "../src/index";

const base: QuizRequest = {
  kind: "basic",
  lessonIds: ["ch1-l1"],
  questionCount: 8,
  difficulty: { min: 1, max: 2 },
  seed: 42,
};

describe("generateQuiz", () => {
  it("returns the requested number of questions from the requested lesson and band", () => {
    const quiz = generateQuiz(scienceG4Term1Bank, base);
    expect(quiz.items).toHaveLength(8);
    expect(quiz.items.every((i) => i.lessonId === "ch1-l1" && i.difficulty <= 2)).toBe(true);
    expect(new Set(quiz.items.map((i) => i.questionId)).size).toBe(8);
  });

  it("is reproducible with the same seed and different with another seed", () => {
    const a = generateQuiz(scienceG4Term1Bank, base);
    const b = generateQuiz(scienceG4Term1Bank, base);
    const c = generateQuiz(scienceG4Term1Bank, { ...base, seed: 43 });
    expect(b).toEqual(a);
    expect(c.items.map((i) => `${i.questionId}|${i.choices?.join()}`)).not.toEqual(a.items.map((i) => `${i.questionId}|${i.choices?.join()}`));
  });

  it("covers every objective of the lesson", () => {
    const quiz = generateQuiz(scienceG4Term1Bank, { ...base, difficulty: { min: 1, max: 5 } });
    expect(new Set(quiz.items.map((i) => i.objectiveId))).toEqual(new Set(["ch1-l1-o1", "ch1-l1-o2", "ch1-l1-o3", "ch1-l1-o4"]));
  });

  it("prefers questions the student has not seen yet", () => {
    const first = generateQuiz(scienceG4Term1Bank, base);
    const seenAt = Object.fromEntries(first.items.map((i) => [i.questionId, "2026-09-20"]));
    const second = generateQuiz(scienceG4Term1Bank, { ...base, seed: 99, seenAt });
    const repeated = second.items.filter((i) => seenAt[i.questionId]).length;
    const unseenAvailable = scienceG4Term1Bank.filter((q) => q.lessonId === "ch1-l1" && q.difficulty <= 2).length - 8;
    expect(repeated).toBe(Math.max(0, 8 - unseenAvailable));
  });

  it("gives weak objectives more questions", () => {
    const quiz = generateQuiz(scienceG4Term1Bank, { ...base, difficulty: { min: 1, max: 5 }, focusObjectiveIds: ["ch1-l1-o3"] });
    const focus = quiz.items.filter((i) => i.objectiveId === "ch1-l1-o3").length;
    expect(focus).toBeGreaterThanOrEqual(3);
  });

  it("widens the difficulty band when there are not enough questions", () => {
    const quiz = generateQuiz(scienceG4Term1Bank, { ...base, kind: "advanced", difficulty: { min: 5, max: 5 }, questionCount: 6 });
    expect(quiz.items).toHaveLength(6);
  });

  it("splits a multi-lesson test by weight", () => {
    const quiz = generateQuiz(scienceG4Term1Bank, {
      ...base,
      kind: "periodic",
      lessonIds: ["ch1-l1", "ch1-l5"],
      questionCount: 10,
      difficulty: { min: 1, max: 5 },
      lessonWeights: { "ch1-l1": 0.2, "ch1-l5": 0.8 },
    });
    expect(quiz.items.filter((i) => i.lessonId === "ch1-l5")).toHaveLength(8);
  });

  it("never sends answers to the student's device", () => {
    const view = toStudentView(generateQuiz(scienceG4Term1Bank, base));
    for (const item of view.items) {
      expect(item).not.toHaveProperty("answerKey");
      expect(item).not.toHaveProperty("acceptable");
    }
  });
});
