// طالب افتراضي بيحل الاختبارات حسب مستواه — بنستخدمه في المحاكاة والاختبارات الآلية
// عشان نتأكد إن قواعد التدرّج والتقارير شغالة صح على ترم كامل قبل ما نجربها على طفل حقيقي.
import type { Answers } from "../assessment/grading";
import type { AnswerValue, Quiz, QuizItem } from "../assessment/quiz";
import { expectedScore } from "../mastery/mastery";
import { FALSE_LABEL, TRUE_LABEL } from "../questions/types";
import { createRng, pickOne, type Rng } from "../utils/random";

export function correctAnswer(item: QuizItem): AnswerValue {
  return item.answerKey;
}

export function wrongAnswer(item: QuizItem, rng: Rng): AnswerValue {
  const key = item.answerKey;
  switch (item.type) {
    case "mcq":
      return pickOne((item.choices ?? []).filter((c) => c !== key), rng);
    case "true_false":
      return key === TRUE_LABEL ? FALSE_LABEL : TRUE_LABEL;
    case "multi_select": {
      const wrong = (item.choices ?? []).filter((c) => !(key as string[]).includes(c));
      return wrong.length > 0 ? wrong : [];
    }
    case "fill_blank":
      return (key as string[]).map(() => "I don't know");
    case "order":
      return [...(key as string[])].reverse();
    case "match":
    case "classify": {
      const list = key as string[];
      const options = item.choices ?? [];
      return list.map((k) => options.find((o) => o !== k) ?? k);
    }
  }
}

export function answerAll(quiz: Quiz, isCorrect: (item: QuizItem) => boolean, rng: Rng = createRng(1)): Answers {
  return Object.fromEntries(quiz.items.map((item) => [item.questionId, isCorrect(item) ? correctAnswer(item) : wrongAnswer(item, rng)]));
}

export class SimulatedStudent {
  private readonly rng: Rng;

  /** ability بنفس مقياس Elo: 950 ضعيف، 1050 متوسط، 1150 جيد جدًا، 1250 متفوق */
  constructor(
    public ability: number,
    seed = 7,
  ) {
    this.rng = createRng(seed);
  }

  answer(quiz: Quiz): Answers {
    return answerAll(quiz, (item) => this.rng() < expectedScore(this.ability, item.difficulty), this.rng);
  }

  /** المذاكرة والمراجعة بترفع المستوى شوية */
  study(amount = 8): void {
    this.ability += amount;
  }
}
