// تقارير ولي الأمر: رسالة قصيرة وواضحة بالعربي تنفع تتبعت واتساب/SMS/إيميل أو تظهر في تطبيق ولي الأمر.
import type { AssistantConfig } from "../config";
import type { QuizResult, Tally } from "../assessment/grading";
import type { Curriculum } from "../curriculum/types";
import { listLessons } from "../curriculum/types";
import { levelForXp } from "../gamification/gamification";
import { averageRating, LEVEL_LABELS_AR, levelFromRating } from "../mastery/mastery";
import type { StudyPlan } from "../planner/planner";
import { EXAM_STYLE_LABELS_AR, type ExamStyle } from "../questions/types";
import type { ISODate } from "../utils/dates";
import type { ParentNotification, StudentState } from "../journey/types";

/** أي حاجة عندها المنهج والخطة وحالة الطالب (StudentJourney بيحقق ده). */
export interface ReportSource {
  readonly curriculum: Curriculum;
  readonly plan: StudyPlan;
  readonly config: AssistantConfig;
  readonly state: Readonly<StudentState>;
}

const pct = (score: number) => `${Math.round(score * 100)}%`;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const stars = (n: number) => "⭐".repeat(n) + "☆".repeat(3 - n);

export function scoreBand(score: number): string {
  if (score >= 0.9) return "ممتاز";
  if (score >= 0.75) return "جيد جدًا";
  if (score >= 0.6) return "جيد";
  if (score >= 0.5) return "مقبول";
  return "محتاج مراجعة";
}

function advice(score: number): string {
  if (score >= 0.9) return "مستوى ممتاز 👏 شجّعه يجرّب اختبارات المتفوقين ويجمع نجوم ذهبية.";
  if (score >= 0.75) return "مستوى جيد جدًا. لو راجعتوا مع بعض النقط اللي تحت هيوصل للامتياز.";
  if (score >= 0.6) return "مستوى جيد بس محتاج تثبيت. المساعد هيديله مراجعة مركزة على نقط الضعف.";
  return "محتاج متابعة الأسبوع ده. المساعد جهّز له مراجعة مركزة — يا ريت تقعد معاه ربع ساعة يوميًا.";
}

function lessonInfo(src: ReportSource) {
  return new Map(listLessons(src.curriculum).map((l) => [l.id, l]));
}

function lessonName(src: ReportSource, lessonId: string): string {
  const lesson = lessonInfo(src).get(lessonId);
  if (!lesson) return lessonId;
  return lesson.titleAr ? `${lesson.titleAr} (${lesson.title})` : lesson.title;
}

function lessonLine(src: ReportSource, lessonId: string): string {
  const lesson = lessonInfo(src).get(lessonId);
  const progress = src.state.lessons[lessonId];
  if (!lesson || !progress) return `• ${lessonId}`;
  const rating = averageRating(src.state.mastery, lesson.objectives.map((o) => o.id));
  const level = progress.status !== "passed" ? "لسه ماخلصش الدرس" : rating === undefined ? "—" : LEVEL_LABELS_AR[levelFromRating(rating)];
  return `• ${lessonName(src, lessonId)}: ${stars(progress.stars)} — ${level}`;
}

function styleSummary(byStyle: Partial<Record<ExamStyle, Tally>>): { strong: string[]; weak: string[] } {
  const strong: string[] = [];
  const weak: string[] = [];
  for (const [style, t] of Object.entries(byStyle) as Array<[ExamStyle, Tally]>) {
    const ratio = t.earned / t.total;
    if (t.total >= 2 && ratio >= 0.85) strong.push(EXAM_STYLE_LABELS_AR[style]);
    else if (ratio < 0.6) weak.push(EXAM_STYLE_LABELS_AR[style]);
  }
  return { strong, weak };
}

function weakObjectiveLines(src: ReportSource, result: QuizResult, limit = 3): string[] {
  const objectives = new Map(
    listLessons(src.curriculum).flatMap((l) => l.objectives.map((o) => [o.id, { lessonId: l.id, text: o.text }] as const)),
  );
  return Object.entries(result.byObjective)
    .filter(([, t]) => t.earned / t.total < 0.6)
    .sort(([, a], [, b]) => a.earned / a.total - b.earned / b.total)
    .slice(0, limit)
    .map(([id]) => {
      const o = objectives.get(id);
      return o ? `  - ${lessonInfo(src).get(o.lessonId)?.titleAr ?? o.lessonId}: ${o.text}` : `  - ${id}`;
    });
}

function progressFooter(src: ReportSource, from?: ISODate, to?: ISODate): string {
  const g = src.state.gamification;
  const level = levelForXp(g.xp);
  const weekXp =
    from && to
      ? Object.entries(g.xpByDate)
          .filter(([d]) => d >= from && d <= to)
          .reduce((sum, [, xp]) => sum + xp, 0)
      : undefined;
  const parts = [`🔥 ${g.streak.current} يوم متواصل`, `🏅 ${g.xp} نقطة${weekXp !== undefined ? ` (+${weekXp} الأسبوع ده)` : ""}`, `🎮 المستوى ${level.level}: ${level.title}`];
  return parts.join(" | ");
}

function header(src: ReportSource, title: string): string {
  return `${title}\nالطالب: ${src.state.student.name} — ${src.curriculum.subject} (${src.curriculum.grade})`;
}

function notification(src: ReportSource, kind: ParentNotification["kind"], date: ISODate, title: string, lines: string[]): ParentNotification {
  // سطر فاضي واحد بين الأجزاء، من غير سطور فاضية متكررة
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return { kind, studentId: src.state.student.id, date, title, text };
}

/** تقرير الأسبوع — بيتبعت بعد اختبار آخر الأسبوع، أو في آخر يوم في الأسبوع لو لسه ماخلصش دروسه. */
export function buildWeeklyReport(src: ReportSource, weekNumber: number, today: ISODate, result?: QuizResult): ParentNotification {
  const week = src.plan.weeks.find((w) => w.number === weekNumber);
  if (!week) throw new Error(`Unknown week: ${weekNumber}`);
  const title = `📘 تقرير الأسبوع ${weekNumber}`;
  const done = week.lessonIds.filter((id) => src.state.lessons[id]?.status === "passed").length;
  const lines = [header(src, title), `📅 من ${week.startDate} إلى ${week.endDate}`, ""];

  lines.push(`✅ دروس الأسبوع: خلّص ${done} من ${week.lessonIds.length}`);
  if (result) {
    lines.push(`📝 اختبار آخر الأسبوع: ${fmt(result.earned)}/${result.total} (${pct(result.score)}) — ${scoreBand(result.score)}`);
  } else {
    lines.push("📝 اختبار آخر الأسبوع: لسه — هيتفتح أول ما يخلّص دروس الأسبوع");
  }
  lines.push("", "⭐ مستوى كل درس:", ...week.lessonIds.map((id) => lessonLine(src, id)));

  if (result) {
    const { strong, weak } = styleSummary(result.byStyle);
    if (strong.length) lines.push("", `💪 قوي في أسئلة: ${strong.join("، ")}`);
    if (weak.length) lines.push(`⚠️ محتاج يركز على أسئلة: ${weak.join("، ")}`);
    const weakLines = weakObjectiveLines(src, result);
    if (weakLines.length) lines.push("📌 نقط محتاجة مراجعة:", ...weakLines);
  }

  lines.push("", progressFooter(src, week.startDate, week.endDate));
  lines.push(`💡 ${result ? advice(result.score) : "يا ريت تشجعه يكمّل دروس الأسبوع عشان يلحق اختبار آخر الأسبوع."}`);
  return notification(src, "weekly_report", today, title, lines);
}

export function buildPeriodicReport(src: ReportSource, periodIndex: number, today: ISODate, result: QuizResult): ParentNotification {
  const period = src.plan.periods[periodIndex];
  if (!period) throw new Error(`Unknown period: ${periodIndex}`);
  const passed = result.score >= src.config.periodicTest.passThreshold;
  const attempts = src.state.periodicTests[periodIndex]?.attempts ?? 1;
  const title = `🗓️ نتيجة اختبار الشهر رقم ${periodIndex + 1}`;
  const lines = [
    header(src, title),
    `يغطي كل اللي اتذاكر لحد الأسبوع ${period.testWeek} (المحاولة رقم ${attempts})`,
    "",
    `📝 الدرجة: ${fmt(result.earned)}/${result.total} (${pct(result.score)}) — ${scoreBand(result.score)}`,
    passed
      ? "✅ نجح — واتفتحت له الفترة اللي بعدها."
      : `❌ ماوصلش لدرجة النجاح (${pct(src.config.periodicTest.passThreshold)}). الفترة الجاية هتفضل مقفولة لحد ما يراجع ويعيد الاختبار بأسئلة جديدة.`,
  ];
  const { strong, weak } = styleSummary(result.byStyle);
  if (strong.length) lines.push(`💪 قوي في أسئلة: ${strong.join("، ")}`);
  if (weak.length) lines.push(`⚠️ محتاج يركز على أسئلة: ${weak.join("، ")}`);
  const weakLines = weakObjectiveLines(src, result, 4);
  if (weakLines.length) lines.push("📌 نقط محتاجة مراجعة:", ...weakLines);
  lines.push("", progressFooter(src), `💡 ${advice(result.score)}`);
  return notification(src, "periodic_report", today, title, lines);
}

export function buildStuckAlert(src: ReportSource, lessonId: string, today: ISODate): ParentNotification {
  const fails = src.state.lessons[lessonId]?.totalBasicFails ?? 0;
  const title = "⚠️ تنبيه: محتاج مساعدتك";
  const lines = [
    header(src, title),
    "",
    `${src.state.student.name} حاول ${fails} مرات في الاختبار الأساسي لدرس ${lessonName(src, lessonId)} ولسه ماعداش.`,
    "المساعد رجّعه يراجع الدرس وحل واجب علاجي مركز على النقط اللي بيغلط فيها.",
    "💡 يا ريت تقعد معاه 10 دقايق وتسأله يشرحلك الدرس بكلامه — ده بيفرق جدًا.",
  ];
  return notification(src, "stuck_alert", today, title, lines);
}

export function buildFinalMockReport(src: ReportSource, today: ISODate, result: QuizResult): ParentNotification {
  const rec = src.state.finalMocks;
  const title = `🎓 امتحان تجريبي نهائي رقم ${rec.attempts}`;
  const lines = [
    header(src, title),
    "",
    `📝 الدرجة: ${fmt(result.earned)}/${result.total} (${pct(result.score)}) — ${scoreBand(result.score)}`,
    rec.attempts > 1 ? `📈 أحسن درجة لحد دلوقتي: ${pct(rec.bestScore)}` : "",
    `📅 الامتحان الحقيقي: ${src.plan.examDate}`,
  ];
  const weakLines = weakObjectiveLines(src, result, 5);
  if (weakLines.length) lines.push("📌 يراجع قبل الامتحان:", ...weakLines);
  lines.push("", progressFooter(src), `💡 ${advice(result.score)}`);
  return notification(src, "final_mock_report", today, title, lines);
}

export interface UnitSummary {
  unitId: string;
  title: string;
  points: string[];
  lessonsToReview: Array<{ lessonId: string; title: string; reason: string }>;
}

/** تلخيص الفصل في مرحلة المراجعة النهائية + الدروس اللي محتاج يرجعلها تحديدًا. */
export function buildUnitSummary(src: ReportSource, unitId: string): UnitSummary {
  const unit = src.curriculum.units.find((u) => u.id === unitId);
  if (!unit) throw new Error(`Unknown unit: ${unitId}`);
  const lessonsToReview = unit.lessons.flatMap((lesson) => {
    const progress = src.state.lessons[lesson.id];
    const rating = averageRating(src.state.mastery, lesson.objectives.map((o) => o.id));
    if (rating !== undefined && levelFromRating(rating) === "needs_support") {
      return [{ lessonId: lesson.id, title: lesson.title, reason: "مستواه فيه لسه محتاج دعم" }];
    }
    if (progress && progress.stars < 2) return [{ lessonId: lesson.id, title: lesson.title, reason: "لسه ماعداش اختبار المستوى المتوسط" }];
    return [];
  });
  return {
    unitId,
    title: unit.title,
    points: unit.summary ?? unit.lessons.flatMap((l) => l.keyFacts ?? []),
    lessonsToReview,
  };
}
