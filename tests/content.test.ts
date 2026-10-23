import { describe, expect, it } from "vitest";
import {
  generateQuiz,
  listLessons,
  scienceG4Term1,
  scienceG4Term1Bank,
  validateCurriculum,
  validateQuestion,
  DEFAULT_CONFIG,
} from "../src/index";

const chapter1 = listLessons(scienceG4Term1).filter((l) => l.unitId === "ch1");

describe("Science Primary 4 — Chapter 1 content", () => {
  it("has a valid curriculum and question bank", () => {
    expect(validateCurriculum(scienceG4Term1)).toEqual([]);
    expect(scienceG4Term1Bank.flatMap(validateQuestion)).toEqual([]);
    expect(new Set(scienceG4Term1Bank.map((q) => q.id)).size).toBe(scienceG4Term1Bank.length);
  });

  it("links every question to a real objective", () => {
    const objectives = new Set(chapter1.flatMap((l) => l.objectives.map((o) => o.id)));
    expect(scienceG4Term1Bank.filter((q) => !objectives.has(q.objectiveId))).toEqual([]);
  });

  it("has at least 3 questions for every objective", () => {
    for (const objective of chapter1.flatMap((l) => l.objectives)) {
      expect(scienceG4Term1Bank.filter((q) => q.objectiveId === objective.id).length, objective.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("has enough questions for a fresh basic and medium quiz in every lesson", () => {
    for (const lesson of chapter1) {
      const qs = scienceG4Term1Bank.filter((q) => q.lessonId === lesson.id);
      expect(qs.filter((q) => q.difficulty <= 2).length, lesson.id).toBeGreaterThanOrEqual(DEFAULT_CONFIG.tiers.basic.questionCount);
      expect(qs.filter((q) => q.difficulty >= 2 && q.difficulty <= 4).length, lesson.id).toBeGreaterThanOrEqual(DEFAULT_CONFIG.tiers.standard.questionCount);
    }
  });

  it("can build every quiz type for every lesson", () => {
    for (const lesson of chapter1) {
      for (const tier of ["basic", "standard", "advanced"] as const) {
        const cfg = DEFAULT_CONFIG.tiers[tier];
        const quiz = generateQuiz(scienceG4Term1Bank, { kind: tier, lessonIds: [lesson.id], questionCount: cfg.questionCount, difficulty: cfg.difficulty, seed: 3 });
        expect(quiz.items, `${lesson.id} ${tier}`).toHaveLength(cfg.questionCount);
      }
    }
  });

  it("uses the main Egyptian exam question styles", () => {
    const styles = new Set(scienceG4Term1Bank.map((q) => q.style));
    for (const style of ["complete", "choose", "choose_all", "true_false", "give_reason", "what_happens", "odd_one_out", "match", "classify", "order", "scientific_term"]) {
      expect(styles.has(style as never), style).toBe(true);
    }
  });
});
