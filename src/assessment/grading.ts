// التصحيح: كل سؤال بياخد درجة من 0 لـ 1 (فيه درجات جزئية للتوصيل والتصنيف والفراغات المتعددة)،
// والنتيجة بتتقسم حسب الدرس وناتج التعلم وشكل السؤال — دي اللي بتبني تقرير ولي الأمر.
import type { ExamStyle } from "../questions/types";
import { normalizeAnswer } from "../questions/types";
import type { AnswerValue, Quiz, QuizItem, QuizKind } from "./quiz";

export type Answers = Record<string, AnswerValue | undefined>;

export interface ItemResult {
  questionId: string;
  lessonId: string;
  objectiveId: string;
  style: ExamStyle;
  difficulty: number;
  /** من 0 لـ 1 */
  credit: number;
  correct: boolean;
  given?: AnswerValue;
}

export interface Tally {
  earned: number;
  total: number;
}

export interface QuizResult {
  quizId: string;
  kind: QuizKind;
  /** من 0 لـ 1 */
  score: number;
  earned: number;
  total: number;
  items: ItemResult[];
  byLesson: Record<string, Tally>;
  byObjective: Record<string, Tally>;
  byStyle: Partial<Record<ExamStyle, Tally>>;
}

export function gradeQuiz(quiz: Quiz, answers: Answers): QuizResult {
  const items = quiz.items.map((item) => {
    const given = answers[item.questionId];
    const credit = given === undefined ? 0 : gradeItem(item, given);
    return {
      questionId: item.questionId,
      lessonId: item.lessonId,
      objectiveId: item.objectiveId,
      style: item.style,
      difficulty: item.difficulty,
      credit,
      correct: credit >= 0.999,
      given,
    };
  });

  const earned = items.reduce((sum, i) => sum + i.credit, 0);
  const total = items.length;
  return {
    quizId: quiz.id,
    kind: quiz.kind,
    score: total === 0 ? 0 : earned / total,
    earned,
    total,
    items,
    byLesson: tally(items, (i) => i.lessonId),
    byObjective: tally(items, (i) => i.objectiveId),
    byStyle: tally(items, (i) => i.style),
  };
}

function tally<K extends string>(items: ItemResult[], key: (i: ItemResult) => K): Record<K, Tally> {
  const out = {} as Record<K, Tally>;
  for (const item of items) {
    const k = key(item);
    const t = out[k] ?? { earned: 0, total: 0 };
    t.earned += item.credit;
    t.total += 1;
    out[k] = t;
  }
  return out;
}

const same = (a: string, b: string) => normalizeAnswer(a) === normalizeAnswer(b);
const asList = (value: AnswerValue) => (Array.isArray(value) ? value : [value]);

export function gradeItem(item: QuizItem, given: AnswerValue): number {
  switch (item.type) {
    case "mcq":
    case "true_false":
      return same(asList(given)[0] ?? "", item.answerKey as string) ? 1 : 0;

    case "multi_select": {
      // كل اختيار صح بياخد جزء، وكل اختيار غلط بيخصم جزء — من غير ما ننزل تحت الصفر
      const key = item.answerKey as string[];
      const chosen = [...new Set(asList(given).map(normalizeAnswer))];
      const hits = chosen.filter((c) => key.some((k) => same(k, c))).length;
      const wrong = chosen.length - hits;
      return Math.max(0, (hits - wrong) / key.length);
    }

    case "fill_blank": {
      const acceptable = item.acceptable ?? [];
      const answers = asList(given);
      if (!item.anyOrder) {
        const right = acceptable.filter((options, i) => options.some((o) => same(o, answers[i] ?? ""))).length;
        return right / acceptable.length;
      }
      // أي ترتيب: كل إجابة مقبولة تتحسب مرة واحدة بس (Both rocks and rocks ماينفعش)
      const used = new Set<string>();
      let right = 0;
      for (const answer of answers.slice(0, acceptable.length)) {
        const norm = normalizeAnswer(answer);
        if (used.has(norm)) continue;
        if (acceptable.some((options) => options.some((o) => same(o, norm)))) {
          used.add(norm);
          right++;
        }
      }
      return right / acceptable.length;
    }

    case "order": {
      const key = item.answerKey as string[];
      const answers = asList(given);
      if (key.every((k, i) => same(k, answers[i] ?? ""))) return 1;
      return key.filter((k, i) => same(k, answers[i] ?? "")).length / key.length / 2; // الترتيب الناقص ياخد نص الدرجة بالكتير
    }

    case "match":
    case "classify": {
      const key = item.answerKey as string[];
      const answers = asList(given);
      return key.filter((k, i) => same(k, answers[i] ?? "")).length / key.length;
    }
  }
}
