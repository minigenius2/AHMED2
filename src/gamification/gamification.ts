// نظام التحفيز (زي الألعاب): نقاط خبرة، مستويات بألقاب، عملات، أيام متواصلة، وأوسمة.
import type { ISODate } from "../utils/dates";
import { daysBetween } from "../utils/dates";

export type BadgeId =
  | "first_step"
  | "first_gold"
  | "perfect_score"
  | "streak_7"
  | "chapter_gold"
  | "weekly_star"
  | "never_give_up"
  | "period_passed"
  | "ready_for_exam";

export const BADGES: Record<BadgeId, { title: string; description: string }> = {
  first_step: { title: "أول خطوة 👣", description: "نجح في أول درس" },
  first_gold: { title: "النجمة الذهبية 🥇", description: "اجتاز أول اختبار متفوقين" },
  perfect_score: { title: "الدرجة النهائية 💯", description: "قفل اختبار من غير ولا غلطة" },
  streak_7: { title: "أسبوع من غير انقطاع 🔥", description: "ذاكر 7 أيام متواصلة" },
  chapter_gold: { title: "بطل الفصل 🏆", description: "كل دروس فصل كامل بـ 3 نجوم" },
  weekly_star: { title: "نجم الأسبوع ⭐", description: "90% أو أكتر في اختبار آخر الأسبوع" },
  never_give_up: { title: "مابيستسلمش 💪", description: "نجح في درس بعد ما رسب فيه مرتين" },
  period_passed: { title: "عدّى الشهر 📅", description: "نجح في اختبار الشهر" },
  ready_for_exam: { title: "جاهز للامتحان 🎓", description: "نجح في امتحان تجريبي نهائي" },
};

/** نقاط الخبرة لكل إنجاز */
export const XP_RULES = {
  lessonLearned: 10,
  homework: 15,
  homeworkExcellent: 5,
  basicPassed: 20,
  standardPassed: 35,
  advancedPassed: 60,
  firstTryBonus: 10,
  weeklyMax: 50,
  periodicMax: 100,
  periodicPassBonus: 30,
  review: 10,
  finalMockMax: 120,
  perfectBonus: 25,
} as const;

export const LEVEL_TITLES = [
  "مستكشف مبتدئ",
  "مستكشف",
  "مستكشف ماهر",
  "باحث صغير",
  "باحث",
  "باحث ماهر",
  "عالم ناشئ",
  "عالم",
  "عالم ماهر",
  "عالم كبير",
  "عبقري الساينس",
  "أسطورة الساينس",
] as const;

export interface GamificationState {
  xp: number;
  /** النقاط المكتسبة في كل يوم — بنحسب منها نقاط الأسبوع في تقرير ولي الأمر */
  xpByDate: Record<ISODate, number>;
  coinsSpent: number;
  badges: BadgeId[];
  streak: { current: number; best: number; lastActiveDate?: ISODate };
}

export function newGamificationState(): GamificationState {
  return { xp: 0, xpByDate: {}, coinsSpent: 0, badges: [], streak: { current: 0, best: 0 } };
}

/** المستوى n محتاج 150 × (n−1) × n / 2 نقطة: 0، 150، 450، 900، 1500، ... (12 مستوى ≈ ترم كامل لطالب متفوق) */
export function levelForXp(xp: number): { level: number; title: string; xpIntoLevel: number; xpForNext: number } {
  let level = 1;
  while (xp >= threshold(level + 1)) level++;
  const title = LEVEL_TITLES[Math.min(level, LEVEL_TITLES.length) - 1] as string;
  return { level, title, xpIntoLevel: xp - threshold(level), xpForNext: threshold(level + 1) - threshold(level) };
}

function threshold(level: number): number {
  return (150 * (level - 1) * level) / 2;
}

/** كل 10 نقاط = عملة — هتتصرف بعدين في متجر الأفاتار والثيمات. */
export function coins(g: GamificationState): number {
  return Math.floor(g.xp / 10) - g.coinsSpent;
}

/** الأيام المتواصلة: يوم راحة واحد مسموح (عشان الجمعة مثلًا ماتكسرش السلسلة). */
export function recordActivity(g: GamificationState, today: ISODate): GamificationState {
  const last = g.streak.lastActiveDate;
  if (last === today) return g;
  const gap = last ? daysBetween(last, today) : Infinity;
  const current = gap <= 2 ? g.streak.current + 1 : 1;
  return { ...g, streak: { current, best: Math.max(g.streak.best, current), lastActiveDate: today } };
}
