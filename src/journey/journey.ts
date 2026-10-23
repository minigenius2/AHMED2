// قلب المساعد: رحلة الطالب في المنهج وقواعد التدرّج.
// - مفيش درس جديد غير لما ينجح في الاختبار الأساسي للدرس اللي قبله.
// - بعد كل درس: واجب، وبعده 3 اختبارات (أساسي / متوسط / متفوقين) كل مرة بأسئلة مختلفة.
// - آخر كل أسبوع: اختبار ونتيجته تتبعت لولي الأمر.
// - كل فترة (شهر أو أسبوعين): اختبار تراكمي، والفترة اللي بعده مقفولة لحد ما ينجح.
// - آخر المنهج: تلخيص لكل فصل + امتحانات تجريبية.
import { DEFAULT_CONFIG, TIER_LABELS_AR, type AssistantConfig, type Tier } from "../config";
import { gradeQuiz, type Answers, type QuizResult } from "../assessment/grading";
import { generateQuiz, type Quiz, type QuizRequest } from "../assessment/quiz";
import type { Curriculum } from "../curriculum/types";
import { listLessons } from "../curriculum/types";
import {
  BADGES,
  levelForXp,
  newGamificationState,
  recordActivity,
  XP_RULES,
  type BadgeId,
} from "../gamification/gamification";
import { averageRating, updateMastery, weakestObjectives } from "../mastery/mastery";
import type { StudyPlan } from "../planner/planner";
import type { Question } from "../questions/types";
import {
  buildFinalMockReport,
  buildPeriodicReport,
  buildStuckAlert,
  buildUnitSummary,
  buildWeeklyReport,
  type UnitSummary,
} from "../reports/parent-report";
import { hashString } from "../utils/random";
import { daysBetween, type ISODate } from "../utils/dates";
import type {
  AvailableAction,
  JourneyEvent,
  LessonProgress,
  ParentNotification,
  QuizAction,
  StudentProfile,
  StudentState,
  SubmissionOutcome,
  TestRecord,
} from "./types";

const TIER_XP: Record<Tier, number> = {
  basic: XP_RULES.basicPassed,
  standard: XP_RULES.standardPassed,
  advanced: XP_RULES.advancedPassed,
};

const TIER_STARS: Record<Tier, 1 | 2 | 3> = { basic: 1, standard: 2, advanced: 3 };

function newTestRecord(): TestRecord {
  return { attempts: 0, bestScore: 0, passed: false, needsReview: false, weakLessonIds: [], history: [] };
}

function newLessonProgress(lessonId: string): LessonProgress {
  return {
    lessonId,
    status: "locked",
    learningSessions: 0,
    tiers: {
      basic: { attempts: 0, bestScore: 0, passed: false },
      standard: { attempts: 0, bestScore: 0, passed: false },
      advanced: { attempts: 0, bestScore: 0, passed: false },
    },
    consecutiveBasicFails: 0,
    totalBasicFails: 0,
    stars: 0,
  };
}

function actionKey(action: AvailableAction): string {
  switch (action.type) {
    case "learn":
    case "homework":
      return `${action.type}:${action.lessonId}`;
    case "quiz":
      return `quiz:${action.lessonId}:${action.tier}`;
    case "weekly_test":
      return `weekly:${action.weekNumber}`;
    case "periodic_test":
      return `periodic:${action.periodIndex}`;
    case "review":
      return `review:${action.of}:${action.index}`;
    case "unit_summary":
      return `summary:${action.unitId}`;
    case "final_mock":
      return "final_mock";
  }
}

const pct = (score: number) => `${Math.round(score * 100)}%`;

export class StudentJourney {
  private readonly lessonObjectives: Map<string, string[]>;
  private readonly lessonTitles: Map<string, string>;
  private readonly lessonUnit: Map<string, string>;

  constructor(
    readonly curriculum: Curriculum,
    readonly plan: StudyPlan,
    readonly bank: readonly Question[],
    private readonly s: StudentState,
    readonly config: AssistantConfig = DEFAULT_CONFIG,
  ) {
    const lessons = listLessons(curriculum);
    this.lessonObjectives = new Map(lessons.map((l) => [l.id, l.objectives.map((o) => o.id)]));
    this.lessonTitles = new Map(lessons.map((l) => [l.id, l.title]));
    this.lessonUnit = new Map(lessons.map((l) => [l.id, l.unitId]));
  }

  static start(
    student: StudentProfile,
    curriculum: Curriculum,
    plan: StudyPlan,
    bank: readonly Question[],
    today: ISODate,
    config: AssistantConfig = DEFAULT_CONFIG,
  ): StudentJourney {
    const state: StudentState = {
      version: 1,
      student,
      curriculumId: curriculum.id,
      startedOn: today,
      lessons: Object.fromEntries(plan.lessonOrder.map((id) => [id, newLessonProgress(id)])),
      weeklyTests: {},
      periodicTests: {},
      finalMocks: newTestRecord(),
      summariesViewed: [],
      mastery: {},
      seenAt: {},
      quizCounter: 0,
      gamification: newGamificationState(),
      events: [],
    };
    const journey = new StudentJourney(curriculum, plan, bank, state, config);
    journey.commit(journey.refreshUnlocks(today));
    return journey;
  }

  /** الحالة كاملة (للتخزين). */
  get state(): Readonly<StudentState> {
    return this.s;
  }

  lesson(lessonId: string): LessonProgress {
    const progress = this.s.lessons[lessonId];
    if (!progress) throw new Error(`Unknown lesson: ${lessonId}`);
    return progress;
  }

  lessonTitle(lessonId: string): string {
    return this.lessonTitles.get(lessonId) ?? lessonId;
  }

  isPeriodPassed(index: number): boolean {
    return this.s.periodicTests[index]?.passed ?? false;
  }

  isFinalPhase(): boolean {
    const allLessons = this.plan.lessonOrder.every((id) => this.lesson(id).status === "passed");
    return allLessons && this.plan.periods.every((p) => this.isPeriodPassed(p.index));
  }

  // ---------------------------------------------------------------- المتاح دلوقتي

  /** لو اتبعت today، اختبارات المتوسط/المتفوقين اللي اتعملت قريب بتختفي لحد ما فترة الانتظار تخلص. */
  availableActions(today?: ISODate): AvailableAction[] {
    const actions: AvailableAction[] = [];
    const cooledDown = (lastAttemptOn?: ISODate) =>
      !today || !lastAttemptOn || daysBetween(lastAttemptOn, today) >= this.config.retry.bonusTierCooldownDays;
    const tooEarly = (plannedDate?: ISODate) =>
      Boolean(today && plannedDate && this.config.schedule.testsNotBeforePlannedDate && today < plannedDate);
    for (const lessonId of this.plan.lessonOrder) {
      const p = this.lesson(lessonId);
      const remediation = p.remediationObjectiveIds !== undefined;
      if (p.status === "learning") actions.push({ type: "learn", lessonId, remediation });
      else if (p.status === "homework") actions.push({ type: "homework", lessonId, remediation });
      else if (p.status === "quiz") actions.push({ type: "quiz", lessonId, tier: "basic" });
      else if (p.status === "passed") {
        const next: Tier | undefined = !p.tiers.standard.passed ? "standard" : !p.tiers.advanced.passed ? "advanced" : undefined;
        if (next && cooledDown(p.tiers[next].lastAttemptOn)) actions.push({ type: "quiz", lessonId, tier: next });
      }
    }

    const weeklyGate = this.config.weeklyTest.gatesNextWeek;
    for (const week of this.plan.weeks) {
      if (week.lessonIds.length === 0 || !week.lessonIds.every((id) => this.lesson(id).status === "passed")) continue;
      if (tooEarly(week.weeklyTestDate)) continue;
      const rec = this.s.weeklyTests[week.number];
      if (!rec || rec.attempts === 0) actions.push({ type: "weekly_test", weekNumber: week.number });
      else if (!rec.passed && rec.needsReview) actions.push({ type: "review", of: "weekly", index: week.number, required: weeklyGate });
      else if (!rec.passed && weeklyGate) actions.push({ type: "weekly_test", weekNumber: week.number });
    }

    for (const period of this.plan.periods) {
      if (period.index > 0 && !this.isPeriodPassed(period.index - 1)) break;
      if (!period.lessonIds.every((id) => this.lesson(id).status === "passed")) break;
      if (tooEarly(period.testDate)) break;
      const rec = this.s.periodicTests[period.index];
      if (rec?.passed) continue;
      if (rec?.needsReview) actions.push({ type: "review", of: "periodic", index: period.index, required: true });
      else actions.push({ type: "periodic_test", periodIndex: period.index });
      break;
    }

    if (this.isFinalPhase()) {
      for (const unit of this.curriculum.units) {
        if (!this.s.summariesViewed.includes(unit.id)) actions.push({ type: "unit_summary", unitId: unit.id });
      }
      actions.push({ type: "final_mock" });
    }
    return actions;
  }

  private assertAvailable(action: AvailableAction, today?: ISODate): void {
    const key = actionKey(action);
    if (!this.availableActions(today).some((a) => actionKey(a) === key)) {
      throw new Error(`Action not available right now: ${key}`);
    }
  }

  // ---------------------------------------------------------------- الشرح والتلخيص

  /** الطالب خلّص حلقة الشرح (أو المراجعة العلاجية) — يروح على الواجب. */
  completeLearning(lessonId: string, today: ISODate): JourneyEvent[] {
    this.assertAvailable({ type: "learn", lessonId, remediation: false });
    const p = this.lesson(lessonId);
    p.status = "homework";
    p.learningSessions++;
    const events: JourneyEvent[] = [];
    if (p.learningSessions === 1) {
      events.push(...this.awardXp(today, XP_RULES.lessonLearned));
    }
    events.push({ date: today, type: "lesson_learned", lessonId, message: `خلّص شرح درس ${this.lessonTitle(lessonId)}` });
    this.s.gamification = recordActivity(this.s.gamification, today);
    events.push(...this.checkStreakBadge(today));
    return this.commit(events);
  }

  viewUnitSummary(unitId: string, today: ISODate): UnitSummary {
    this.assertAvailable({ type: "unit_summary", unitId });
    if (!this.s.summariesViewed.includes(unitId)) this.s.summariesViewed.push(unitId);
    this.s.gamification = recordActivity(this.s.gamification, today);
    return buildUnitSummary(this, unitId);
  }

  // ---------------------------------------------------------------- الاختبارات

  createQuiz(action: QuizAction, today?: ISODate): Quiz {
    this.assertAvailable(action, today);
    const seed = hashString(`${this.s.student.id}|${this.s.quizCounter++}|${actionKey(action)}`);
    return generateQuiz(this.bank, { ...this.quizRequest(action), seed, seenAt: this.s.seenAt });
  }

  private quizRequest(action: QuizAction): Omit<QuizRequest, "seed" | "seenAt"> {
    const c = this.config;
    switch (action.type) {
      case "homework": {
        const p = this.lesson(action.lessonId);
        return {
          kind: "homework",
          lessonIds: [action.lessonId],
          ...c.homework,
          focusObjectiveIds: p.remediationObjectiveIds,
          meta: { lessonId: action.lessonId },
        };
      }
      case "quiz": {
        const tier = c.tiers[action.tier];
        return {
          kind: action.tier,
          lessonIds: [action.lessonId],
          questionCount: tier.questionCount,
          difficulty: tier.difficulty,
          meta: { lessonId: action.lessonId },
        };
      }
      case "weekly_test": {
        const week = this.plan.weeks.find((w) => w.number === action.weekNumber)!;
        const { questionCount, difficulty } = c.weeklyTest;
        return { kind: "weekly", lessonIds: week.lessonIds, questionCount, difficulty, meta: { weekNumber: week.number } };
      }
      case "periodic_test": {
        const recent = this.plan.periods[action.periodIndex]!.lessonIds;
        const older = this.plan.periods.slice(0, action.periodIndex).flatMap((p) => p.lessonIds);
        const { questionCount, difficulty, recentWeight } = c.periodicTest;
        const lessonWeights: Record<string, number> = {};
        const recentShare = older.length === 0 ? 1 : recentWeight;
        recent.forEach((id) => (lessonWeights[id] = recentShare / recent.length));
        older.forEach((id) => (lessonWeights[id] = (1 - recentShare) / older.length));
        return {
          kind: "periodic",
          lessonIds: [...older, ...recent],
          questionCount,
          difficulty,
          lessonWeights,
          meta: { periodIndex: action.periodIndex },
        };
      }
      case "review": {
        const rec = action.of === "weekly" ? this.s.weeklyTests[action.index] : this.s.periodicTests[action.index];
        const scope =
          action.of === "weekly"
            ? this.plan.weeks.find((w) => w.number === action.index)!.lessonIds
            : this.plan.periods[action.index]!.lessonIds;
        const lessonIds = rec && rec.weakLessonIds.length > 0 ? rec.weakLessonIds : scope;
        const objectives = lessonIds.flatMap((id) => this.lessonObjectives.get(id) ?? []);
        return {
          kind: "review",
          lessonIds,
          ...c.review,
          focusObjectiveIds: weakestObjectives(this.s.mastery, objectives, 4),
          meta: action.of === "weekly" ? { reviewOf: "weekly", weekNumber: action.index } : { reviewOf: "periodic", periodIndex: action.index },
        };
      }
      case "final_mock": {
        const { questionCount, difficulty } = c.finalMock;
        return { kind: "final_mock", lessonIds: [...this.plan.lessonOrder], questionCount, difficulty, meta: {} };
      }
    }
  }

  private actionForQuiz(quiz: Quiz): QuizAction {
    const m = quiz.meta;
    switch (quiz.kind) {
      case "homework":
        return { type: "homework", lessonId: m.lessonId!, remediation: false };
      case "basic":
      case "standard":
      case "advanced":
        return { type: "quiz", lessonId: m.lessonId!, tier: quiz.kind };
      case "weekly":
        return { type: "weekly_test", weekNumber: m.weekNumber! };
      case "periodic":
        return { type: "periodic_test", periodIndex: m.periodIndex! };
      case "review":
        return m.reviewOf === "weekly"
          ? { type: "review", of: "weekly", index: m.weekNumber!, required: false }
          : { type: "review", of: "periodic", index: m.periodIndex!, required: true };
      case "final_mock":
        return { type: "final_mock" };
    }
  }

  submit(quiz: Quiz, answers: Answers, today: ISODate): SubmissionOutcome {
    const action = this.actionForQuiz(quiz);
    this.assertAvailable(action, today);
    const result = gradeQuiz(quiz, answers);

    this.s.mastery = updateMastery(this.s.mastery, result.items);
    for (const item of quiz.items) this.s.seenAt[item.questionId] = today;
    this.s.gamification = recordActivity(this.s.gamification, today);

    const events: JourneyEvent[] = [];
    const notifications: ParentNotification[] = [];
    let passed: boolean | undefined;

    switch (action.type) {
      case "homework":
        this.onHomework(action.lessonId, result, today, events);
        break;
      case "quiz":
        passed = this.onTierQuiz(action.lessonId, action.tier, result, today, events, notifications);
        break;
      case "weekly_test":
        passed = this.onWeeklyTest(action.weekNumber, result, today, events, notifications);
        break;
      case "periodic_test":
        passed = this.onPeriodicTest(action.periodIndex, result, today, events, notifications);
        break;
      case "review":
        this.onReview(action.of, action.index, result, today, events);
        break;
      case "final_mock":
        passed = this.onFinalMock(result, today, events, notifications);
        break;
    }

    if (result.total > 0 && result.earned === result.total) {
      events.push(...this.awardXp(today, XP_RULES.perfectBonus));
      events.push(...this.awardBadge("perfect_score", today));
    }
    events.push(...this.checkStreakBadge(today));
    events.push(...this.refreshUnlocks(today));
    return { result, passed, events: this.commit(events), notifications };
  }

  private onHomework(lessonId: string, result: QuizResult, today: ISODate, events: JourneyEvent[]): void {
    const p = this.lesson(lessonId);
    p.homeworkScore = result.score;
    p.status = "quiz";
    if (p.remediationObjectiveIds) {
      p.remediationObjectiveIds = undefined;
      p.consecutiveBasicFails = 0;
    }
    const xp = XP_RULES.homework + (result.score >= 0.8 ? XP_RULES.homeworkExcellent : 0);
    events.push({ date: today, type: "homework_done", lessonId, score: result.score, message: `حل واجب ${this.lessonTitle(lessonId)} (${pct(result.score)})` });
    events.push(...this.awardXp(today, xp));
  }

  private onTierQuiz(
    lessonId: string,
    tier: Tier,
    result: QuizResult,
    today: ISODate,
    events: JourneyEvent[],
    notifications: ParentNotification[],
  ): boolean {
    const p = this.lesson(lessonId);
    const rec = p.tiers[tier];
    rec.attempts++;
    rec.lastAttemptOn = today;
    rec.bestScore = Math.max(rec.bestScore, result.score);
    const tierConfig = this.config.tiers[tier];
    const scored = result.score >= tierConfig.passThreshold;
    const rating = averageRating(this.s.mastery, this.lessonObjectives.get(lessonId) ?? []) ?? 0;
    const passed = scored && (tierConfig.minRating === undefined || rating >= tierConfig.minRating);
    const title = this.lessonTitle(lessonId);

    if (passed) {
      rec.passed = true;
      rec.passedOn = today;
      p.stars = Math.max(p.stars, TIER_STARS[tier]) as LessonProgress["stars"];
      events.push({ date: today, type: "tier_passed", lessonId, tier, score: result.score, message: `نجح في ${TIER_LABELS_AR[tier]} لدرس ${title} (${pct(result.score)})` });
      events.push(...this.awardXp(today, TIER_XP[tier] + (rec.attempts === 1 ? XP_RULES.firstTryBonus : 0)));

      if (tier === "basic") {
        p.status = "passed";
        p.passedOn = today;
        p.consecutiveBasicFails = 0;
        events.push({ date: today, type: "lesson_passed", lessonId, message: `قفل درس ${title} ✅` });
        events.push(...this.awardBadge("first_step", today));
        if (p.totalBasicFails >= 2) events.push(...this.awardBadge("never_give_up", today));
      }
      if (tier === "advanced") events.push(...this.awardBadge("first_gold", today));
      const unitId = this.lessonUnit.get(lessonId)!;
      const unitLessons = this.plan.lessonOrder.filter((id) => this.lessonUnit.get(id) === unitId);
      if (unitLessons.every((id) => this.lesson(id).stars === 3)) events.push(...this.awardBadge("chapter_gold", today));
      return true;
    }

    const message = scored
      ? `درجة حلوة في ${TIER_LABELS_AR[tier]} لدرس ${title} (${pct(result.score)}) — كمّل بنفس المستوى والنجمة جاية`
      : `ماعداش ${TIER_LABELS_AR[tier]} لدرس ${title} (${pct(result.score)}) — هيجرب تاني باختبار جديد`;
    events.push({ date: today, type: "quiz_failed", lessonId, tier, score: result.score, message });
    if (tier === "basic") {
      p.consecutiveBasicFails++;
      p.totalBasicFails++;
      if (p.consecutiveBasicFails >= this.config.retry.remediationAfterFails) {
        p.status = "learning";
        p.remediationObjectiveIds = this.weakObjectivesFrom(result, lessonId);
        events.push({ date: today, type: "remediation_required", lessonId, message: `رجع يراجع درس ${title} مع واجب علاجي على نقط الضعف` });
      }
      if (p.totalBasicFails === this.config.retry.parentAlertAfterFails) notifications.push(buildStuckAlert(this, lessonId, today));
    }
    return false;
  }

  private onWeeklyTest(
    weekNumber: number,
    result: QuizResult,
    today: ISODate,
    events: JourneyEvent[],
    notifications: ParentNotification[],
  ): boolean {
    const threshold = this.config.weeklyTest.passThreshold;
    const rec = this.recordTest(this.s.weeklyTests, weekNumber, result, today, threshold);
    events.push({ date: today, type: "weekly_test", weekNumber, score: result.score, message: `اختبار آخر الأسبوع ${weekNumber}: ${pct(result.score)}` });
    events.push(...this.awardXp(today, Math.round(result.score * XP_RULES.weeklyMax)));
    if (result.score >= 0.9) events.push(...this.awardBadge("weekly_star", today));
    notifications.push(buildWeeklyReport(this, weekNumber, today, result));
    return rec.passed;
  }

  private onPeriodicTest(
    periodIndex: number,
    result: QuizResult,
    today: ISODate,
    events: JourneyEvent[],
    notifications: ParentNotification[],
  ): boolean {
    const threshold = this.config.periodicTest.passThreshold;
    const rec = this.recordTest(this.s.periodicTests, periodIndex, result, today, threshold);
    events.push({ date: today, type: "periodic_test", periodIndex, score: result.score, message: `اختبار الشهر رقم ${periodIndex + 1}: ${pct(result.score)}` });
    events.push(...this.awardXp(today, Math.round(result.score * XP_RULES.periodicMax) + (rec.passed ? XP_RULES.periodicPassBonus : 0)));
    if (rec.passed) {
      events.push(...this.awardBadge("period_passed", today));
      if (periodIndex < this.plan.periods.length - 1) {
        events.push({ date: today, type: "period_unlocked", periodIndex: periodIndex + 1, message: `اتفتحت الفترة رقم ${periodIndex + 2} 🔓` });
      }
    }
    notifications.push(buildPeriodicReport(this, periodIndex, today, result));
    return rec.passed;
  }

  private onReview(of: "weekly" | "periodic", index: number, result: QuizResult, today: ISODate, events: JourneyEvent[]): void {
    const rec = (of === "weekly" ? this.s.weeklyTests : this.s.periodicTests)[index];
    if (rec) rec.needsReview = false;
    events.push({ date: today, type: "review_done", score: result.score, message: `خلّص مراجعة نقط الضعف (${pct(result.score)})` });
    events.push(...this.awardXp(today, XP_RULES.review));
  }

  private onFinalMock(result: QuizResult, today: ISODate, events: JourneyEvent[], notifications: ParentNotification[]): boolean {
    const rec = this.s.finalMocks;
    rec.attempts++;
    rec.lastScore = result.score;
    rec.bestScore = Math.max(rec.bestScore, result.score);
    rec.takenOn = today;
    rec.history.push({ date: today, score: result.score });
    const passed = result.score >= this.config.finalMock.passThreshold;
    if (passed) rec.passed = true;
    events.push({ date: today, type: "final_mock", score: result.score, message: `امتحان تجريبي رقم ${rec.attempts}: ${pct(result.score)}` });
    events.push(...this.awardXp(today, Math.round(result.score * XP_RULES.finalMockMax)));
    if (passed) events.push(...this.awardBadge("ready_for_exam", today));
    notifications.push(buildFinalMockReport(this, today, result));
    return passed;
  }

  private recordTest(
    records: Record<number, TestRecord>,
    index: number,
    result: QuizResult,
    today: ISODate,
    threshold: number,
  ): TestRecord {
    const rec = (records[index] ??= newTestRecord());
    rec.attempts++;
    rec.lastScore = result.score;
    rec.bestScore = Math.max(rec.bestScore, result.score);
    rec.takenOn = today;
    rec.history.push({ date: today, score: result.score });
    rec.passed = rec.passed || result.score >= threshold;
    rec.weakLessonIds = Object.entries(result.byLesson)
      .filter(([, t]) => t.earned / t.total < threshold)
      .map(([id]) => id);
    rec.needsReview = !rec.passed;
    return rec;
  }

  private weakObjectivesFrom(result: QuizResult, lessonId: string): string[] {
    const missed = Object.entries(result.byObjective)
      .filter(([, t]) => t.earned < t.total)
      .sort(([, a], [, b]) => a.earned / a.total - b.earned / b.total)
      .map(([id]) => id)
      .slice(0, 3);
    return missed.length > 0 ? missed : weakestObjectives(this.s.mastery, this.lessonObjectives.get(lessonId) ?? [], 2);
  }

  // ---------------------------------------------------------------- القفل والفتح

  private canUnlock(index: number): boolean {
    const lessonId = this.plan.lessonOrder[index]!;
    if (index > 0 && this.lesson(this.plan.lessonOrder[index - 1]!).status !== "passed") return false;

    const period = this.plan.lessonPeriod[lessonId] ?? 0;
    if (period > 0 && !this.isPeriodPassed(period - 1)) return false;

    if (this.config.weeklyTest.gatesNextWeek) {
      const week = this.plan.lessonWeek[lessonId]!;
      const previous = [...this.plan.weeks].reverse().find((w) => w.number < week && w.lessonIds.length > 0);
      if (previous && !this.s.weeklyTests[previous.number]?.passed) return false;
    }
    return true;
  }

  private refreshUnlocks(today: ISODate): JourneyEvent[] {
    const events: JourneyEvent[] = [];
    this.plan.lessonOrder.forEach((lessonId, i) => {
      const p = this.lesson(lessonId);
      if (p.status === "locked" && this.canUnlock(i)) {
        p.status = "learning";
        p.unlockedOn = today;
        events.push({ date: today, type: "lesson_unlocked", lessonId, message: `اتفتح درس ${this.lessonTitle(lessonId)} 🔓` });
      }
    });
    if (!this.s.finalReadyOn && this.isFinalPhase()) {
      this.s.finalReadyOn = today;
      events.push({ date: today, type: "final_ready", message: "خلّص المنهج كله! 🎉 بدأت مرحلة التلخيص والامتحانات التجريبية" });
    }
    return events;
  }

  // ---------------------------------------------------------------- التحفيز

  private awardXp(today: ISODate, amount: number): JourneyEvent[] {
    if (amount <= 0) return [];
    const g = this.s.gamification;
    const before = levelForXp(g.xp).level;
    g.xp += amount;
    g.xpByDate[today] = (g.xpByDate[today] ?? 0) + amount;
    const after = levelForXp(g.xp);
    if (after.level <= before) return [];
    return [{ date: today, type: "level_up", xp: g.xp, message: `طلع المستوى ${after.level}: ${after.title} 🚀` }];
  }

  private awardBadge(badge: BadgeId, today: ISODate): JourneyEvent[] {
    if (this.s.gamification.badges.includes(badge)) return [];
    this.s.gamification.badges.push(badge);
    return [{ date: today, type: "badge", badge, message: `وسام جديد: ${BADGES[badge].title}` }];
  }

  private checkStreakBadge(today: ISODate): JourneyEvent[] {
    return this.s.gamification.streak.current >= 7 ? this.awardBadge("streak_7", today) : [];
  }

  private commit(events: JourneyEvent[]): JourneyEvent[] {
    this.s.events.push(...events);
    return events;
  }
}
