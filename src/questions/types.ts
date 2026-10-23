// بنك الأسئلة: كل سؤال مربوط بدرس وناتج تعلم ومستوى صعوبة وشكل سؤال من أشكال الامتحان المصري.
// التنوع بييجي من: صياغات متعددة لنفس السؤال + اختيار مشتتات عشوائية من مجموعة أكبر
// + ترتيب عشوائي للاختيارات + تفضيل الأسئلة اللي الطالب ماشافهاش قبل كده.

/** 1 = سهل جدًا ... 5 = للمتفوقين */
export type Difficulty = 1 | 2 | 3 | 4 | 5;

/**
 * أشكال الأسئلة زي ما بتيجي في كتاب المدرسة وكتاب التقييمات والامتحان.
 * بنستخدمها في التقرير: "ابنك قوي في أكمل وضعيف في علل" — لغة ولي الأمر والمدرس فاهمينها.
 */
export type ExamStyle =
  | "complete" // Complete the following sentences
  | "choose" // Choose the correct answer
  | "choose_all" // Choose all correct answers
  | "true_false" // Put (✓) or (✗)
  | "scientific_term" // Write the scientific term / What is meant by
  | "give_reason" // Give reasons (G.R)
  | "what_happens" // What happens if...?
  | "odd_one_out" // Cross out the odd word
  | "match" // Choose from column (B) what suits column (A)
  | "classify" // Classify the following...
  | "order"; // Arrange the steps

export const EXAM_STYLE_LABELS_AR: Record<ExamStyle, string> = {
  complete: "أكمل",
  choose: "اختر الإجابة الصحيحة",
  choose_all: "اختر كل الإجابات الصحيحة",
  true_false: "صح أو خطأ",
  scientific_term: "المصطلح العلمي",
  give_reason: "علل",
  what_happens: "ماذا يحدث لو",
  odd_one_out: "استخرج الكلمة الشاذة",
  match: "توصيل",
  classify: "تصنيف",
  order: "ترتيب",
};

interface BaseQuestion {
  id: string;
  lessonId: string;
  objectiveId: string;
  difficulty: Difficulty;
  style: ExamStyle;
  /** صياغة واحدة أو أكتر لنفس السؤال — بيتختار منهم عشوائيًا */
  prompts: string[];
  /** شرح قصير بيظهر للطالب بعد الإجابة */
  explanation?: string;
  /** صفحة الكتاب اللي فيها المعلومة — عشان المراجعة توديه للمكان الصح */
  bookPage?: number;
  /** سؤال تجريبي مولّد آليًا لحد ما نكتب الأسئلة الحقيقية من الكتاب */
  placeholder?: boolean;
}

export interface ChoiceQuestion extends BaseQuestion {
  type: "mcq";
  correct: string;
  /** مجموعة مشتتات — بيتختار منها 3 عشوائيًا في كل مرة */
  distractors: string[];
}

export interface MultiSelectQuestion extends BaseQuestion {
  type: "multi_select";
  correct: string[];
  distractors: string[];
}

export interface TrueFalseQuestion extends BaseQuestion {
  type: "true_false";
  correct: boolean;
}

export interface FillBlankQuestion extends BaseQuestion {
  type: "fill_blank";
  /** لكل فراغ: الإجابات المقبولة (بعد توحيد الكتابة) */
  blanks: string[][];
  /** لو true: الفراغات ممكن تتملي بأي ترتيب (زي: Both ___ and ___) */
  anyOrder?: boolean;
  /** بنك كلمات يختار منه الطالب بدل الكتابة — أسهل لطفل في رابعة ابتدائي */
  wordBank?: string[];
}

export interface OrderQuestion extends BaseQuestion {
  type: "order";
  /** العناصر بالترتيب الصحيح — بتتعرض على الطالب متلخبطة */
  sequence: string[];
}

export interface MatchQuestion extends BaseQuestion {
  type: "match";
  pairs: Array<{ left: string; right: string }>;
  /** اختيارات زيادة في عمود (B) مالهاش مقابل */
  extraRight?: string[];
}

export interface ClassifyQuestion extends BaseQuestion {
  type: "classify";
  groups: string[];
  items: Array<{ item: string; group: string }>;
}

export type Question =
  | ChoiceQuestion
  | MultiSelectQuestion
  | TrueFalseQuestion
  | FillBlankQuestion
  | OrderQuestion
  | MatchQuestion
  | ClassifyQuestion;

export type QuestionType = Question["type"];

export const TRUE_LABEL = "True";
export const FALSE_LABEL = "False";

/** توحيد الإجابة قبل المقارنة: حروف صغيرة، مسافات، علامات ترقيم، وتوحيد الكتابة العربية. */
export function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[.,;:!?()"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** يتأكد إن السؤال مكتوب صح قبل ما يدخل البنك. */
export function validateQuestion(q: Question): string[] {
  const problems: string[] = [];
  const tag = `Question ${q.id}`;
  if (q.prompts.length === 0) problems.push(`${tag}: needs at least one prompt`);
  switch (q.type) {
    case "mcq":
      if (q.distractors.length < 2) problems.push(`${tag}: mcq needs at least 2 distractors`);
      if (q.distractors.includes(q.correct)) problems.push(`${tag}: correct answer is also a distractor`);
      break;
    case "multi_select":
      if (q.correct.length < 1 || q.distractors.length < 1) problems.push(`${tag}: multi_select needs correct and wrong options`);
      break;
    case "fill_blank":
      if (q.blanks.length === 0 || q.blanks.some((b) => b.length === 0)) problems.push(`${tag}: every blank needs an answer`);
      if (q.wordBank) {
        const bank = new Set(q.wordBank.map(normalizeAnswer));
        if (!q.blanks.every((b) => b.some((a) => bank.has(normalizeAnswer(a))))) {
          problems.push(`${tag}: word bank is missing a correct answer`);
        }
      }
      break;
    case "order":
      if (q.sequence.length < 3) problems.push(`${tag}: order needs at least 3 items`);
      break;
    case "match":
      if (q.pairs.length < 2) problems.push(`${tag}: match needs at least 2 pairs`);
      break;
    case "classify":
      if (q.items.some((i) => !q.groups.includes(i.group))) problems.push(`${tag}: item assigned to unknown group`);
      break;
    case "true_false":
      break;
  }
  return problems;
}
