// حالة الطالب كاملة — كائن JSON واحد يتخزن في قاعدة البيانات ويترجع زي ما هو.
import type { Tier } from "../config";
import type { QuizResult } from "../assessment/grading";
import type { GamificationState, BadgeId } from "../gamification/gamification";
import type { MasteryMap } from "../mastery/mastery";
import type { ISODate } from "../utils/dates";

/**
 * مراحل الدرس:
 * locked (مقفول) → learning (بيتشرح) → homework (واجب) → quiz (الاختبار الأساسي) → passed (نجح)
 * لو رسب في الأساسي مرتين ورا بعض بيرجع learning يراجع ويحل واجب علاجي.
 */
export type LessonStatus = "locked" | "learning" | "homework" | "quiz" | "passed";

export interface TierRecord {
  attempts: number;
  bestScore: number;
  passed: boolean;
  passedOn?: ISODate;
  lastAttemptOn?: ISODate;
}

export interface LessonProgress {
  lessonId: string;
  status: LessonStatus;
  unlockedOn?: ISODate;
  passedOn?: ISODate;
  /** كل حصص الشرح اللي خلصها في الدرس (بما فيها المراجعة العلاجية) */
  learningSessions: number;
  /** حصص الشرح اللي خلصها في المرة دي (الدرس ممكن يبقى حصتين أو تلاتة) */
  sessionsDone: number;
  homeworkScore?: number;
  tiers: Record<Tier, TierRecord>;
  consecutiveBasicFails: number;
  totalBasicFails: number;
  /** نواتج التعلم اللي الواجب العلاجي هيركز عليها */
  remediationObjectiveIds?: string[];
  /** 1 = أساسي، 2 = متوسط، 3 = متفوقين */
  stars: 0 | 1 | 2 | 3;
}

export interface TestRecord {
  attempts: number;
  bestScore: number;
  lastScore?: number;
  passed: boolean;
  takenOn?: ISODate;
  /** رسب ومحتاج اختبار مراجعة على نقط الضعف */
  needsReview: boolean;
  weakLessonIds: string[];
  history: Array<{ date: ISODate; score: number }>;
}

export type JourneyEventType =
  | "lesson_unlocked"
  | "lesson_learned"
  | "homework_done"
  | "tier_passed"
  | "lesson_passed"
  | "quiz_failed"
  | "remediation_required"
  | "weekly_test"
  | "periodic_test"
  | "period_unlocked"
  | "review_done"
  | "final_ready"
  | "final_mock"
  | "badge"
  | "level_up";

export interface JourneyEvent {
  date: ISODate;
  type: JourneyEventType;
  message: string;
  lessonId?: string;
  tier?: Tier;
  score?: number;
  weekNumber?: number;
  periodIndex?: number;
  badge?: BadgeId;
  xp?: number;
}

export interface ParentContact {
  name: string;
  phone?: string;
  email?: string;
}

export interface StudentProfile {
  id: string;
  name: string;
  parent?: ParentContact;
}

/** سؤال سأله الطفل لـ "اسأل المعلم" — بيظهر لولي الأمر لأنه بيكشف الطفل مش فاهم إيه */
export interface TeacherQuestion {
  date: ISODate;
  lessonId: string;
  question: string;
  answer: string;
}

export interface StudentState {
  version: 1;
  student: StudentProfile;
  curriculumId: string;
  startedOn: ISODate;
  lessons: Record<string, LessonProgress>;
  weeklyTests: Record<number, TestRecord>;
  periodicTests: Record<number, TestRecord>;
  finalMocks: TestRecord;
  finalReadyOn?: ISODate;
  summariesViewed: string[];
  mastery: MasteryMap;
  /** آخر مرة شاف فيها كل سؤال */
  seenAt: Record<string, ISODate>;
  quizCounter: number;
  teacherQuestions?: TeacherQuestion[];
  gamification: GamificationState;
  events: JourneyEvent[];
}

/** الحاجات اللي الطالب يقدر يعملها دلوقتي — الواجهة بتعرضها كأزرار/مهام. */
export type AvailableAction =
  | { type: "learn"; lessonId: string; remediation: boolean; session: number; sessions: number }
  | { type: "homework"; lessonId: string; remediation: boolean }
  | { type: "quiz"; lessonId: string; tier: Tier }
  | { type: "weekly_test"; weekNumber: number }
  | { type: "periodic_test"; periodIndex: number }
  | { type: "review"; of: "weekly" | "periodic"; index: number; required: boolean }
  | { type: "unit_summary"; unitId: string }
  | { type: "final_mock" };

export type QuizAction = Exclude<AvailableAction, { type: "learn" } | { type: "unit_summary" }>;

export type NotificationKind = "weekly_report" | "periodic_report" | "stuck_alert" | "final_mock_report";

export interface ParentNotification {
  kind: NotificationKind;
  studentId: string;
  date: ISODate;
  title: string;
  text: string;
}

export interface SubmissionOutcome {
  result: QuizResult;
  passed?: boolean;
  events: JourneyEvent[];
  notifications: ParentNotification[];
}
