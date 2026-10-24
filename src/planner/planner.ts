// المخطِّط: بياخد المنهج + تقويم الترم ويطلع جدول أسبوع بأسبوع:
// كل أسبوع فيه دروس إيه، كل يوم حلقة إيه، اختبار آخر الأسبوع إمتى، واختبار الشهر إمتى،
// وفي الآخر أسابيع مراجعة نهائية وامتحانات تجريبية.
import { listLessons, type Curriculum } from "../curriculum/types";
import { addDays, dayOfWeek, isBetween, type ISODate } from "../utils/dates";

export interface Holiday {
  from: ISODate;
  to: ISODate;
  name: string;
}

export interface TermCalendar {
  /** ممكن يكون أول الترم، أو يوم اشتراك الطالب لو بدأ في نص الترم */
  startDate: ISODate;
  /** آخر يوم قبل امتحان آخر الترم */
  endDate: ISODate;
  holidays: Holiday[];
  /** أول يوم في الأسبوع (6 = السبت) */
  weekStartsOn: number;
  /** أيام المذاكرة مع المساعد (0 = الأحد ... 6 = السبت) */
  studyDays: number[];
  /** يوم اختبار آخر الأسبوع */
  weeklyTestDay: number;
}

export interface PlanOptions {
  /** عدد أسابيع المراجعة النهائية قبل الامتحان */
  revisionWeeks: number;
  /** اختبار تراكمي كل كام أسبوع دراسة (2 = كل أسبوعين، 4 = كل شهر) */
  periodicEveryWeeks: number;
  /**
   * إزاي نستخدم schoolWeek (رقم التقييم الأسبوعي في كتاب التقييمات):
   * - spread: أسابيع المدرسة بتتوزع بالتساوي على أسابيع الشرح المتاحة، والأسابيع الزيادة تبقى مراجعة وتعويض في النص
   *   (المدرسة نفسها بتاخد أسابيع للتقييمات الشهرية والإجازات).
   * - exact: أسبوع المدرسة رقم n = أسبوع الشرح رقم n بالظبط.
   */
  schoolWeekMode: "spread" | "exact";
}

export const DEFAULT_PLAN_OPTIONS: PlanOptions = { revisionWeeks: 2, periodicEveryWeeks: 4, schoolWeekMode: "spread" };

export type WeekKind = "teaching" | "catch_up" | "holiday" | "revision";

export interface PlannedSession {
  date: ISODate;
  lessonId: string;
  /** رقم الحلقة داخل الدرس (1، 2، ...) */
  part: number;
  ofParts: number;
}

export interface PlanWeek {
  number: number;
  startDate: ISODate;
  endDate: ISODate;
  kind: WeekKind;
  studyDates: ISODate[];
  lessonIds: string[];
  sessions: PlannedSession[];
  weeklyTestDate?: ISODate;
  /** لو الأسبوع ده بيقفل فترة: رقم اختبار الشهر */
  periodicTestIndex?: number;
  periodicTestDate?: ISODate;
  holidayNames: string[];
}

export interface PlanPeriod {
  index: number;
  weekNumbers: number[];
  lessonIds: string[];
  testWeek: number;
  testDate: ISODate;
}

export interface StudyPlan {
  curriculumId: string;
  calendar: TermCalendar;
  options: PlanOptions;
  weeks: PlanWeek[];
  periods: PlanPeriod[];
  lessonOrder: string[];
  lessonWeek: Record<string, number>;
  lessonPeriod: Record<string, number>;
  examDate: ISODate;
}

export function buildStudyPlan(
  curriculum: Curriculum,
  calendar: TermCalendar,
  overrides: Partial<PlanOptions> = {},
): StudyPlan {
  const options: PlanOptions = { ...DEFAULT_PLAN_OPTIONS, ...overrides };
  if (calendar.endDate < calendar.startDate) throw new Error("Term end date is before start date");
  const lessons = listLessons(curriculum);
  const weeks = enumerateWeeks(calendar);

  // آخر أسابيع فيها مذاكرة = مراجعة نهائية، والباقي أسابيع شرح
  const activeWeeks = weeks.filter((w) => w.kind !== "holiday");
  const revisionCount = Math.min(options.revisionWeeks, Math.max(0, activeWeeks.length - 1));
  activeWeeks.slice(activeWeeks.length - revisionCount).forEach((w) => (w.kind = "revision"));
  const teachingWeeks = weeks.filter((w) => w.kind === "teaching");
  if (teachingWeeks.length === 0) throw new Error("No teaching weeks available in this calendar");

  const assignment = assignLessonsToWeeks(lessons, teachingWeeks, options.schoolWeekMode);
  const lessonWeek: Record<string, number> = {};
  lessons.forEach((lesson, i) => {
    const week = teachingWeeks[assignment[i] as number] as PlanWeek;
    week.lessonIds.push(lesson.id);
    lessonWeek[lesson.id] = week.number;
  });

  const sessionsByLesson = new Map(lessons.map((l) => [l.id, l.sessions]));
  for (const week of teachingWeeks) {
    if (week.lessonIds.length === 0) {
      week.kind = "catch_up";
      continue;
    }
    week.sessions = scheduleSessions(week, sessionsByLesson);
    week.weeklyTestDate = pickTestDate(week, calendar);
  }

  const periods = buildPeriods(weeks, options, calendar);
  const lessonPeriod: Record<string, number> = {};
  periods.forEach((p) => p.lessonIds.forEach((id) => (lessonPeriod[id] = p.index)));

  return {
    curriculumId: curriculum.id,
    calendar,
    options,
    weeks,
    periods,
    lessonOrder: lessons.map((l) => l.id),
    lessonWeek,
    lessonPeriod,
    examDate: calendar.endDate,
  };
}

function isHoliday(date: ISODate, calendar: TermCalendar): Holiday | undefined {
  return calendar.holidays.find((h) => isBetween(date, h.from, h.to));
}

function enumerateWeeks(calendar: TermCalendar): PlanWeek[] {
  let weekStart = calendar.startDate;
  while (dayOfWeek(weekStart) !== calendar.weekStartsOn) weekStart = addDays(weekStart, -1);

  const weeks: PlanWeek[] = [];
  for (let start = weekStart; start <= calendar.endDate; start = addDays(start, 7)) {
    const end = addDays(start, 6);
    const studyDates: ISODate[] = [];
    const holidayNames = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const date = addDays(start, i);
      if (!isBetween(date, calendar.startDate, calendar.endDate)) continue;
      const holiday = isHoliday(date, calendar);
      if (holiday) holidayNames.add(holiday.name);
      else if (calendar.studyDays.includes(dayOfWeek(date))) studyDates.push(date);
    }
    weeks.push({
      number: weeks.length + 1,
      startDate: start,
      endDate: end,
      kind: studyDates.length === 0 ? "holiday" : "teaching",
      studyDates,
      lessonIds: [],
      sessions: [],
      holidayNames: [...holidayNames],
    });
  }
  return weeks;
}

/**
 * بيرجع لكل درس رقم أسبوع الشرح (index في teachingWeeks).
 * - الدروس اللي ليها schoolWeek بتتحط في أسبوعها عشان الطالب يفضل ماشي مع المدرسة.
 * - الباقي بيتوزع بالتناسب على الأسابيع اللي بعد آخر درس مثبّت، حسب عدد الحلقات وعدد أيام المذاكرة.
 */
function assignLessonsToWeeks(
  lessons: ReturnType<typeof listLessons>,
  teachingWeeks: PlanWeek[],
  mode: PlanOptions["schoolWeekMode"],
): number[] {
  const last = teachingWeeks.length - 1;
  if (mode === "spread" && lessons.every((l) => l.schoolWeek !== undefined)) {
    // كل الدروس ليها أسبوع مدرسة: نوزع أسابيع المدرسة بالتساوي على أسابيع الشرح، مع الحفاظ على ترتيبها
    const schoolWeeks = Math.max(...lessons.map((l) => l.schoolWeek!));
    const slots = teachingWeeks.length;
    return lessons.map((l) => Math.min(last, Math.floor(((l.schoolWeek! - 1) * slots) / schoolWeeks)));
  }
  const result: number[] = [];
  let floor = 0;
  let i = 0;
  while (i < lessons.length) {
    const lesson = lessons[i]!;
    if (lesson.schoolWeek !== undefined) {
      const week = Math.min(last, Math.max(floor, lesson.schoolWeek - 1));
      result.push(week);
      floor = week;
      i++;
      continue;
    }
    // مجموعة دروس متتالية من غير schoolWeek: تتوزع على المساحة المتاحة لحد الدرس المثبّت اللي بعدها
    let j = i;
    while (j < lessons.length && lessons[j]!.schoolWeek === undefined) j++;
    const nextPinned = j < lessons.length ? Math.min(last, lessons[j]!.schoolWeek! - 1) : last;
    const firstFree = result.length > 0 ? Math.min(last, floor + 1) : 0;
    const from = Math.min(firstFree, nextPinned);
    const to = Math.max(from, j < lessons.length ? nextPinned - 1 : last);
    distributeProportionally(lessons.slice(i, j), teachingWeeks.slice(from, to + 1)).forEach((w) => result.push(from + w));
    floor = result[result.length - 1] ?? floor;
    i = j;
  }
  return result;
}

/** قاعدة "منتصف الدرس": الدرس بيروح للأسبوع اللي بيقع فيه منتصف حلقاته على خط الزمن. */
function distributeProportionally(lessons: Array<{ sessions: number }>, weeks: PlanWeek[]): number[] {
  const totalSessions = lessons.reduce((sum, l) => sum + l.sessions, 0);
  const capacities = weeks.map((w) => w.studyDates.length);
  const totalCapacity = capacities.reduce((a, b) => a + b, 0);
  const result: number[] = [];
  let consumed = 0;
  for (const lesson of lessons) {
    const position = ((consumed + lesson.sessions / 2) / totalSessions) * totalCapacity;
    let cumulative = 0;
    let week = weeks.length - 1;
    for (let w = 0; w < weeks.length; w++) {
      cumulative += capacities[w] as number;
      if (position < cumulative) {
        week = w;
        break;
      }
    }
    result.push(week);
    consumed += lesson.sessions;
  }
  return result;
}

function scheduleSessions(week: PlanWeek, sessionsByLesson: Map<string, number>): PlannedSession[] {
  const parts = week.lessonIds.flatMap((lessonId) => {
    const count = sessionsByLesson.get(lessonId) ?? 1;
    return Array.from({ length: count }, (_, i) => ({ lessonId, part: i + 1, ofParts: count }));
  });
  const days = week.studyDates.length;
  return parts.map((p, k) => ({ ...p, date: week.studyDates[Math.floor((k * days) / parts.length)] as ISODate }));
}

function pickTestDate(week: PlanWeek, calendar: TermCalendar): ISODate {
  for (let i = 0; i < 7; i++) {
    const date = addDays(week.startDate, i);
    if (
      dayOfWeek(date) === calendar.weeklyTestDay &&
      isBetween(date, calendar.startDate, calendar.endDate) &&
      !isHoliday(date, calendar)
    ) {
      return date;
    }
  }
  return week.studyDates[week.studyDates.length - 1] as ISODate;
}

function buildPeriods(weeks: PlanWeek[], options: PlanOptions, calendar: TermCalendar): PlanPeriod[] {
  const studyWeeks = weeks.filter((w) => w.kind === "teaching" || w.kind === "catch_up");
  const periods: PlanPeriod[] = [];
  let bucket: PlanWeek[] = [];
  studyWeeks.forEach((week, i) => {
    bucket.push(week);
    const isLast = i === studyWeeks.length - 1;
    if (bucket.length < options.periodicEveryWeeks && !isLast) return;
    const lessonIds = bucket.flatMap((w) => w.lessonIds);
    if (lessonIds.length === 0 && !isLast) return; // فترة من غير دروس بتتدمج في اللي بعدها
    const testWeek = week;
    const testDate = testWeek.weeklyTestDate ?? pickTestDate(testWeek, calendar);
    const previous = periods[periods.length - 1];
    if (isLast && previous && (lessonIds.length === 0 || bucket.length <= Math.floor(options.periodicEveryWeeks / 2))) {
      // آخر فترة قصيرة أو فاضية: تتضم للفترة اللي قبلها واختبارها يتأخر لآخر أسبوع
      const oldTestWeek = weeks.find((w) => w.number === previous.testWeek);
      if (oldTestWeek) {
        oldTestWeek.periodicTestIndex = undefined;
        oldTestWeek.periodicTestDate = undefined;
      }
      previous.weekNumbers.push(...bucket.map((w) => w.number));
      previous.lessonIds.push(...lessonIds);
      previous.testWeek = testWeek.number;
      previous.testDate = testDate;
      testWeek.periodicTestIndex = previous.index;
      testWeek.periodicTestDate = testDate;
      return;
    }
    if (lessonIds.length === 0) return;
    testWeek.periodicTestIndex = periods.length;
    testWeek.periodicTestDate = testDate;
    periods.push({
      index: periods.length,
      weekNumbers: bucket.map((w) => w.number),
      lessonIds,
      testWeek: testWeek.number,
      testDate,
    });
    bucket = [];
  });
  return periods;
}
