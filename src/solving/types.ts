// «حل معايا»: الطالب قدام مسألة مش عارف يحلّها. المساعد يوصّله للحل بنفسه من غير ما يقوله الإجابة.

export type PrepGrade = "prep1" | "prep2" | "prep3";
export type SchoolType = "arabic" | "languages";
export type SchoolTerm = 1 | 2;
export type SolveSubject = "math";

export const PREP_GRADE_LABELS: Record<PrepGrade, string> = {
  prep1: "أولى إعدادي",
  prep2: "تانية إعدادي",
  prep3: "تالتة إعدادي",
};

export interface Book {
  /** فيه الطبعة (السنة)، عشان أرقام الصفحات بتتغيّر من سنة للتانية */
  id: string;
  title: string;
  /** كتاب الوزارة ولا كتاب خارجي */
  kind: "ministry" | "external" | "demo";
  subject: SolveSubject;
  grade: PrepGrade;
  term: SchoolTerm;
  schoolType: SchoolType;
  /** سنة أول الدراسة: 2026 يعني 2026/2027 */
  edition: number;
}

/** اللي المساعد عارفه عن الطالب من أول ما سجّل، فمابيسألوش عنه تاني */
export interface StudentContext {
  name?: string;
  grade: PrepGrade;
  schoolType: SchoolType;
  term: SchoolTerm;
  /** الكتب اللي بيذاكر منها (ids من books.ts) */
  bookIds: string[];
  /** الدرس اللي واقف فيه دلوقتي من خطة الترم، لو معروف */
  currentLesson?: string;
}

/** عنوان المسألة في الكتاب: «صفحة 45 سؤال 3 ب» */
export interface ProblemRef {
  bookId: string;
  page: number;
  question: string;
  /** الجزء لو السؤال فيه أجزاء (أ، ب…) */
  part?: string;
}

export interface PlanStep {
  id: string;
  /** المطلوب في الخطوة دي، بكلام الطالب */
  goal: string;
  /** النتيجة الصح للخطوة (سر، مابتتقالش للطالب) */
  expected: string;
  /** سلّم التلميحات: سؤال يفكّره ← تذكير بالقاعدة ← مثال شبيه بأرقام تانية ← نبدأ الخطوة سوا */
  hints: string[];
  commonMistakes: string[];
}

/** خطة الحل: المساعد بيحلّ المسألة في الخفا الأول، ويمشي مع الطالب عليها */
export interface ProblemPlan {
  problemText: string;
  subject: SolveSubject;
  grade: PrepGrade;
  topic: string;
  concepts: string[];
  steps: PlanStep[];
  /** الإجابة النهائية (سر لحد ما الطالب يوصلها بنفسه) */
  finalAnswer: string;
  /** إزاي الطالب يتأكد من إجابته */
  check: string;
}

export interface SolveTurn {
  role: "student" | "tutor";
  text: string;
}

/** حالة الحل اللي بتتبعت مع كل رسالة (الخطة نفسها بتتبعت مشفّرة، عشان الإجابة ماتوصلش للموبايل) */
export interface SolveProgress {
  stepIndex: number;
  hintLevel: number;
  solved: boolean;
  /** التكلفة لحد دلوقتي بالدولار (للتجربة) */
  costUsd: number;
}

/** استهلاك طلب واحد من الموديل، عشان نحسب التكلفة الحقيقية */
export interface ModelUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}
