// أسئلة تجريبية للدروس اللي لسه ماكتبناش أسئلتها (Chapters 2 و 3 لحد ما الكتاب يوصل).
// وظيفتها إن المحرك والمحاكاة يشتغلوا على الترم كله — ومتعلّم عليها placeholder عشان ماتظهرش لطالب حقيقي.
import { listLessons, type Curriculum } from "../curriculum/types";
import type { ChoiceQuestion, Difficulty, Question } from "./types";

const DIFFICULTIES: Difficulty[] = [1, 2, 3, 4, 5];
const PER_DIFFICULTY = 3;

export function withPlaceholders(curriculum: Curriculum, bank: Question[]): Question[] {
  const covered = new Set(bank.map((q) => q.lessonId));
  const generated: ChoiceQuestion[] = listLessons(curriculum)
    .filter((lesson) => !covered.has(lesson.id))
    .flatMap((lesson) =>
      lesson.objectives.flatMap((objective) =>
        DIFFICULTIES.flatMap((difficulty) =>
          Array.from({ length: PER_DIFFICULTY }, (_, i) => ({
            id: `${objective.id}-ph-d${difficulty}-${i + 1}`,
            lessonId: lesson.id,
            objectiveId: objective.id,
            difficulty,
            style: "choose" as const,
            type: "mcq" as const,
            prompts: [`[Placeholder] ${lesson.title} — level ${difficulty} question ${i + 1}`],
            correct: "Correct answer",
            distractors: ["Wrong answer A", "Wrong answer B", "Wrong answer C"],
            placeholder: true,
          })),
        ),
      ),
    );
  return [...bank, ...generated];
}
