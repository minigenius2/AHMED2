// بيجهّز "الحصة الجاية" للطفل من سيناريو الدرس وحالته:
// - حصة عادية: الحصة رقم (اللي خلصه + 1)، وسؤالين استرجاع من اللي فات بيتختاروا من بنك الأسئلة.
// - حصة مراجعة علاجية: الشرح البديل للجزئيات اللي غلط فيها بس، ونصايح الامتحان بتاعتها، وخلاصة.
import { generateQuiz, type QuizItem } from "../assessment/quiz";
import type { StudentJourney } from "../journey/journey";
import type { Question } from "../questions/types";
import { hashString } from "../utils/random";
import type { ExplainStep, LessonScript, RecallStep, ScriptStep, SummaryStep } from "./script-types";

export type PlayableStep = Exclude<ScriptStep, RecallStep> | { kind: "recall"; say: string; items: QuizItem[] };

export interface PlayableSession {
  lessonId: string;
  kind: "lesson" | "remediation";
  session: number;
  sessions: number;
  title: string;
  steps: PlayableStep[];
}

export function buildLearningSession(
  journey: StudentJourney,
  script: LessonScript,
  bank: readonly Question[],
): PlayableSession {
  const action = journey.availableActions().find((a) => a.type === "learn" && a.lessonId === script.lessonId);
  if (!action || action.type !== "learn") throw new Error(`No learning session is available for ${script.lessonId}`);
  const progress = journey.lesson(script.lessonId);
  const seed = hashString(`${journey.state.student.id}|${script.lessonId}|${progress.learningSessions}`);

  if (action.remediation) {
    const weak = progress.remediationObjectiveIds ?? [];
    const allSteps = script.sessions.flatMap((s) => s.steps);
    const steps: PlayableStep[] = [
      {
        kind: "hook",
        say: "تعالى نراجع سوا الحتت اللي كانت صعبة شوية، بس المرة دي هشرحهالك بطريقة تانية خالص 💪",
        illustration: { emoji: "🔁", prompt: "A friendly teacher character encouraging a child to try again" },
      },
    ];
    for (const objectiveId of weak) {
      steps.push(...(script.alternatives[objectiveId] ?? []).map((s) => s as PlayableStep));
      steps.push(...allSteps.filter((s): s is Exclude<ScriptStep, RecallStep> => s.kind === "exam_tip" && s.objectiveId === objectiveId));
    }
    steps.push(remediationSummary(allSteps, weak));
    return { lessonId: script.lessonId, kind: "remediation", session: 1, sessions: 1, title: "مراجعة بطريقة تانية", steps };
  }

  const session = script.sessions[action.session - 1];
  if (!session) throw new Error(`Script ${script.lessonId} has no session ${action.session}`);
  const steps: PlayableStep[] = [];
  for (const step of session.steps) {
    if (step.kind !== "recall") {
      steps.push(step);
      continue;
    }
    const items = recallItems(journey, script, action.session, step.count, bank, seed);
    if (items.length > 0) steps.push({ kind: "recall", say: step.say, items });
  }
  return { lessonId: script.lessonId, kind: "lesson", session: action.session, sessions: action.sessions, title: session.title, steps };
}

/** الحصة الأولى بتسترجع من الدرس اللي قبلها، والحصص بعدها بتسترجع من حصص نفس الدرس اللي خلصت. */
function recallItems(
  journey: StudentJourney,
  script: LessonScript,
  sessionNumber: number,
  count: number,
  bank: readonly Question[],
  seed: number,
): QuizItem[] {
  const order = journey.plan.lessonOrder;
  if (sessionNumber > 1) {
    const covered = new Set(
      script.sessions
        .slice(0, sessionNumber - 1)
        .flatMap((s) => s.steps)
        .flatMap((s) => ("objectiveId" in s ? [s.objectiveId] : [])),
    );
    const pool = bank.filter((q) => covered.has(q.objectiveId));
    return pool.length ? pick(pool, script.lessonId, count, seed) : [];
  }
  const previous = order[order.indexOf(script.lessonId) - 1];
  if (!previous) return [];
  return pick(bank.filter((q) => q.lessonId === previous), previous, count, seed);
}

function pick(pool: readonly Question[], lessonId: string, count: number, seed: number): QuizItem[] {
  const easy = pool.filter((q) => q.difficulty <= 2 && (q.type === "mcq" || q.type === "true_false"));
  if (easy.length === 0) return [];
  return generateQuiz(easy, { kind: "review", lessonIds: [lessonId], questionCount: count, difficulty: { min: 1, max: 2 }, seed }).items;
}

function remediationSummary(allSteps: ScriptStep[], weak: string[]): SummaryStep {
  const points = allSteps
    .filter((s): s is ExplainStep => s.kind === "explain" && weak.includes(s.objectiveId) && s.english !== undefined)
    .map((s) => s.english!.text);
  return { kind: "summary", say: "دي أهم حاجات لازم تفتكرها. يلا نجرب الواجب تاني 🚀", points };
}
