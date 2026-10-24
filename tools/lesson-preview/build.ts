// بيطلّع صفحة HTML واحدة تتجرب من الموبايل لأي درس ليه سيناريو:
//   npm run preview:lesson -- ch1-l1 [preview/ch1-l1.html] [--title="حصة الكائنات الحية"]
// الصفحة بتقرا السيناريو زي المحرك بالظبط (استرجاع، أسئلة فهم وإعادة شرح، لعبة ترتيب، نصايح امتحان، خلاصة، مراجعة علاجية)،
// وفيها "اسأل المعلم" بنفس قواعد المعلم ومعلومات الدرس — بيشتغل لما الصفحة تتنشر كـ Artifact فيه قدرة sample.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listLessons } from "../../src/curriculum/types";
import { generateQuiz } from "../../src/assessment/quiz";
import { EXAM_STYLE_LABELS_AR, type Question } from "../../src/questions/types";
import { buildLessonContext, MESSAGES, TUTOR_RULES } from "../../src/teaching/ask-teacher";
import { validateScript } from "../../src/teaching/validate-script";
import { scienceG4Term1, scienceG4Term1Bank, scienceG4Term1Scripts } from "../../src/content/science-g4-term1";

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=") as [string, string]));
const [lessonId = "ch1-l1", outArg] = args.filter((a) => !a.startsWith("--"));

const lessons = listLessons(scienceG4Term1);
const index = lessons.findIndex((l) => l.id === lessonId);
const lesson = lessons[index];
const script = scienceG4Term1Scripts[lessonId];
if (!lesson || !script) throw new Error(`No lesson script for ${lessonId}. Available: ${Object.keys(scienceG4Term1Scripts).join(", ")}`);
const problems = validateScript(script, lesson);
if (problems.length) throw new Error(problems.join("\n"));

/** أسئلة استرجاع سهلة (اختيار أو صح وغلط) — الطفل بيشوف منهم عدد الـ count بتاع الخطوة */
function recallPool(questions: Question[], lessonIdForQuiz: string) {
  const easy = questions.filter((q) => q.difficulty <= 2 && (q.type === "mcq" || q.type === "true_false"));
  if (!easy.length) return [];
  return generateQuiz(easy, { kind: "review", lessonIds: [lessonIdForQuiz], questionCount: Math.min(8, easy.length), difficulty: { min: 1, max: 2 }, seed: 7 })
    .items.map(({ prompt, type, choices, answerKey, explanation }) => ({
      prompt,
      type,
      choices: type === "true_false" ? ["True", "False"] : choices,
      answerKey,
      explanation,
    }));
}

// زي المحرك: الحصة الأولى بتسترجع من الدرس اللي قبله، والحصص اللي بعدها من حصص نفس الدرس اللي خلصت
const previous = lessons[index - 1];
const covered: Record<number, ReturnType<typeof recallPool>> = {};
script.sessions.forEach((_, i) => {
  if (i === 0) return;
  const objectives = new Set(script.sessions.slice(0, i).flatMap((s) => s.steps).flatMap((s) => ("objectiveId" in s ? [s.objectiveId] : [])));
  covered[i + 1] = recallPool(scienceG4Term1Bank.filter((q) => objectives.has(q.objectiveId)), lessonId);
});

const unitNumber = scienceG4Term1.units.findIndex((u) => u.id === lesson.unitId) + 1;
const lessonNumber = scienceG4Term1.units[unitNumber - 1]!.lessons.findIndex((l) => l.id === lessonId) + 1;
const objectiveIds = lesson.objectives.map((o) => o.id);
const vocabulary = lesson.vocabulary ?? [];

const data = {
  lessonId,
  title: lesson.title,
  titleAr: lesson.titleAr ?? "",
  unitTitle: lesson.unitTitle,
  lessonLabel: `الفصل ${unitNumber}، الدرس ${lessonNumber}`,
  subjectLine: "العلوم — رابعة ابتدائي",
  script,
  recall: { previous: previous ? recallPool(scienceG4Term1Bank.filter((q) => q.lessonId === previous.id), previous.id) : [], covered },
  styleLabels: EXAM_STYLE_LABELS_AR,
  // مثال المراجعة العلاجية: جزئيتين من الدرس كأن الطفل غلط فيهم
  demoWeak: [objectiveIds[0], objectiveIds[2] ?? objectiveIds[1]].filter((id): id is string => !!id),
  suggestions: [...vocabulary.slice(0, 2).map((v) => `يعني إيه ${v.en}؟`), "إيه أهم حاجة في الدرس ده للامتحان؟"],
  tutor: { rules: TUTOR_RULES, context: buildLessonContext(lesson), messages: MESSAGES },
};

const here = dirname(fileURLToPath(import.meta.url));
const out = outArg ?? join(here, "../../preview", `${lessonId}.html`);
const title = flags.title ?? `حصة ${lesson.titleAr ?? lesson.title}`;
// JSON جوه <script>: "<" بتتكتب < عشان "</script>" جوه نص مايقفلش الوسم
const json = JSON.stringify(data).replace(/</g, "\\u003c");
const html = readFileSync(join(here, "template.html"), "utf8")
  .replace("__TITLE__", () => title.replace(/[<&]/g, ""))
  .replace("__DATA__", () => json);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`${lessonId}: ${script.sessions.length} sessions → ${out}`);
