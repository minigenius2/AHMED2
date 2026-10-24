// شكل "الحصة التفاعلية": سيناريو مكتوب مرة واحدة لكل درس ويتراجع من مدرس، والتطبيق بيعرضه كروت بصوت المعلم.
// الكلام بالعامية المصرية والمصطلح والتعريف بالإنجليزي زي الكتاب — زي المدرس الخصوصي بالظبط.
import type { VocabularyItem } from "../curriculum/types";
import type { ExamStyle } from "../questions/types";

/** صورة الكارت. دلوقتي إيموجي في النسخة التجريبية، وبعدين صورة مرسومة خصيصًا (الوصف الإنجليزي بيستخدم في توليدها). */
export interface Illustration {
  emoji: string;
  /** وصف للصورة اللي هتترسم بعدين (مش صور الكتاب — ليها حقوق) */
  prompt: string;
}

/** جملة إنجليزي زي ما الطفل هيكتبها في الامتحان — بتتقري بصوت إنجليزي */
export interface EnglishLine {
  text: string;
  /** الكلمات المهمة اللي بتتلوّن */
  keywords?: string[];
}

export interface CheckChoice {
  text: string;
  correct?: boolean;
  /** رد المعلم لو الطفل اختار ده */
  feedback: string;
}

/** سؤال فهم وسط الشرح: لو غلط، المعلم بيشرح تاني بمثال مختلف (reteach) ويسأله تاني. */
export interface CheckStep {
  kind: "check";
  objectiveId: string;
  /** السؤال بالعامية (ممكن يبقى فيه كلمة إنجليزي) */
  ask: string;
  choices: CheckChoice[];
  /** شرح تاني مختلف بيظهر بعد الإجابة الغلط وقبل إعادة السؤال */
  reteach: string;
  illustration?: Illustration;
}

export interface HookStep {
  kind: "hook";
  say: string;
  illustration: Illustration;
}

/** سؤالين سريعين من الدرس اللي فات — المحرك بيختارهم من بنك الأسئلة وقت الحصة */
export interface RecallStep {
  kind: "recall";
  say: string;
  count: number;
}

export interface ExplainStep {
  kind: "explain";
  objectiveId: string;
  title: string;
  /** كلام المعلم بالعامية */
  say: string;
  /** الجملة الإنجليزي اللي لازم يعرفها (تعريف، قاعدة، مثال) */
  english?: EnglishLine;
  illustration: Illustration;
}

export interface VocabStep {
  kind: "vocab";
  say: string;
  words: VocabularyItem[];
}

/** نشاط تفاعلي: الطفل يسحب كل حاجة لمجموعتها (زي نشاط الكتاب بس على الموبايل) */
export interface SortActivityStep {
  kind: "activity";
  objectiveId: string;
  say: string;
  groups: string[];
  /** معنى أسماء المجموعات بالعربي، بنفس الترتيب — بيظهر تحت الاسم الإنجليزي */
  groupsAr?: string[];
  items: Array<{ text: string; emoji: string; group: string }>;
  /** تجربة آمنة يعملها في البيت مع حد كبير */
  tryAtHome?: string;
}

export interface ExamTipStep {
  kind: "exam_tip";
  objectiveId: string;
  style: ExamStyle;
  say: string;
  question: string;
  modelAnswer: EnglishLine;
}

export interface SummaryStep {
  kind: "summary";
  say: string;
  points: string[];
}

export type ScriptStep =
  | HookStep
  | RecallStep
  | ExplainStep
  | CheckStep
  | VocabStep
  | SortActivityStep
  | ExamTipStep
  | SummaryStep;

export interface ScriptSession {
  title: string;
  steps: ScriptStep[];
}

export interface LessonScript {
  lessonId: string;
  /** حصة لكل "حلقة" في الدرس (Lesson.sessions) */
  sessions: ScriptSession[];
  /**
   * شرح بديل لكل ناتج تعلم — بيستخدم في حصة المراجعة العلاجية لما الطفل يرسب في الأساسي مرتين.
   * لازم يبقى بمثال/تشبيه مختلف عن الشرح الأساسي، وفي آخره سؤال فهم.
   */
  alternatives: Record<string, ScriptStep[]>;
}
