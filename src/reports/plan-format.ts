// عرض خطة الترم كنص — للطباعة في الطرفية أو إرسالها لولي الأمر في أول الترم.
import type { Curriculum } from "../curriculum/types";
import { listLessons } from "../curriculum/types";
import type { StudyPlan, WeekKind } from "../planner/planner";
import { WEEKDAY_NAMES_AR, dayOfWeek } from "../utils/dates";

const KIND_LABELS: Record<WeekKind, string> = {
  teaching: "شرح",
  catch_up: "مراجعة وتعويض",
  holiday: "إجازة",
  revision: "مراجعة نهائية وامتحانات تجريبية",
};

export function formatPlan(plan: StudyPlan, curriculum: Curriculum, options: { showSessions?: boolean } = {}): string {
  const lessons = new Map(listLessons(curriculum).map((l) => [l.id, l]));
  const lines: string[] = [`📚 خطة ${curriculum.title}`, `من ${plan.calendar.startDate} إلى ${plan.examDate}`, ""];
  for (const week of plan.weeks) {
    lines.push(`الأسبوع ${week.number} (${week.startDate} → ${week.endDate}) — ${KIND_LABELS[week.kind]}`);
    if (week.holidayNames.length) lines.push(`   🎉 إجازة: ${week.holidayNames.join("، ")}`);
    for (const id of week.lessonIds) {
      const lesson = lessons.get(id);
      lines.push(`   📖 ${lesson?.title ?? id}${lesson?.titleAr ? ` — ${lesson.titleAr}` : ""}`);
    }
    if (options.showSessions) {
      for (const s of week.sessions) {
        lines.push(`      ${WEEKDAY_NAMES_AR[dayOfWeek(s.date)]} ${s.date}: ${lessons.get(s.lessonId)?.title ?? s.lessonId} (حلقة ${s.part}/${s.ofParts})`);
      }
    }
    if (week.weeklyTestDate) lines.push(`   📝 اختبار آخر الأسبوع: ${week.weeklyTestDate}`);
    if (week.periodicTestIndex !== undefined) lines.push(`   🗓️ اختبار الشهر رقم ${week.periodicTestIndex + 1}: ${week.periodicTestDate}`);
  }
  return lines.join("\n");
}
