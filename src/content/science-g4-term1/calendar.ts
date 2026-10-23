// تقويم الفصل الدراسي الأول 2026/2027 — تقريبي لحد ما نطابقه على خريطة الوزارة الرسمية.
// (تاريخ بطاقة الملاحظة في الكتاب 21/9/2026 بيأكد إن الدراسة بدأت أواخر سبتمبر.)
import type { TermCalendar } from "../../planner/planner";

export const term1Calendar2026: TermCalendar = {
  startDate: "2026-09-19",
  endDate: "2027-01-07",
  holidays: [{ from: "2026-10-06", to: "2026-10-06", name: "عيد القوات المسلحة" }],
  weekStartsOn: 6, // السبت
  studyDays: [6, 0, 1, 2, 3], // السبت → الأربعاء
  weeklyTestDay: 4, // الخميس
};
