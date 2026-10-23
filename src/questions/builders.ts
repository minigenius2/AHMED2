// أدوات صغيرة لكتابة الأسئلة بسرعة ومن غير أخطاء.
// المعرّف بيتولد من نص السؤال نفسه، فترتيب الأسئلة في الملف ممكن يتغير من غير ما سجل الطالب يبوظ.
import { hashString } from "../utils/random";
import type {
  ChoiceQuestion,
  ClassifyQuestion,
  Difficulty,
  ExamStyle,
  FillBlankQuestion,
  MatchQuestion,
  MultiSelectQuestion,
  OrderQuestion,
  TrueFalseQuestion,
} from "./types";

interface Extra {
  explanation?: string;
  page?: number;
  style?: ExamStyle;
}

type Prompt = string | string[];

export function questionWriter(lessonId: string) {
  const base = (objective: string, difficulty: Difficulty, style: ExamStyle, prompt: Prompt, extra?: Extra) => {
    const prompts = Array.isArray(prompt) ? prompt : [prompt];
    return {
      id: `${lessonId}-${hashString(`${lessonId}|${prompts[0]}`).toString(16).padStart(8, "0").slice(0, 8)}`,
      lessonId,
      objectiveId: `${lessonId}-${objective}`,
      difficulty,
      style: extra?.style ?? style,
      prompts,
      explanation: extra?.explanation,
      bookPage: extra?.page,
    };
  };

  return {
    mcq: (o: string, d: Difficulty, prompt: Prompt, correct: string, distractors: string[], extra?: Extra): ChoiceQuestion => ({
      ...base(o, d, "choose", prompt, extra),
      type: "mcq",
      correct,
      distractors,
    }),
    multi: (o: string, d: Difficulty, prompt: Prompt, correct: string[], distractors: string[], extra?: Extra): MultiSelectQuestion => ({
      ...base(o, d, "choose_all", prompt, extra),
      type: "multi_select",
      correct,
      distractors,
    }),
    tf: (o: string, d: Difficulty, prompt: Prompt, correct: boolean, extra?: Extra): TrueFalseQuestion => ({
      ...base(o, d, "true_false", prompt, extra),
      type: "true_false",
      correct,
    }),
    fill: (
      o: string,
      d: Difficulty,
      prompt: Prompt,
      blanks: string[][],
      wordBank?: string[],
      extra?: Extra & { anyOrder?: boolean },
    ): FillBlankQuestion => ({
      ...base(o, d, "complete", prompt, extra),
      type: "fill_blank",
      blanks,
      wordBank,
      anyOrder: extra?.anyOrder,
    }),
    order: (o: string, d: Difficulty, prompt: Prompt, sequence: string[], extra?: Extra): OrderQuestion => ({
      ...base(o, d, "order", prompt, extra),
      type: "order",
      sequence,
    }),
    match: (
      o: string,
      d: Difficulty,
      prompt: Prompt,
      pairs: Array<[string, string]>,
      extraRight?: string[],
      extra?: Extra,
    ): MatchQuestion => ({
      ...base(o, d, "match", prompt, extra),
      type: "match",
      pairs: pairs.map(([left, right]) => ({ left, right })),
      extraRight,
    }),
    classify: (
      o: string,
      d: Difficulty,
      prompt: Prompt,
      groups: string[],
      items: Array<[string, string]>,
      extra?: Extra,
    ): ClassifyQuestion => ({
      ...base(o, d, "classify", prompt, extra),
      type: "classify",
      groups,
      items: items.map(([item, group]) => ({ item, group })),
    }),
  };
}
