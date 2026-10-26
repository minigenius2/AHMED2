// كل جملة المعلم بيقولها بصوت: جمل سيناريو الدرس + جمل ثابتة بيقولها في كل الدروس.
// الجمل دي بتتسجل بصوت بشري. كل جملة ليها اسم ملف ثابت محسوب من نصها المنطوق:
// لو النص اتغير، اسم الملف بيتغير، فالجملة دي لوحدها بتظهر إنها محتاجة تتسجل تاني.
import { hashString } from "../utils/random";
import type { LessonScript, ScriptStep } from "./script-types";

/** جمل ثابتة بيقولها المعلم في كل الدروس (بتتسجل مرة واحدة) */
export const PLAYER_PHRASES = {
  recallMore: "وسؤال كمان:",
  recallRight: "صح! لسه فاكر.",
  recallWrong: "مش مشكلة، الإجابة الصح:",
  confirmPrompt: "كمّل الجملة: اختار الكلمة الناقصة.",
  confirmRight: "برافو!",
  confirmWrong: "مش دي. فكّر تاني.",
  activityDone: "برافو! رتّبتهم كلهم صح.",
  huntSearch: "يلا نشوف! دوس على الأماكن ودوّر.",
  guessRight: "تخمينك كان صح!",
  huntDone: "عاش يا مستكشف! لقيت كل الكائنات، وسجّلتهم في الكراسة.",
  termsMatch: "يلا وصّل كل كلمة بصورتها.",
  matchWrong: "مش دي، جرّب تاني.",
  matchDone: "برافو! وصّلتهم كلهم صح.",
  buildWrong: "مش دي. فكّر في الكلمة اللي بعدها.",
  buildDone: "برافو! بنيت الجملة كلها بنفسك.",
  sequenceWrong: "لأ، فكّر إيه اللي بييجي بعد كده.",
  revisitAllRight: "تخمينك كان صح كله! برافو عليك.",
  revisitDone: "عاش! صلّحت تخمينك بنفسك.",
  examSentence: "ودي جملة الامتحان. اسمعها كويس:",
  predictSaved: "تمام! يلا نختبر تخمينك.",
  badgeEarned: "كسبت وسام جديد!",
  remediationIntro: "تعالى نراجع سوا الحتت اللي كانت صعبة شوية، بس المرة دي هشرحهالك بطريقة تانية خالص 💪",
  remediationSummary: "دي أهم حاجات لازم تفتكرها. يلا نجرب الواجب تاني 🚀",
  sessionDone: "عاش يا بطل! الحصة خلصت، والحصة الجاية مستنياك.",
  lessonDone: "عاش! الدرس كله خلص، وكده الواجب اتفتح.",
  remediationDone: "المراجعة خلصت. يلا نحل الواجب تاني.",
} as const;

export type NarrationLang = "ar" | "en" | "mixed";

export interface NarrationLine {
  /** اسم الملف من غير الامتداد */
  id: string;
  /** النص زي ما هيتقري (من غير إيموجي) */
  text: string;
  /** عربي، ولا إنجليزي، ولا عربي فيه كلمات إنجليزي لازم تتنطق إنجليزي */
  lang: NarrationLang;
  /** الجملة دي فين في الحصة — عشان اللي بيسجّل يفهم السياق */
  where: string;
  /** النصوص الأصلية (بالإيموجي) اللي بتتنطق بالجملة دي — الواجهة بتدوّر بيها على التسجيل */
  sources: string[];
}

const EMOJI = "[\\p{Extended_Pictographic}\\u200d\\uFE0F]";
const EMOJI_BETWEEN_WORDS = new RegExp(`(?<=[\\p{L}\\p{N}])\\s*(?:${EMOJI}\\s*)+(?=[\\p{L}\\p{N}])`, "gu");

/** النص اللي بيتقري فعلًا: من غير إيموجي (والإيموجي اللي بين كلامين بيبقى وقفة)، والأسهم بتبقى وقفة */
export function spokenText(text: string): string {
  return text
    .replace(EMOJI_BETWEEN_WORDS, "، ")
    .replace(new RegExp(EMOJI, "gu"), "")
    .replace(/\s*[←→|]\s*/g, "، ")
    .replace(/\s+/g, " ")
    .trim();
}

/** اسم ملف ثابت للجملة (64 بت عشان مايحصلش تكرار بين جملتين مختلفتين) */
export function narrationId(text: string): string {
  const spoken = spokenText(text);
  const a = hashString(spoken).toString(36).padStart(7, "0");
  const b = hashString(`v|${spoken}`).toString(36).padStart(7, "0");
  return `n${a}${b}`;
}

function langOf(text: string): NarrationLang {
  const arabic = /[؀-ۿ]/.test(text);
  const latin = /[A-Za-z]/.test(text);
  return arabic && latin ? "mixed" : arabic ? "ar" : "en";
}

class LineCollector {
  readonly lines: NarrationLine[] = [];
  private readonly seen = new Map<string, NarrationLine>();

  add(text: string | undefined, where: string): void {
    if (!text) return;
    const spoken = spokenText(text);
    if (!/[\p{L}\p{N}]/u.test(spoken)) return;
    const id = narrationId(text);
    const previous = this.seen.get(id);
    if (previous !== undefined) {
      if (previous.text !== spoken) throw new Error(`Narration id collision: "${previous.text}" / "${spoken}"`);
      if (!previous.sources.includes(text)) previous.sources.push(text);
      return;
    }
    const line: NarrationLine = { id, text: spoken, lang: langOf(spoken), where, sources: [text] };
    this.seen.set(id, line);
    this.lines.push(line);
  }
}

const STEP_NAMES: Record<ScriptStep["kind"], string> = {
  mission: "المهمة",
  hook: "بداية",
  recall: "استرجاع",
  terms: "المصطلحات",
  explain: "شرح",
  check: "سؤال فهم",
  activity: "لعبة ترتيب",
  revisit: "صلّح تخمينك",
  probe: "تجربة",
  match: "وصّل",
  build: "ابني الجملة",
  sequence: "رتّب المراحل",
  hunt: "رحلة استكشاف",
  exam_tip: "سؤال امتحان",
  exit: "تذكرة الخروج",
  summary: "خلاصة",
};

function collectStep(c: LineCollector, step: ScriptStep, place: string): void {
  const where = (detail?: string) => `${place} · ${STEP_NAMES[step.kind]}${detail ? ` · ${detail}` : ""}`;
  const term = (t: { en: string; ar: string }, detail: string) => {
    c.add(t.en, where(`${detail} (إنجليزي)`));
    c.add(t.ar, where(`${detail} (عربي)`));
  };
  switch (step.kind) {
    case "mission":
      c.add(step.say, where(`«${step.titleEn}»`));
      step.badges.forEach((b, i) => term(b, `وسام ${i + 1}`));
      break;
    case "hook":
    case "recall":
    case "revisit":
    case "exit":
      c.add(step.say, where());
      break;
    case "terms":
      c.add(step.say, where());
      for (const t of step.terms) term(t, "مصطلح");
      break;
    case "explain":
      c.add(step.say, where(`«${step.titleEn}»`));
      for (const p of step.points) {
        c.add(p.en, where(`كارت «${p.en}»`));
        c.add(p.say, where(`لما يكشف «${p.en}»`));
      }
      c.add(step.english.text, where(`«${step.titleEn}» · جملة الامتحان`));
      break;
    case "check":
      c.add(step.ask, where("السؤال"));
      for (const choice of step.choices) c.add(choice.feedback, where(choice.correct ? "لو جاوب صح" : `لو اختار «${choice.en ?? choice.text}»`));
      c.add(step.reteach, where("إعادة الشرح لو غلط"));
      break;
    case "activity":
      c.add(step.say, where());
      for (const item of step.items) {
        c.add(item.en, where("اسم كارت"));
        c.add(item.why, where(`ليه «${item.en}» هنا`));
      }
      c.add(step.tryAtHome, where("جرّبها في البيت"));
      break;
    case "probe":
      c.add(step.say, where(`«${step.titleEn}»`));
      for (const item of step.items) {
        c.add(item.en, where("اسم الحاجة"));
        c.add(item.caption, where(`رد الفعل · ${item.en}`));
      }
      c.add(step.conclusion, where("الاستنتاج"));
      break;
    case "match":
      c.add(step.say, where());
      for (const pair of step.pairs) {
        c.add(pair.left.en, where("الكارت الشمال"));
        c.add(pair.right.en, where("الكارت اليمين"));
      }
      break;
    case "build":
      c.add(step.say, where());
      c.add(step.sentence, where("الجملة كاملة"));
      break;
    case "sequence":
      c.add(step.say, where(`«${step.titleEn}»`));
      for (const item of step.items) c.add(item.en, where("مرحلة"));
      c.add(step.conclusion, where("الاستنتاج"));
      break;
    case "hunt":
      c.add(step.say, where(`«${step.titleEn}»`));
      c.add(step.guess.ask, where("سؤال التخمين"));
      for (const spot of step.spots) {
        c.add(spot.caption, where(`لما يكشف «${spot.en}»`));
        if (spot.find) c.add(`${spot.find.en}: ${spot.en}`, where("سطر كراسة المستكشف"));
      }
      c.add(step.tryAtHome, where("جرّبها في البيت"));
      break;
    case "exam_tip":
      c.add(step.question, where("السؤال"));
      c.add(step.say, where("النصيحة"));
      c.add(step.modelAnswer.text, where("الإجابة النموذجية"));
      break;
    case "summary":
      c.add(step.say, where());
      step.points.forEach((p, i) => c.add(p.en, where(`نقطة ${i + 1}`)));
      break;
  }
}

/** كل جمل الدرس بالترتيب اللي هتتقال بيه، من غير تكرار (الجملة اللي بتتكرر بتتسجل مرة واحدة) */
export function lessonNarration(script: LessonScript): NarrationLine[] {
  const c = new LineCollector();
  script.sessions.forEach((session, i) => {
    for (const step of session.steps) collectStep(c, step, `الحصة ${i + 1}`);
  });
  for (const steps of Object.values(script.alternatives)) {
    for (const step of steps) collectStep(c, step, "المراجعة العلاجية");
  }
  return c.lines;
}

/** الجمل الثابتة المشتركة بين كل الدروس */
export function commonNarration(): NarrationLine[] {
  const c = new LineCollector();
  for (const [key, text] of Object.entries(PLAYER_PHRASES)) c.add(text, `جملة ثابتة · ${key}`);
  return c.lines;
}
