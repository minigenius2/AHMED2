import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIG,
  generateQuiz,
  listLessons,
  scienceG4Term1,
  scienceG4Term1Bank,
  validateCurriculum,
  validateQuestion,
} from "../src/index";

const verifiedUnits = scienceG4Term1.units.filter((u) => u.status === "verified");
const verifiedLessons = listLessons(scienceG4Term1).filter((l) => verifiedUnits.some((u) => u.id === l.unitId));

describe("Science Primary 4 — content", () => {
  it("has a valid curriculum and question bank", () => {
    expect(validateCurriculum(scienceG4Term1)).toEqual([]);
    expect(scienceG4Term1Bank.flatMap(validateQuestion)).toEqual([]);
    expect(new Set(scienceG4Term1Bank.map((q) => q.id)).size).toBe(scienceG4Term1Bank.length);
  });

  it("only has real questions for verified chapters, each linked to an objective of its own lesson", () => {
    const objectiveLesson = new Map(verifiedLessons.flatMap((l) => l.objectives.map((o) => [o.id, l.id] as const)));
    expect(scienceG4Term1Bank.filter((q) => objectiveLesson.get(q.objectiveId) !== q.lessonId)).toEqual([]);
    expect(scienceG4Term1Bank.some((q) => q.placeholder)).toBe(false);
  });

  it("gives every verified lesson its school week, key facts and vocabulary", () => {
    for (const lesson of verifiedLessons) {
      expect(lesson.schoolWeek, lesson.id).toBeDefined();
      expect(lesson.keyFacts?.length, lesson.id).toBeGreaterThan(0);
      expect(lesson.vocabulary?.length, lesson.id).toBeGreaterThan(0);
    }
  });

  it("has at least 3 questions for every objective", () => {
    for (const objective of verifiedLessons.flatMap((l) => l.objectives)) {
      expect(scienceG4Term1Bank.filter((q) => q.objectiveId === objective.id).length, objective.id).toBeGreaterThanOrEqual(3);
    }
  });

  it("has enough questions for a fresh basic and medium quiz in every lesson", () => {
    for (const lesson of verifiedLessons) {
      const qs = scienceG4Term1Bank.filter((q) => q.lessonId === lesson.id);
      expect(qs.filter((q) => q.difficulty <= 2).length, lesson.id).toBeGreaterThanOrEqual(DEFAULT_CONFIG.tiers.basic.questionCount);
      expect(qs.filter((q) => q.difficulty >= 2 && q.difficulty <= 4).length, lesson.id).toBeGreaterThanOrEqual(DEFAULT_CONFIG.tiers.standard.questionCount);
    }
  });

  it("has enough hard questions to recognise top students in every lesson", () => {
    for (const lesson of verifiedLessons) {
      const qs = scienceG4Term1Bank.filter((q) => q.lessonId === lesson.id);
      expect(qs.filter((q) => q.difficulty >= 4).length, lesson.id).toBeGreaterThanOrEqual(DEFAULT_CONFIG.tiers.advanced.questionCount + 4);
      expect(qs.filter((q) => q.difficulty === 5).length, lesson.id).toBeGreaterThanOrEqual(4);
    }
  });

  it("can build every quiz type for every lesson", () => {
    for (const lesson of verifiedLessons) {
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
