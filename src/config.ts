// كل "قواعد اللعبة" في مكان واحد — نقدر نغيّرها من غير ما نلمس باقي الكود.
import type { Difficulty } from "./questions/types";

export type Tier = "basic" | "standard" | "advanced";

export const TIERS: readonly Tier[] = ["basic", "standard", "advanced"];

export const TIER_LABELS_AR: Record<Tier, string> = {
  basic: "المستوى الأساسي (برونزي)",
  standard: "المستوى المتوسط (فضي)",
  advanced: "مستوى المتفوقين (ذهبي)",
};

export interface DifficultyBand {
  min: Difficulty;
  max: Difficulty;
}

export interface QuizConfig {
  questionCount: number;
  difficulty: DifficultyBand;
}

export interface GradedQuizConfig extends QuizConfig {
  /** نسبة النجاح من 0 لـ 1 */
  passThreshold: number;
}

export interface TierConfig extends GradedQuizConfig {
  /**
   * أقل تقييم (Elo) للطالب في الدرس عشان النجاح يتحسب.
   * بيمنع إن طالب يعدّي اختبار المتفوقين بالحظ بعد محاولات كتير — الذهبية لازم تكون عن استحقاق.
   */
  minRating?: number;
}

export interface AssistantConfig {
  schedule: {
    /**
     * اختبار الأسبوع والاختبار التراكمي مايتفتحوش قبل ميعادهم في الخطة حتى لو الطالب خلّص بدري
     * (المراجعة بعد كام يوم بتثبّت المعلومة أكتر، والطالب يفضل ماشي مع المدرسة).
     */
    testsNotBeforePlannedDate: boolean;
  };
  /** واجب بعد كل درس: لازم يتحل، والدرجة بتأثر في تحديد المستوى بس مش بتقفل */
  homework: QuizConfig;
  /** الاختبارات الثلاثة بعد كل درس — الأساسي هو اللي بيفتح الدرس اللي بعده */
  tiers: Record<Tier, TierConfig>;
  retry: {
    /** بعد كام مرة رسوب متتالية في الأساسي نرجّعه يراجع الدرس ويحل واجب علاجي */
    remediationAfterFails: number;
    /** بعد كام مرة رسوب نبعت تنبيه لولي الأمر */
    parentAlertAfterFails: number;
    /** كام يوم لازم يعدي بين محاولات اختبار المتوسط/المتفوقين (الأساسي مفتوح دايمًا) */
    bonusTierCooldownDays: number;
  };
  /** اختبار آخر الأسبوع — نتيجته بتتبعت لولي الأمر */
  weeklyTest: GradedQuizConfig & {
    /** لو true: دروس الأسبوع اللي بعده ماتتفتحش إلا لما ينجح */
    gatesNextWeek: boolean;
  };
  /** اختبار الشهر (أو كل أسبوعين) التراكمي — بيقفل الفترة اللي بعده لحد ما ينجح */
  periodicTest: GradedQuizConfig & {
    /** وزن دروس الفترة الحالية مقابل كل اللي فات (الباقي للدروس القديمة) */
    recentWeight: number;
  };
  /** اختبار مراجعة مركز على نقط الضعف بعد الرسوب في اختبار أسبوعي/شهري */
  review: QuizConfig;
  /** امتحانات تجريبية في آخر المنهج بنفس شكل امتحان آخر الترم */
  finalMock: GradedQuizConfig;
  /** زرار "اسأل المعلم" */
  askTeacher: {
    dailyLimit: number;
    maxQuestionChars: number;
  };
}

export const DEFAULT_CONFIG: AssistantConfig = {
  schedule: { testsNotBeforePlannedDate: true },
  homework: { questionCount: 6, difficulty: { min: 1, max: 3 } },
  tiers: {
    basic: { questionCount: 8, passThreshold: 0.75, difficulty: { min: 1, max: 2 } },
    standard: { questionCount: 8, passThreshold: 0.75, difficulty: { min: 2, max: 4 } },
    advanced: { questionCount: 6, passThreshold: 0.8, difficulty: { min: 4, max: 5 }, minRating: 1150 },
  },
  retry: { remediationAfterFails: 2, parentAlertAfterFails: 3, bonusTierCooldownDays: 1 },
  weeklyTest: { questionCount: 15, passThreshold: 0.6, difficulty: { min: 1, max: 4 }, gatesNextWeek: false },
  periodicTest: { questionCount: 20, passThreshold: 0.65, difficulty: { min: 1, max: 5 }, recentWeight: 0.6 },
  review: { questionCount: 10, difficulty: { min: 1, max: 3 } },
  finalMock: { questionCount: 25, passThreshold: 0.65, difficulty: { min: 1, max: 5 } },
  askTeacher: { dailyLimit: 10, maxQuestionChars: 300 },
};
