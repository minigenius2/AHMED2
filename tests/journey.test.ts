import { describe, expect, it } from "vitest";
import { answerAll, DEFAULT_CONFIG, StudentJourney, type AssistantConfig, type Quiz } from "../src/index";
import { startTiny, tinyBank, tinyCurriculum, tinyPlan } from "./fixtures";

const DAY = "2026-09-20";
const right = (quiz: Quiz) => answerAll(quiz, () => true);
const wrong = (quiz: Quiz) => answerAll(quiz, () => false);

function passLesson(j: StudentJourney, lessonId: string, day = DAY) {
  j.completeLearning(lessonId, day);
  j.submit(j.createQuiz({ type: "homework", lessonId, remediation: false }), right(j.createQuiz({ type: "homework", lessonId, remediation: false })), day);
  const quiz = j.createQuiz({ type: "quiz", lessonId, tier: "basic" });
  return j.submit(quiz, right(quiz), day);
}

function doHomework(j: StudentJourney, lessonId: string, day = DAY) {
  const quiz = j.createQuiz({ type: "homework", lessonId, remediation: false });
  return j.submit(quiz, right(quiz), day);
}

function takePeriodic(j: StudentJourney, periodIndex: number, pass: boolean, day = tinyPlan.periods[periodIndex]!.testDate) {
  const quiz = j.createQuiz({ type: "periodic_test", periodIndex });
  return j.submit(quiz, pass ? right(quiz) : wrong(quiz), day);
}

describe("StudentJourney — lesson flow", () => {
  it("starts with only the first lesson open", () => {
    const j = startTiny();
    expect(j.availableActions()).toEqual([{ type: "learn", lessonId: "u1-l1", remediation: false }]);
    expect(j.lesson("u1-l2").status).toBe("locked");
  });

  it("goes learn → homework → basic quiz and refuses shortcuts", () => {
    const j = startTiny();
    expect(() => j.createQuiz({ type: "quiz", lessonId: "u1-l1", tier: "basic" })).toThrow();
    j.completeLearning("u1-l1", DAY);
    expect(j.lesson("u1-l1").status).toBe("homework");
    expect(() => j.createQuiz({ type: "quiz", lessonId: "u1-l1", tier: "basic" })).toThrow();
    doHomework(j, "u1-l1");
    expect(j.lesson("u1-l1").status).toBe("quiz");
    expect(() => j.completeLearning("u1-l2", DAY)).toThrow();
  });

  it("opens the next lesson only after the basic quiz is passed", () => {
    const j = startTiny();
    const outcome = passLesson(j, "u1-l1");
    expect(outcome.passed).toBe(true);
    expect(j.lesson("u1-l1")).toMatchObject({ status: "passed", stars: 1 });
    expect(j.lesson("u1-l2").status).toBe("learning");
    expect(outcome.events.map((e) => e.type)).toContain("lesson_unlocked");
    expect(j.availableActions()).toContainEqual({ type: "quiz", lessonId: "u1-l1", tier: "standard" });
  });

  it("unlocks the medium then the top tier, one attempt per day, and awards stars", () => {
    const config: AssistantConfig = { ...DEFAULT_CONFIG, tiers: { ...DEFAULT_CONFIG.tiers, advanced: { ...DEFAULT_CONFIG.tiers.advanced, minRating: undefined } } };
    const j = startTiny(config);
    passLesson(j, "u1-l1");
    expect(j.availableActions(DAY).some((a) => a.type === "quiz" && a.tier === "advanced")).toBe(false);

    const failStandard = j.createQuiz({ type: "quiz", lessonId: "u1-l1", tier: "standard" }, DAY);
    j.submit(failStandard, wrong(failStandard), DAY);
    expect(j.availableActions(DAY).some((a) => a.type === "quiz" && a.tier === "standard")).toBe(false);
    expect(() => j.createQuiz({ type: "quiz", lessonId: "u1-l1", tier: "standard" }, DAY)).toThrow();

    const nextDay = "2026-09-21";
    const standard = j.createQuiz({ type: "quiz", lessonId: "u1-l1", tier: "standard" }, nextDay);
    j.submit(standard, right(standard), nextDay);
    expect(j.lesson("u1-l1").stars).toBe(2);

    const advanced = j.createQuiz({ type: "quiz", lessonId: "u1-l1", tier: "advanced" }, nextDay);
    j.submit(advanced, right(advanced), nextDay);
    expect(j.lesson("u1-l1").stars).toBe(3);
    expect(j.state.gamification.badges).toContain("first_gold");
  });

  it("does not give the gold star for a lucky score when the student's level is not there yet", () => {
    const config: AssistantConfig = { ...DEFAULT_CONFIG, tiers: { ...DEFAULT_CONFIG.tiers, advanced: { ...DEFAULT_CONFIG.tiers.advanced, minRating: 5000 } } };
    const j = startTiny(config);
    passLesson(j, "u1-l1");
    const standard = j.createQuiz({ type: "quiz", lessonId: "u1-l1", tier: "standard" });
    j.submit(standard, right(standard), DAY);
    const advanced = j.createQuiz({ type: "quiz", lessonId: "u1-l1", tier: "advanced" });
    const outcome = j.submit(advanced, right(advanced), "2026-09-21");
    expect(outcome.passed).toBe(false);
    expect(j.lesson("u1-l1").stars).toBe(2);
  });

  it("sends the student back to review after two basic failures, then alerts the parent on the third", () => {
    const j = startTiny();
    j.completeLearning("u1-l1", DAY);
    doHomework(j, "u1-l1");
    for (let i = 0; i < 2; i++) {
      const quiz = j.createQuiz({ type: "quiz", lessonId: "u1-l1", tier: "basic" });
      j.submit(quiz, wrong(quiz), DAY);
    }
    const lesson = j.lesson("u1-l1");
    expect(lesson.status).toBe("learning");
    expect(lesson.remediationObjectiveIds?.length).toBeGreaterThan(0);
    expect(j.availableActions()).toContainEqual({ type: "learn", lessonId: "u1-l1", remediation: true });

    j.completeLearning("u1-l1", DAY);
    const homework = j.createQuiz({ type: "homework", lessonId: "u1-l1", remediation: true });
    const focus = new Set(lesson.remediationObjectiveIds);
    expect(homework.items.filter((i) => focus.has(i.objectiveId)).length).toBeGreaterThanOrEqual(homework.items.length / 2);
    j.submit(homework, right(homework), DAY);
    expect(j.lesson("u1-l1")).toMatchObject({ status: "quiz", consecutiveBasicFails: 0, remediationObjectiveIds: undefined });

    const third = j.createQuiz({ type: "quiz", lessonId: "u1-l1", tier: "basic" });
    const outcome = j.submit(third, wrong(third), DAY);
    expect(outcome.notifications.map((n) => n.kind)).toEqual(["stuck_alert"]);
    expect(outcome.notifications[0]!.text).toContain("Test Kid");
    expect(j.lesson("u1-l2").status).toBe("locked");
  });
});

describe("StudentJourney — weekly and monthly tests", () => {
  it("opens the weekly test when the week's lessons are done and reports to the parent", () => {
    const j = startTiny();
    expect(j.availableActions().some((a) => a.type === "weekly_test")).toBe(false);
    passLesson(j, "u1-l1");
    expect(j.availableActions()).toContainEqual({ type: "weekly_test", weekNumber: 1 });
    const quiz = j.createQuiz({ type: "weekly_test", weekNumber: 1 });
    const outcome = j.submit(quiz, right(quiz), "2026-09-24");
    expect(outcome.notifications).toHaveLength(1);
    expect(outcome.notifications[0]).toMatchObject({ kind: "weekly_report", studentId: "kid-1" });
    expect(outcome.notifications[0]!.text).toContain("تقرير الأسبوع 1");
    expect(j.availableActions().some((a) => a.type === "weekly_test" && a.weekNumber === 1)).toBe(false);
  });

  it("keeps the next period locked until the cumulative test is passed", () => {
    const j = startTiny();
    passLesson(j, "u1-l1");
    passLesson(j, "u1-l2");
    expect(j.lesson("u2-l1").status).toBe("locked");
    expect(j.availableActions()).toContainEqual({ type: "periodic_test", periodIndex: 0 });

    const failed = takePeriodic(j, 0, false);
    expect(failed.passed).toBe(false);
    expect(failed.notifications[0]!.kind).toBe("periodic_report");
    expect(j.availableActions()).toContainEqual({ type: "review", of: "periodic", index: 0, required: true });
    expect(j.availableActions().some((a) => a.type === "periodic_test")).toBe(false);

    const review = j.createQuiz({ type: "review", of: "periodic", index: 0, required: true });
    j.submit(review, right(review), tinyPlan.periods[0]!.testDate);
    const passed = takePeriodic(j, 0, true);
    expect(passed.passed).toBe(true);
    expect(passed.events.map((e) => e.type)).toEqual(expect.arrayContaining(["period_unlocked", "lesson_unlocked"]));
    expect(j.lesson("u2-l1").status).toBe("learning");
  });

  it("does not open end-of-week and monthly tests before their planned date", () => {
    const j = startTiny();
    passLesson(j, "u1-l1");
    expect(j.availableActions("2026-09-22").some((a) => a.type === "weekly_test")).toBe(false);
    expect(j.availableActions("2026-09-24")).toContainEqual({ type: "weekly_test", weekNumber: 1 });
    passLesson(j, "u1-l2");
    expect(j.availableActions("2026-09-29").some((a) => a.type === "periodic_test")).toBe(false);
    expect(j.availableActions(tinyPlan.periods[0]!.testDate)).toContainEqual({ type: "periodic_test", periodIndex: 0 });
  });

  it("can also lock the next week behind the weekly test", () => {
    const j = startTiny({ ...DEFAULT_CONFIG, weeklyTest: { ...DEFAULT_CONFIG.weeklyTest, gatesNextWeek: true } });
    passLesson(j, "u1-l1");
    expect(j.lesson("u1-l2").status).toBe("locked");
    const quiz = j.createQuiz({ type: "weekly_test", weekNumber: 1 });
    j.submit(quiz, right(quiz), "2026-09-24");
    expect(j.lesson("u1-l2").status).toBe("learning");
  });
});

describe("StudentJourney — end of term", () => {
  it("unlocks chapter summaries and mock exams after the whole curriculum is passed", () => {
    const j = startTiny();
    passLesson(j, "u1-l1");
    passLesson(j, "u1-l2");
    takePeriodic(j, 0, true);
    passLesson(j, "u2-l1");
    passLesson(j, "u2-l2");
    expect(j.isFinalPhase()).toBe(false);
    const last = takePeriodic(j, 1, true);
    expect(last.events.map((e) => e.type)).toContain("final_ready");
    expect(j.isFinalPhase()).toBe(true);

    const actions = j.availableActions();
    expect(actions).toEqual(expect.arrayContaining([{ type: "unit_summary", unitId: "u1" }, { type: "unit_summary", unitId: "u2" }, { type: "final_mock" }]));
    expect(j.viewUnitSummary("u1", DAY).points).toEqual(["Point A", "Point B"]);

    const mock = j.createQuiz({ type: "final_mock" });
    expect(new Set(mock.items.map((i) => i.lessonId)).size).toBe(4);
    const outcome = j.submit(mock, right(mock), DAY);
    expect(outcome.notifications[0]!.kind).toBe("final_mock_report");
    expect(j.state.gamification.badges).toContain("ready_for_exam");
  });

  it("survives saving and loading the state as JSON", () => {
    const j = startTiny();
    passLesson(j, "u1-l1");
    const restored = new StudentJourney(tinyCurriculum, tinyPlan, tinyBank, JSON.parse(JSON.stringify(j.state)));
    expect(restored.availableActions()).toEqual(j.availableActions());
    passLesson(restored, "u1-l2");
    expect(restored.lesson("u1-l2").status).toBe("passed");
  });
});
