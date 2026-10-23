// تحديد مستوى الطالب بدقة: تقييم (rating) لكل ناتج تعلم بطريقة Elo — نفس فكرة تصنيف لاعيبة الشطرنج.
// السؤال الصعب اللي يتحل صح بيرفع المستوى كتير، والسهل اللي يتحل غلط بينزله كتير.
// كده الاختبارات المتغيرة كلها بتصب في رقم واحد مفهوم لكل جزئية في المنهج.
import type { ItemResult } from "../assessment/grading";
import type { Difficulty } from "../questions/types";

export interface ObjectiveMastery {
  rating: number;
  answered: number;
  correct: number;
}

export type MasteryMap = Record<string, ObjectiveMastery>;

export const START_RATING = 1000;

export type LevelBand = "needs_support" | "developing" | "proficient" | "advanced";

export const LEVEL_LABELS_AR: Record<LevelBand, string> = {
  needs_support: "محتاج دعم",
  developing: "جيد",
  proficient: "جيد جدًا",
  advanced: "متفوق",
};

/**
 * صعوبة السؤال بنفس مقياس الطالب: 1 → 700، 2 → 850، 3 → 1000، 4 → 1150، 5 → 1300.
 * بالمعايرة دي طالب "جيد جدًا" (1100) بيجيب حوالي 85% في الأساسي و65% في المتوسط و35% في المتفوقين.
 */
export function questionRating(difficulty: Difficulty | number): number {
  return 550 + difficulty * 150;
}

export function expectedScore(studentRating: number, difficulty: number): number {
  return 1 / (1 + 10 ** ((questionRating(difficulty) - studentRating) / 400));
}

/** معامل التعلم: كبير في الأول عشان نوصل لمستوى الطالب بسرعة، وبيصغر مع كتر الإجابات. */
function kFactor(answered: number): number {
  return Math.max(16, 48 - answered * 2);
}

export function updateMastery(map: MasteryMap, items: ItemResult[]): MasteryMap {
  const next: MasteryMap = { ...map };
  for (const item of items) {
    const current = next[item.objectiveId] ?? { rating: START_RATING, answered: 0, correct: 0 };
    const expected = expectedScore(current.rating, item.difficulty);
    next[item.objectiveId] = {
      rating: Math.round(current.rating + kFactor(current.answered) * (item.credit - expected)),
      answered: current.answered + 1,
      correct: current.correct + (item.correct ? 1 : 0),
    };
  }
  return next;
}

export function levelFromRating(rating: number): LevelBand {
  if (rating >= 1200) return "advanced";
  if (rating >= 1100) return "proficient";
  if (rating >= 950) return "developing";
  return "needs_support";
}

/** متوسط تقييم نواتج تعلم الدرس اللي الطالب جاوب عليها (undefined لو لسه ماجاوبش). */
export function averageRating(map: MasteryMap, objectiveIds: string[]): number | undefined {
  const known = objectiveIds.map((id) => map[id]).filter((m): m is ObjectiveMastery => m !== undefined);
  if (known.length === 0) return undefined;
  return Math.round(known.reduce((sum, m) => sum + m.rating, 0) / known.length);
}

/** أضعف نواتج التعلم (اللي اتجاوب عليها) — بنستخدمها في الواجب العلاجي والمراجعة. */
export function weakestObjectives(map: MasteryMap, objectiveIds: string[], limit: number): string[] {
  return objectiveIds
    .filter((id) => map[id] !== undefined)
    .sort((a, b) => (map[a] as ObjectiveMastery).rating - (map[b] as ObjectiveMastery).rating)
    .slice(0, limit);
}
