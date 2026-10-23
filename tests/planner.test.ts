import { describe, expect, it } from "vitest";
import { buildStudyPlan, dayOfWeek, scienceG4Term1, term1Calendar2026 } from "../src/index";
import { tinyPlan } from "./fixtures";

describe("buildStudyPlan", () => {
  const plan = buildStudyPlan(scienceG4Term1, term1Calendar2026);

  it("puts Chapter 1 lessons in the same weeks as school (weekly assessments 1, 2, 3)", () => {
    expect(plan.lessonWeek["ch1-l1"]).toBe(1);
    expect(plan.lessonWeek["ch1-l2"]).toBe(1);
    expect(plan.lessonWeek["ch1-l3"]).toBe(2);
    expect(plan.lessonWeek["ch1-l4"]).toBe(2);
    expect(plan.lessonWeek["ch1-l5"]).toBe(3);
  });

  it("schedules every lesson exactly once, in curriculum order", () => {
    const scheduled = plan.weeks.flatMap((w) => w.lessonIds);
    expect(scheduled).toEqual(plan.lessonOrder);
    const weeks = plan.lessonOrder.map((id) => plan.lessonWeek[id]!);
    expect([...weeks].sort((a, b) => a - b)).toEqual(weeks);
  });

  it("never schedules a session on a holiday or a non-study day", () => {
    const sessions = plan.weeks.flatMap((w) => w.sessions);
    expect(sessions.some((s) => s.date === "2026-10-06")).toBe(false);
    expect(sessions.every((s) => term1Calendar2026.studyDays.includes(dayOfWeek(s.date)))).toBe(true);
  });

  it("keeps the last weeks for final revision and mock exams", () => {
    const kinds = plan.weeks.map((w) => w.kind);
    expect(kinds.slice(-2)).toEqual(["revision", "revision"]);
    expect(plan.weeks.filter((w) => w.kind === "revision").every((w) => w.lessonIds.length === 0)).toBe(true);
  });

  it("covers all lessons with monthly tests, the first one in mid-October", () => {
    expect(plan.periods.flatMap((p) => p.lessonIds)).toEqual(plan.lessonOrder);
    expect(plan.periods[0]!.testDate).toBe("2026-10-15");
    expect(plan.periods[0]!.lessonIds).toContain("ch1-l5");
  });

  it("plans the remaining lessons for a student who joins in the middle of the term", () => {
    const late = buildStudyPlan(scienceG4Term1, { ...term1Calendar2026, startDate: "2026-10-24" });
    expect(late.weeks.flatMap((w) => w.lessonIds)).toEqual(late.lessonOrder);
    expect(late.weeks[0]!.startDate <= "2026-10-24").toBe(true);
    expect(late.weeks.slice(-2).every((w) => w.kind === "revision")).toBe(true);
  });

  it("supports a test every two weeks", () => {
    expect(tinyPlan.periods.length).toBeGreaterThanOrEqual(2);
    expect(tinyPlan.periods.every((p) => p.weekNumbers.length <= 3)).toBe(true);
  });
});
