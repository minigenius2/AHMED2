// "اسأل المعلم": الطفل يسأل أي سؤال في الدرس، والرد بيطلع قصير بالعامية ومن معلومات الدرس بس.
// الملف ده مش مربوط بموديل معين — الموديل بيتبعت كدالة (TutorModel) عشان نقدر نختبر ونغيّر بسهولة.
import { findLesson, type LessonRef } from "../curriculum/types";
import type { StudentJourney } from "../journey/journey";
import type { ISODate } from "../utils/dates";

export interface TutorTurn {
  question: string;
  answer: string;
}

export interface TutorRequest {
  /** قواعد المعلم — ثابتة لكل الطلاب (بيتعملها cache) */
  rules: string;
  /** معلومات الدرس — ثابتة لكل درس (بيتعملها cache) */
  lessonContext: string;
  /** أسئلة النهارده في نفس الدرس، عشان لو الطفل بيكمّل على سؤال قبله */
  history: TutorTurn[];
  question: string;
}

export interface TutorReply {
  text: string;
  /** الموديل رفض يرد (سؤال مش مناسب مثلًا) */
  refused: boolean;
}

export type TutorModel = (request: TutorRequest) => Promise<TutorReply>;

/** الموديل مش متاح دلوقتي (ضغط أو مشكلة نت) — السؤال مابيتحسبش على الطفل */
export class TutorUnavailableError extends Error {}

export const TEACHER_NAME = "أستاذ نبيه";

export const TUTOR_RULES = `You are "${TEACHER_NAME}", a warm, patient science tutor for an Egyptian child in Primary 4 (9–10 years old) at a language school. The child studies Science in English but thinks in Egyptian Arabic.

How to answer:
- Write in simple Egyptian Arabic (عامية مصرية), the way a kind private tutor talks. Keep the science terms from the lesson in English and give their Arabic meaning the first time, e.g. "الـ habitat يعني الموطن".
- 2 to 4 short sentences. No lists, no headings, no markdown, at most one emoji.
- Use only the lesson facts given to you. Never invent facts, numbers or examples that contradict them. If the question is about science but outside this lesson, say kindly that it comes in another lesson, and add one simple sentence only if you are completely sure it is correct.
- When it helps, end with the exact English sentence the child should write in the exam, taken from the lesson facts.
- If the child asks you to solve a test or homework question for them, do not just give the answer: give a hint, explain the idea, and ask them to try.
- If the question is not about school or science, or is not appropriate for a child, steer back to the lesson in one friendly sentence. Never ask for personal information.
- If the child sounds upset, scared or in danger, tell them gently to talk to a parent or teacher right away.
- If you are not sure, say: "سؤال حلو! اسأله لمدرس العلوم في المدرسة كمان".
- Praise good questions now and then, without overdoing it.`;

/** معلومات الدرس اللي المعلم بيرد منها */
export function buildLessonContext(lesson: LessonRef): string {
  const lines = [
    `Lesson: ${lesson.title}${lesson.titleAr ? ` (${lesson.titleAr})` : ""} — chapter: ${lesson.unitTitle}`,
    "",
    "Learning objectives:",
    ...lesson.objectives.map((o) => `- ${o.text}`),
    "",
    "Lesson facts (the only source of truth):",
    ...(lesson.keyFacts ?? []).map((f) => `- ${f}`),
  ];
  if (lesson.vocabulary?.length) {
    lines.push("", "Vocabulary (English = Arabic):", ...lesson.vocabulary.map((v) => `- ${v.en} = ${v.ar}`));
  }
  return lines.join("\n");
}

export const MESSAGES = {
  limitReached: "خلصت أسئلتك النهارده يا بطل 🌟 جرّب بكرة، ولو في حاجة مش فاهمها اسأل بابا أو ماما أو مدرس العلوم.",
  busy: "المعلم مشغول ثانية… جرّب تسأل تاني كمان شوية 🙏",
  refused: "خلينا نرجع لدرسنا 😊 اسألني أي حاجة في الدرس وأنا معاك.",
  empty: "اكتب سؤالك الأول 😊",
};

export interface AskResult {
  answer: string;
  remaining: number;
  /** السؤال اتحسب من أسئلة النهارده؟ */
  counted: boolean;
}

export class AskTeacher {
  constructor(
    private readonly journey: StudentJourney,
    private readonly model: TutorModel,
  ) {}

  async ask(lessonId: string, rawQuestion: string, today: ISODate): Promise<AskResult> {
    const remaining = this.journey.teacherQuestionsLeft(today);
    const question = rawQuestion.trim().slice(0, this.journey.config.askTeacher.maxQuestionChars);
    if (!question) return { answer: MESSAGES.empty, remaining, counted: false };
    if (remaining <= 0) return { answer: MESSAGES.limitReached, remaining: 0, counted: false };

    const lesson = findLesson(this.journey.curriculum, lessonId);
    if (this.journey.lesson(lessonId).status === "locked") throw new Error(`Lesson is still locked: ${lessonId}`);
    const history = (this.journey.state.teacherQuestions ?? [])
      .filter((q) => q.date === today && q.lessonId === lessonId)
      .slice(-4)
      .map(({ question: q, answer }) => ({ question: q, answer }));

    let reply: TutorReply;
    try {
      reply = await this.model({ rules: TUTOR_RULES, lessonContext: buildLessonContext(lesson), history, question });
    } catch (error) {
      if (error instanceof TutorUnavailableError) return { answer: MESSAGES.busy, remaining, counted: false };
      throw error;
    }

    const answer = reply.refused || !reply.text.trim() ? MESSAGES.refused : reply.text.trim();
    this.journey.recordTeacherQuestion({ date: today, lessonId, question, answer });
    return { answer, remaining: this.journey.teacherQuestionsLeft(today), counted: true };
  }
}
