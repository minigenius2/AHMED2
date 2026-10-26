// شكل "الحصة التفاعلية": سيناريو مكتوب مرة واحدة لكل درس، والتطبيق بيعرضه شاشات الطفل بيعمل في كل واحدة حاجة بإيده.
// القواعد (docs/07-learning-design.md): خمّن ← جرّب ← فسّر، والإنجليزي هو البطل والعربي ترجمة تحته،
// وكلام المعلم المكتوب سطر أو اتنين بس (الباقي بيتسمع)، ومفيش شاشة "اقرا ودوس التالي".
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

/** مصطلح أو حاجة بتظهر للطفل: الإنجليزي كبير، والعربي ترجمة صغيرة تحته، وصورة (أو إيموجي لو مفيش صورة) */
export interface Term {
  en: string;
  ar: string;
  emoji: string;
  /** اسم صورة من مكتبة الصور */
  photo?: string;
}

/** صورة الكارت: صور حقيقية لو موجودة، وإلا الإيموجي */
export interface Illustration {
  emoji: string;
  /** وصف للصورة (لو احتجنا نرسمها أو ندوّر عليها) — مش صور الكتاب، ليها حقوق */
  prompt: string;
  /** أسماء صور من مكتبة الصور. "|" بيفصل مجموعتين (حي | مش حي مثلًا). لازم تبيّن بالظبط اللي المعلم بيقوله */
  photos?: string[];
}

/** جملة إنجليزي زي ما الطفل هيكتبها في الامتحان — بتتقري بصوت إنجليزي، وترجمتها تحتها */
export interface EnglishLine {
  text: string;
  /** ترجمتها بالعربي (بتظهر صغيرة تحت الجملة) */
  ar?: string;
  /** الكلمات المهمة اللي بتتلوّن */
  keywords?: string[];
}

/** الخطوة دي لما تخلص بتدّي الطفل وسام من أوسمة المهمة (رقم الوسام في MissionStep.badges) */
interface Rewarding {
  badge?: number;
}

/** أول شاشة في الحصة: المهمة والأوسمة اللي هيكسبها — بتحوّل الحصة للعبة ليها هدف */
export interface MissionStep {
  kind: "mission";
  titleEn: string;
  title: string;
  say: string;
  badges: Term[];
  illustration?: Illustration;
}

/** شاشة بداية عادية (بتتستخدم في المراجعة العلاجية) */
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
 * المصطلحات قبل الشرح (Pre-training): كروت يدوس عليها ويسمع كل كلمة،
 * ولو match = true بعدها لعبة توصيل سريعة (كلمة ← صورة).
 */
export interface TermsStep {
  kind: "terms";
  say: string;
  terms: Term[];
  match?: boolean;
}

/** "كمّل الجملة": كلمة بتستخبى من جملة الامتحان والطفل يختارها */
export interface ConfirmBlank {
  /** كلمة (أو كلمتين) موجودة في الجملة الإنجليزي بالظبط */
  answer: string;
  /** اختيارين غلط أو أكتر: غلط بوضوح بس قريبين في المعنى (dry قصاد damp، hot قصاد cool) */
  distractors: string[];
}

/** كارت يكشفه الطفل بلمسة: المصطلح بالإنجليزي وترجمته وصورته، والمعلم بيقول جملة قصيرة */
export interface ExplainPoint extends Term {
  say: string;
}

/**
 * الشرح: الطفل بيكشف الكروت واحد واحد (2–4)، وبعد ما يكشفهم كلهم بتظهر جملة الامتحان وترجمتها.
 * say سطر أو اتنين بس — الشرح الحقيقي في الكروت.
 */
export interface ExplainStep {
  kind: "explain";
  objectiveId: string;
  titleEn: string;
  title: string;
  say: string;
  points: ExplainPoint[];
  english: EnglishLine;
  /** لو مفيش بعده "ابني الجملة" أو سؤال فهم، بيتأكد إنه فهم بـ"كمّل الجملة" */
  confirm?: ConfirmBlank;
  illustration?: Illustration;
}

export interface CheckChoice {
  /** الاختيار بالعربي (ولو فيه en، العربي بيبقى ترجمة صغيرة تحته) */
  text: string;
  /** لو الاختيار مصطلح، الإنجليزي هو اللي بيظهر كبير */
  en?: string;
  correct?: boolean;
  /** رد المعلم لو الطفل اختار ده */
  feedback: string;
}

/** سؤال فهم: لو غلط، المعلم بيشرح تاني بمثال مختلف (reteach) ويسأله تاني */
export interface CheckStep {
  kind: "check";
  objectiveId: string;
  ask: string;
  choices: CheckChoice[];
  reteach: string;
  illustration?: Illustration;
}

/** حاجة في لعبة الترتيب. why: ليه مكانها هنا — بيظهر لما الطفل يصلّح تخمينه */
export interface SortItem extends Term {
  group: string;
  why?: string;
}

/**
 * لعبة ترتيب: يسحب كل حاجة لمجموعتها. لو فيها predictId، دي "خمّن": مفيش صح ولا غلط دلوقتي،
 * وتخمينه بيتحفظ، وبعد الشرح خطوة revisit بترجّعه يصلّحه بنفسه.
 */
export interface SortActivityStep extends Rewarding {
  kind: "activity";
  objectiveId: string;
  say: string;
  groups: string[];
  /** معنى أسماء المجموعات بالعربي، بنفس الترتيب */
  groupsAr?: string[];
  items: SortItem[];
  predictId?: string;
  /** تجربة آمنة يعملها في البيت مع حد كبير */
  tryAtHome?: string;
}

/** "صلّح تخمينك": بيوريه ترتيبه في خطوة الـ predict، واللي غلط فيه يرجّعه لمكانه الصح ومعاه السبب */
export interface RevisitStep {
  kind: "revisit";
  objectiveId: string;
  predictId: string;
  say: string;
}

/** رد فعل الحاجة في التجربة — كل نوع ليه حركة جاهزة في الواجهة */
export type ProbeReaction =
  | "grow" // بياكل وبيكبر (كائن حي)
  | "still" // مابيتغيرش خالص
  | "glow" // النور بيعدّي منه / بينوّر
  | "shadow" // بيمنع النور وبيعمل ظل
  | "vibrate" // بيهتز وبيطلّع صوت
  | "move-far" // بيتحرك مسافة كبيرة
  | "move-near" // بيتحرك مسافة صغيرة
  | "soak" // بيشرب المية بسرعة
  | "soak-slow" // بيشرب المية ببطء
  | "hot" // بيسخن
  | "cool" // بيفضل بارد
  | "zoom"; // بيبان أكبر (العدسة المكبرة)

/**
 * تجربة يكتشف فيها الطفل الفكرة بنفسه: يسحب أداة (أكل، مية، كشاف نور…) على كل حاجة ويشوف رد فعلها،
 * وبعدين المعلم يقول الاستنتاج.
 */
export interface ProbeStep extends Rewarding {
  kind: "probe";
  objectiveId: string;
  titleEn: string;
  title: string;
  say: string;
  tool: Term;
  items: Array<Term & { reaction: ProbeReaction; caption: string }>;
  conclusion: string;
}

/** وصّل: كلمة ← صورة، أو كائن ← بيته، أو جزء ← وظيفته */
export interface MatchStep extends Rewarding {
  kind: "match";
  objectiveId: string;
  say: string;
  pairs: Array<{ left: Term; right: Term }>;
}

/** ابني الجملة: يرتّب كروت كلمات جملة الامتحان أو إجابة "علل" بإيده */
export interface BuildStep extends Rewarding {
  kind: "build";
  objectiveId: string;
  say: string;
  /** الجملة كاملة — لازم تساوي الكروت ورا بعض بمسافة */
  sentence: string;
  ar: string;
  tiles: string[];
  /** كروت غلط بتتخلط مع الصح (ويفضّل تكون الفكرة الغلط الشائعة، زي move) */
  distractors?: string[];
}

/** رتّب المراحل بالترتيب الصح (دورة حياة، نمو، خطوات) */
export interface SequenceStep extends Rewarding {
  kind: "sequence";
  objectiveId: string;
  titleEn: string;
  title: string;
  say: string;
  /** المراحل بالترتيب الصح */
  items: Term[];
  conclusion: string;
}

/** مكان في رحلة الاستكشاف: الطفل يدوس عليه فيتكشف (الحجر يترفع، الحشيش يتزاح…) */
export interface HuntSpot {
  /** اسم المكان بالإنجليزي زي الكتاب (Under a stone) */
  en: string;
  ar: string;
  emoji: string;
  photo?: string;
  /** الكائن اللي مستخبي هنا (أو مفيش) */
  find?: Term;
  /** كلام المعلم لما المكان يتكشف */
  caption: string;
}

/**
 * رحلة استكشاف بخطوات العلماء: يخمّن الأول (Guess)، وبعدين يدوّر (Search)،
 * وكل كائن يلاقيه بيتسجل في كراسة المستكشف مع مكانه (Record).
 */
export interface HuntStep extends Rewarding {
  kind: "hunt";
  objectiveId: string;
  titleEn: string;
  title: string;
  say: string;
  /** سؤال التخمين قبل البحث، والإجابة اسم مكان (en) فيه كائن */
  guess: { ask: string; answer: string };
  spots: HuntSpot[];
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

/** تذكرة الخروج: أسئلة استرجاع سريعة من بنك أسئلة الدرس، والتصحيح بيشرح */
export interface ExitStep extends Rewarding {
  kind: "exit";
  say: string;
  count: number;
}

export interface SummaryStep {
  kind: "summary";
  say: string;
  /** كل نقطة: الجملة الإنجليزي وترجمتها */
  points: Array<{ en: string; ar: string }>;
}

export type ScriptStep =
  | MissionStep
  | HookStep
  | RecallStep
  | TermsStep
  | ExplainStep
  | CheckStep
  | SortActivityStep
  | RevisitStep
  | ProbeStep
  | MatchStep
  | BuildStep
  | SequenceStep
  | HuntStep
  | ExamTipStep
  | ExitStep
  | SummaryStep;

export interface ScriptSession {
  titleEn: string;
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
