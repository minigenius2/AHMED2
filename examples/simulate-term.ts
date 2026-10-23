// محاكاة ترم كامل لطالب افتراضي: بيمشي على الخطة يوم بيوم، يذاكر ويحل الواجبات والاختبارات،
// والمساعد بيقفل ويفتح الدروس ويبعت تقارير لولي الأمر.
//
// التشغيل:   npm run simulate
//            npm run simulate -- --ability=980 --verbose
import {
  BADGES,
  buildStudyPlan,
  buildWeeklyReport,
  ConsoleNotifier,
  formatPlan,
  levelForXp,
  LEVEL_LABELS_AR,
  levelFromRating,
  averageRating,
  listLessons,
  scienceG4Term1,
  scienceG4Term1DemoBank,
  SimulatedStudent,
  StudentJourney,
  term1Calendar2026,
  addDays,
  type AvailableAction,
  type ParentNotification,
  type QuizAction,
} from "../src/index";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k as string, v ?? "true"];
  }),
);
const ability = Number(args.get("ability") ?? 1120);
const verbose = args.has("verbose");

const curriculum = scienceG4Term1;
const plan = buildStudyPlan(curriculum, term1Calendar2026);
const student = { id: "student-001", name: "يوسف", parent: { name: "ولي أمر يوسف", phone: "+20 10x xxx xxxx" } };
const journey = StudentJourney.start(student, curriculum, plan, scienceG4Term1DemoBank, plan.calendar.startDate);
const kid = new SimulatedStudent(ability);
const notifier = new ConsoleNotifier();
const notifications: ParentNotification[] = [];

console.log(formatPlan(plan, curriculum));
console.log(`\n🧒 بدء المحاكاة: ${student.name} — مستوى مبدئي ${ability}\n`);

const firstSession = new Map<string, string>();
for (const week of plan.weeks) for (const s of week.sessions) if (!firstSession.has(s.lessonId)) firstSession.set(s.lessonId, s.date);
const studyDates = new Set(plan.weeks.flatMap((w) => w.studyDates));
const testDates = new Set(plan.weeks.flatMap((w) => (w.weeklyTestDate ? [w.weeklyTestDate] : [])));

function pickAction(actions: AvailableAction[], today: string, triedTiers: Set<string>, mocksToday: number): AvailableAction | undefined {
  const week = plan.weeks.find((w) => today >= w.startDate && today <= w.endDate);
  return (
    actions.find((a) => a.type === "review" && a.required) ??
    actions.find((a) => a.type === "periodic_test" && today >= plan.periods[a.periodIndex]!.testDate) ??
    actions.find((a) => a.type === "weekly_test") ??
    actions.find((a) => a.type === "review") ??
    actions.find(
      (a) =>
        (a.type === "learn" || a.type === "homework" || (a.type === "quiz" && a.tier === "basic")) &&
        (firstSession.get(a.lessonId) ?? "") <= today,
    ) ??
    (week?.kind === "revision" ? actions.find((a) => a.type === "unit_summary") : undefined) ??
    (week?.kind === "revision" && mocksToday === 0 ? actions.find((a) => a.type === "final_mock") : undefined) ??
    // اختبارات المتوسط والمتفوقين اختيارية: الطالب بيجرب 3 بالكتير في اليوم
    (triedTiers.size < 3 ? actions.find((a) => a.type === "quiz" && a.tier !== "basic" && !triedTiers.has(`${a.lessonId}:${a.tier}`)) : undefined)
  );
}

for (let today = plan.calendar.startDate; today <= plan.examDate; today = addDays(today, 1)) {
  if (studyDates.has(today) || testDates.has(today)) {
    const triedTiers = new Set<string>();
    let mocksToday = 0;
    for (let step = 0; step < 8; step++) {
      const action = pickAction(journey.availableActions(today), today, triedTiers, mocksToday);
      if (!action) break;
      if (action.type === "learn") {
        journey.completeLearning(action.lessonId, today);
        kid.study(action.remediation ? 25 : 6);
        continue;
      }
      if (action.type === "unit_summary") {
        journey.viewUnitSummary(action.unitId, today);
        kid.study(4);
        continue;
      }
      if (action.type === "quiz" && action.tier !== "basic") triedTiers.add(`${action.lessonId}:${action.tier}`);
      if (action.type === "final_mock") mocksToday++;
      const quiz = journey.createQuiz(action as QuizAction, today);
      const outcome = journey.submit(quiz, kid.answer(quiz), today);
      if (action.type === "review") kid.study(15);
      notifications.push(...outcome.notifications);
      if (verbose) for (const e of outcome.events) console.log(`  ${today}  ${e.message}`);
    }
  }

  // آخر يوم في الأسبوع: لو اختبار الأسبوع ماتعملش، ولي الأمر ياخد تقرير برضه
  const week = plan.weeks.find((w) => w.endDate === today && w.lessonIds.length > 0);
  if (week && !journey.state.weeklyTests[week.number]) notifications.push(buildWeeklyReport(journey, week.number, today));
}

// ------------------------------------------------------------------ النتايج
const shown = verbose ? notifications : notifications.filter((n, i, all) => all.findIndex((m) => m.kind === n.kind) === i);
console.log(`\n📨 ${notifications.length} رسالة اتبعتت لولي الأمر${verbose ? "" : " — دي عينة من كل نوع (استخدم --verbose للكل)"}:`);
for (const n of shown) await notifier.send(student.parent, n);

const s = journey.state;
const level = levelForXp(s.gamification.xp);
console.log("════════ ملخص الترم ════════");
for (const lesson of listLessons(curriculum)) {
  const p = s.lessons[lesson.id]!;
  const rating = averageRating(s.mastery, lesson.objectives.map((o) => o.id));
  const label = rating === undefined ? "—" : `${LEVEL_LABELS_AR[levelFromRating(rating)]} (${rating})`;
  console.log(`${"⭐".repeat(p.stars)}${"☆".repeat(3 - p.stars)}  ${lesson.title}  — ${label}  [محاولات الأساسي: ${p.tiers.basic.attempts}]`);
}
const weekly = Object.entries(s.weeklyTests).map(([w, r]) => `أ${w}: ${Math.round((r.lastScore ?? 0) * 100)}%`);
console.log(`\n📝 اختبارات الأسابيع: ${weekly.join("  ")}`);
const periodic = Object.entries(s.periodicTests).map(([i, r]) => `شهر ${Number(i) + 1}: ${r.history.map((h) => `${Math.round(h.score * 100)}%`).join(" ← ")}`);
console.log(`🗓️ اختبارات الشهور: ${periodic.join("  |  ")}`);
console.log(`🎓 امتحانات تجريبية: ${s.finalMocks.history.map((h) => `${Math.round(h.score * 100)}%`).join("، ") || "—"}`);
console.log(`🎮 المستوى ${level.level} (${level.title}) — ${s.gamification.xp} نقطة — أطول سلسلة ${s.gamification.streak.best} يوم`);
console.log(`🏅 الأوسمة: ${s.gamification.badges.map((b) => BADGES[b].title).join("، ")}`);
console.log(`🔁 مرات الرجوع للمراجعة العلاجية: ${s.events.filter((e) => e.type === "remediation_required").length}`);
