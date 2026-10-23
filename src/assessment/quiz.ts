// توليد الاختبارات: كل مرة اختبار جديد (أسئلة مختلفة، اختيارات مختلفة، ترتيب مختلف)
// مع ضمان تغطية نواتج التعلم والتركيز على نقط ضعف الطالب لما نطلب كده.
import type { DifficultyBand, Tier } from "../config";
import type { Difficulty, ExamStyle, Question, QuestionType } from "../questions/types";
import { FALSE_LABEL, TRUE_LABEL } from "../questions/types";
import { createRng, pickOne, shuffle, type Rng } from "../utils/random";
import type { ISODate } from "../utils/dates";

export type QuizKind = "homework" | Tier | "weekly" | "periodic" | "review" | "final_mock";

export const QUIZ_KIND_LABELS_AR: Record<QuizKind, string> = {
  homework: "واجب",
  basic: "اختبار المستوى الأساسي",
  standard: "اختبار المستوى المتوسط",
  advanced: "اختبار المتفوقين",
  weekly: "اختبار آخر الأسبوع",
  periodic: "اختبار الشهر",
  review: "اختبار مراجعة على نقط الضعف",
  final_mock: "امتحان تجريبي",
};

export interface QuizMeta {
  lessonId?: string;
  weekNumber?: number;
  periodIndex?: number;
  reviewOf?: "weekly" | "periodic";
}

export interface QuizRequest {
  kind: QuizKind;
  lessonIds: string[];
  questionCount: number;
  difficulty: DifficultyBand;
  /** وزن كل درس في الاختبار (افتراضيًا كلهم متساويين) */
  lessonWeights?: Record<string, number>;
  /** نواتج تعلم نركز عليها (نقط الضعف) */
  focusObjectiveIds?: string[];
  /** آخر مرة الطالب شاف فيها كل سؤال — عشان نفضّل الجديد */
  seenAt?: Record<string, ISODate>;
  seed: number;
  meta?: QuizMeta;
}

export type AnswerValue = string | string[];

/** سؤال جاهز للعرض. answerKey و acceptable بيفضلوا على السيرفر وما يوصلوش للطالب. */
export interface QuizItem {
  questionId: string;
  lessonId: string;
  objectiveId: string;
  difficulty: Difficulty;
  type: QuestionType;
  style: ExamStyle;
  prompt: string;
  /** اختيارات / بنك كلمات / عمود (B) / أسماء المجموعات */
  choices?: string[];
  /** عناصر الترتيب / عمود (A) / العناصر المطلوب تصنيفها */
  items?: string[];
  blankCount?: number;
  anyOrder?: boolean;
  answerKey: AnswerValue;
  acceptable?: string[][];
  explanation?: string;
  bookPage?: number;
}

export interface Quiz {
  id: string;
  kind: QuizKind;
  lessonIds: string[];
  items: QuizItem[];
  seed: number;
  meta: QuizMeta;
}

export type StudentQuizItem = Omit<QuizItem, "answerKey" | "acceptable" | "explanation">;

/** النسخة اللي بتتبعت لموبايل الطالب — من غير الإجابات. */
export function toStudentView(quiz: Quiz): Omit<Quiz, "items"> & { items: StudentQuizItem[] } {
  return {
    ...quiz,
    items: quiz.items.map(({ answerKey: _a, acceptable: _b, explanation: _c, ...rest }) => rest),
  };
}

export function generateQuiz(bank: readonly Question[], request: QuizRequest): Quiz {
  const rng = createRng(request.seed);
  const candidates = bank.filter((q) => request.lessonIds.includes(q.lessonId));
  if (candidates.length === 0) throw new Error(`No questions available for lessons: ${request.lessonIds.join(", ")}`);

  const pool = widenUntilEnough(candidates, request.difficulty, request.questionCount);
  const perLesson = allocate(request, pool);
  const picked: Question[] = [];
  for (const [lessonId, count] of perLesson) {
    picked.push(...pickForLesson(pool.filter((q) => q.lessonId === lessonId), count, request, rng));
  }

  // الأسهل الأول، والعشوائية جوه نفس مستوى الصعوبة — أريح لطفل عنده 9 سنين
  const ordered = shuffle(picked, rng).sort((a, b) => a.difficulty - b.difficulty);
  return {
    id: `${request.kind}-${request.seed.toString(36)}`,
    kind: request.kind,
    lessonIds: request.lessonIds,
    items: ordered.map((q) => buildItem(q, rng)),
    seed: request.seed,
    meta: request.meta ?? {},
  };
}

/** لو الأسئلة في نطاق الصعوبة المطلوب مش كفاية، نوسّع النطاق خطوة خطوة. */
function widenUntilEnough(candidates: Question[], band: DifficultyBand, needed: number): Question[] {
  let min = band.min as number;
  let max = band.max as number;
  for (;;) {
    const inBand = candidates.filter((q) => q.difficulty >= min && q.difficulty <= max);
    if (inBand.length >= needed || (min <= 1 && max >= 5)) return inBand.length > 0 ? inBand : candidates;
    min = Math.max(1, min - 1);
    max = Math.min(5, max + 1);
  }
}

/** توزيع عدد الأسئلة على الدروس بالأوزان (طريقة أكبر باقي)، من غير ما نطلب من درس أكتر من اللي عنده. */
function allocate(request: QuizRequest, pool: Question[]): Map<string, number> {
  const available = new Map<string, number>();
  for (const q of pool) available.set(q.lessonId, (available.get(q.lessonId) ?? 0) + 1);
  const lessons = request.lessonIds.filter((id) => available.has(id));
  const total = Math.min(request.questionCount, pool.length);

  const weights = lessons.map((id) => request.lessonWeights?.[id] ?? 1);
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / weightSum) * total);
  const counts = raw.map(Math.floor);
  const byRemainder = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem);
  let missing = total - counts.reduce((a, b) => a + b, 0);
  for (const { i } of byRemainder) {
    if (missing <= 0) break;
    counts[i] = (counts[i] as number) + 1;
    missing--;
  }

  // لو درس طلبنا منه أكتر من أسئلته، نوزع الزيادة على الباقي
  let overflow = 0;
  lessons.forEach((id, i) => {
    const cap = available.get(id) as number;
    if ((counts[i] as number) > cap) {
      overflow += (counts[i] as number) - cap;
      counts[i] = cap;
    }
  });
  while (overflow > 0) {
    const idx = lessons.findIndex((id, i) => (counts[i] as number) < (available.get(id) as number));
    if (idx === -1) break;
    counts[idx] = (counts[idx] as number) + 1;
    overflow--;
  }
  return new Map(lessons.map((id, i) => [id, counts[i] as number]));
}

/**
 * اختيار أسئلة درس واحد: الأول من الأسئلة اللي الطالب عمره ما شافها، وبعدين الأقدم فالأقدم.
 * جوه كل مجموعة بنلف على نواتج التعلم بالدور عشان التغطية، ونقط الضعف بتاخد دورين في كل لفة.
 */
function pickForLesson(questions: Question[], count: number, request: QuizRequest, rng: Rng): Question[] {
  const focus = new Set(request.focusObjectiveIds ?? []);
  const seenAt = request.seenAt ?? {};
  const shuffled = shuffle(questions, rng);
  const fresh = shuffled.filter((q) => seenAt[q.id] === undefined);
  const stale = shuffled
    .filter((q) => seenAt[q.id] !== undefined)
    .sort((a, b) => (seenAt[a.id] as string).localeCompare(seenAt[b.id] as string));
  const objectives = shuffle([...new Set(questions.map((q) => q.objectiveId))], rng).sort(
    (a, b) => Number(focus.has(b)) - Number(focus.has(a)),
  );

  const picked: Question[] = [];
  for (const group of [fresh, stale]) {
    const byObjective = new Map<string, Question[]>();
    for (const q of group) byObjective.set(q.objectiveId, [...(byObjective.get(q.objectiveId) ?? []), q]);
    while (picked.length < count) {
      let progressed = false;
      for (const objectiveId of objectives) {
        const turns = focus.has(objectiveId) ? 2 : 1;
        for (let t = 0; t < turns && picked.length < count; t++) {
          const next = byObjective.get(objectiveId)?.shift();
          if (next) {
            picked.push(next);
            progressed = true;
          }
        }
      }
      if (!progressed) break;
    }
  }
  return picked;
}

function buildItem(q: Question, rng: Rng): QuizItem {
  const common = {
    questionId: q.id,
    lessonId: q.lessonId,
    objectiveId: q.objectiveId,
    difficulty: q.difficulty,
    type: q.type,
    style: q.style,
    prompt: pickOne(q.prompts, rng),
    explanation: q.explanation,
    bookPage: q.bookPage,
  };
  switch (q.type) {
    case "mcq":
      return { ...common, choices: shuffle([q.correct, ...shuffle(q.distractors, rng).slice(0, 3)], rng), answerKey: q.correct };
    case "multi_select": {
      const wrong = shuffle(q.distractors, rng).slice(0, Math.max(1, 5 - q.correct.length));
      return { ...common, choices: shuffle([...q.correct, ...wrong], rng), answerKey: q.correct };
    }
    case "true_false":
      return { ...common, choices: [TRUE_LABEL, FALSE_LABEL], answerKey: q.correct ? TRUE_LABEL : FALSE_LABEL };
    case "fill_blank":
      return {
        ...common,
        choices: q.wordBank ? shuffle(q.wordBank, rng) : undefined,
        blankCount: q.blanks.length,
        anyOrder: q.anyOrder,
        acceptable: q.blanks,
        answerKey: q.blanks.map((b) => b[0] as string),
      };
    case "order": {
      let items = shuffle(q.sequence, rng);
      if (items.every((v, i) => v === q.sequence[i])) items = [...items.slice(1), items[0] as string];
      return { ...common, items, answerKey: q.sequence };
    }
    case "match": {
      const pairs = shuffle(q.pairs, rng);
      return {
        ...common,
        items: pairs.map((p) => p.left),
        choices: shuffle([...pairs.map((p) => p.right), ...(q.extraRight ?? [])], rng),
        answerKey: pairs.map((p) => p.right),
      };
    }
    case "classify": {
      const items = shuffle(q.items, rng);
      return { ...common, items: items.map((i) => i.item), choices: q.groups, answerKey: items.map((i) => i.group) };
    }
  }
}
