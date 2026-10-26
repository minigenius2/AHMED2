// شكل "الحصة التفاعلية": سيناريو مكتوب مرة واحدة لكل درس ويتراجع من مدرس، والتطبيق بيعرضه كروت بصوت المعلم.
// الكلام بالعامية المصرية والمصطلح والتعريف بالإنجليزي زي الكتاب — زي المدرس الخصوصي بالظبط.
import type { VocabularyItem } from "../curriculum/types";
import type { ExamStyle } from "../questions/types";

/** صورة حقيقية من مصدر برخصة مفتوحة، ومعاها بيانات صاحبها ورخصتها عشان صفحة حقوق الصور */
export interface MediaItem {
  file: string;
  title: string;
  creator: string;
  creatorUrl: string;
  license: string;
  licenseVersion: string;
  licenseUrl: string;
  /** صفحة الصورة الأصلية */
  source: string;
}

/** مكتبة صور المادة: اسم الصورة ← بياناتها */
export type MediaLibrary = Record<string, MediaItem>;

/** صورة الكارت: صور حقيقية لو موجودة، وإلا الإيموجي */
export interface Illustration {
  emoji: string;
  /** وصف للصورة (لو احتجنا نرسمها أو ندوّر عليها) — مش صور الكتاب، ليها حقوق */
  prompt: string;
  /** أسماء صور من مكتبة الصور. "|" بيفصل مجموعتين (حي | مش حي مثلًا) */
  photos?: string[];
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

/**
 * "كمّل الجملة" في آخر كل شرح: كلمة بتستخبى من الجملة الإنجليزي والطفل يختارها،
 * والخطوة مابتخلصش غير لما يختار صح — عشان مايعديش الشرح من غير ما يفهمه.
 */
export interface ConfirmBlank {
  /** كلمة (أو كلمتين) موجودة في الجملة الإنجليزي بالظبط */
  answer: string;
  /** اختيارين غلط أو أكتر: غلط بوضوح بس قريبين في المعنى (dry قصاد damp، hot قصاد cool) */
  distractors: string[];
}

export interface ExplainStep {
  kind: "explain";
  objectiveId: string;
  title: string;
  /** كلام المعلم بالعامية */
  say: string;
  /** الجملة الإنجليزي اللي لازم يعرفها (تعريف، قاعدة، مثال) */
  english: EnglishLine;
  confirm: ConfirmBlank;
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
  items: Array<{ text: string; emoji: string; group: string; photo?: string }>;
  /** تجربة آمنة يعملها في البيت مع حد كبير */
  tryAtHome?: string;
}

/** رد فعل الحاجة في التجربة — كل نوع ليه حركة جاهزة في الواجهة، وبنزوّد أنواع مع الدروس الجاية */
export type ProbeReaction =
  | "grow" // بياكل وبيكبر (كائن حي)
  | "still"; // مابيتغيرش خالص (شيء غير حي)

/**
 * تجربة يكتشف فيها الطفل الفكرة بنفسه: يسحب أداة (أكل، مية، كشاف نور…) على كل حاجة ويشوف رد فعلها،
 * وبعدين المعلم يقول الاستنتاج. نفس الشكل بيتعاد في دروس كتير بأدوات وردود فعل مختلفة.
 */
export interface ProbeStep {
  kind: "probe";
  objectiveId: string;
  title: string;
  say: string;
  tool: { label: string; emoji: string; photo?: string };
  items: Array<{ text: string; emoji: string; photo?: string; reaction: ProbeReaction; caption: string }>;
  /** استنتاج المعلم بعد ما الطفل يجرّب على كل الحاجات */
  conclusion: string;
}

/** مكان في رحلة الاستكشاف: الطفل يدوس عليه فيتكشف (الحجر يترفع، الحشيش يتزاح…) */
export interface HuntSpot {
  /** اسم المكان بالعربي (تحت الحجر) */
  label: string;
  /** اسمه بالإنجليزي زي الكتاب (Under a stone) */
  labelEn: string;
  emoji: string;
  photo?: string;
  /** الكائن اللي مستخبي هنا (أو مفيش) */
  find?: { text: string; emoji: string; photo?: string };
  /** كلام المعلم لما المكان يتكشف */
  caption: string;
}

/**
 * رحلة استكشاف بخطوات العلماء: يخمّن الأول (Guess)، وبعدين يدوّر في الأماكن (Search)،
 * وكل كائن يلاقيه بيتسجل في كراسة المستكشف مع مكانه (Record).
 */
export interface HuntStep {
  kind: "hunt";
  objectiveId: string;
  title: string;
  say: string;
  /** سؤال التخمين قبل البحث، والإجابة اسم مكان فيه كائن */
  guess: { ask: string; answer: string };
  spots: HuntSpot[];
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
  | ProbeStep
  | HuntStep
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
