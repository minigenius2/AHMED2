// بيبني صفحة الحصة لدرس واحد (HTML + الصور + التسجيلات اللي موجودة) — بيستخدمها أمر النسخة التجريبية وبناء الموقع.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listLessons } from "../../src/curriculum/types";
import { generateQuiz } from "../../src/assessment/quiz";
import { EXAM_STYLE_LABELS_AR, type Question } from "../../src/questions/types";
import { buildLessonContext, MESSAGES, TUTOR_RULES } from "../../src/teaching/ask-teacher";
import { commonNarration, lessonNarration, PLAYER_PHRASES } from "../../src/teaching/narration";
import { scriptPhotos, validateScript } from "../../src/teaching/validate-script";
import { scienceG4Term1, scienceG4Term1Bank, scienceG4Term1Media, scienceG4Term1Scripts } from "../../src/content/science-g4-term1";


const here = dirname(fileURLToPath(import.meta.url));

export interface LessonPageOptions {
  lessonId: string;
  /** مسار ملف الصفحة؛ الصور والتسجيلات بتتنسخ جنبه في media/ و audio/ */
  out: string;
  title?: string;
  /** فولدر تسجيلات الدرس (الافتراضي recordings/<الدرس>) */
  audioDir?: string;
  /** عنوان "اسأل المعلم" على السيرفر (للموقع)؛ من غيره بيشتغل بس جوه Claude */
  tutorEndpoint?: string;
  /** صفحة كاملة لوحدها (للموقع) بدل جزء بيتحط جوه Artifact */
  standalone?: boolean;
  /** عنوان فولدر الصفحة على الموقع (/lessons/ch1-l1/) عشان الصور تتحمّل صح حتى لو الرابط من غير "/" في آخره */
  baseHref?: string;
}

export function buildLessonPage(options: LessonPageOptions) {
  const { lessonId, out } = options;
  const lessons = listLessons(scienceG4Term1);
  const index = lessons.findIndex((l) => l.id === lessonId);
  const lesson = lessons[index];
  const script = scienceG4Term1Scripts[lessonId];
  if (!lesson || !script) throw new Error(`No lesson script for ${lessonId}. Available: ${Object.keys(scienceG4Term1Scripts).join(", ")}`);
  const problems = validateScript(script, lesson, scienceG4Term1Media);
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
  // تذكرة الخروج: أسئلة الحصة n من كل اللي اتشرح في الدرس لحد آخرها
  const exit: Record<number, ReturnType<typeof recallPool>> = {};
  script.sessions.forEach((_, i) => {
    const objectives = new Set(script.sessions.slice(0, i + 1).flatMap((s) => s.steps).flatMap((s) => ("objectiveId" in s ? [s.objectiveId] : [])));
    exit[i + 1] = recallPool(scienceG4Term1Bank.filter((q) => objectives.has(q.objectiveId)), lessonId);
  });
  const covered: Record<number, ReturnType<typeof recallPool>> = {};
  script.sessions.forEach((_, i) => {
    if (i === 0) return;
    const objectives = new Set(script.sessions.slice(0, i).flatMap((s) => s.steps).flatMap((s) => ("objectiveId" in s ? [s.objectiveId] : [])));
    covered[i + 1] = recallPool(scienceG4Term1Bank.filter((q) => objectives.has(q.objectiveId)), lessonId);
  });

  // التسجيلات البشرية: recordings/<الدرس>/ و recordings/common/ (أو --audio=فولدر للدرس).
  // الجملة اللي ليها تسجيل بتشتغل بيه، واللي لسه ماتسجلتش بتتقري بصوت الموبايل.
  const recordingsRoot = join(here, "../../recordings");
  const audioDirs = [options.audioDir ?? join(recordingsRoot, lessonId), join(recordingsRoot, "common")].filter((d) => existsSync(d));
  const recorded = new Map<string, { dir: string; file: string }>();
  for (const dir of audioDirs) {
    for (const file of readdirSync(dir)) {
      const id = file.match(/^(n[0-9a-z]+)\.(mp3|m4a|ogg|wav)$/i)?.[1];
      if (id) recorded.set(id, { dir, file });
    }
  }
  const narration = [...lessonNarration(script), ...commonNarration()];
  const audio: Record<string, string> = {};
  for (const line of narration) {
    const found = recorded.get(line.id);
    if (!found) continue;
    mkdirSync(join(dirname(out), "audio"), { recursive: true });
    copyFileSync(join(found.dir, found.file), join(dirname(out), "audio", found.file));
    for (const source of line.sources) audio[source] = `audio/${found.file}`;
  }
  const recordedCount = narration.filter((l) => recorded.has(l.id)).length;

  // الصور الحقيقية اللي الدرس بيستخدمها بتتنسخ جنب الصفحة في media/، ومعاها بيانات الحقوق
  const mediaDir = join(here, "../../src/content/science-g4-term1/media");
  const media: Record<string, { src: string } & (typeof scienceG4Term1Media)[string]> = {};
  for (const key of scriptPhotos(script)) {
    const item = scienceG4Term1Media[key]!;
    mkdirSync(join(dirname(out), "media"), { recursive: true });
    copyFileSync(join(mediaDir, item.file), join(dirname(out), "media", item.file));
    media[key] = { src: `media/${item.file}`, ...item };
  }

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
    recall: { previous: previous ? recallPool(scienceG4Term1Bank.filter((q) => q.lessonId === previous.id), previous.id) : [], covered, exit },
    styleLabels: EXAM_STYLE_LABELS_AR,
    // مثال المراجعة العلاجية: جزئيتين من الدرس كأن الطفل غلط فيهم
    demoWeak: [objectiveIds[0], objectiveIds[2] ?? objectiveIds[1]].filter((id): id is string => !!id),
    suggestions: [...vocabulary.slice(0, 2).map((v) => `يعني إيه ${v.en}؟`), "إيه أهم حاجة في الدرس ده للامتحان؟"],
    tutor: { rules: TUTOR_RULES, context: buildLessonContext(lesson), messages: MESSAGES },
    phrases: PLAYER_PHRASES,
    media,
    audio,
    audioStats: { recorded: recordedCount, total: narration.length },
    tutorEndpoint: options.tutorEndpoint ?? null,
  };

  const title = options.title ?? `حصة ${lesson.titleAr ?? lesson.title}`;
  // JSON جوه <script>: "<" بتتكتب < عشان "</script>" جوه نص مايقفلش الوسم
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  const fragment = readFileSync(join(here, "template.html"), "utf8")
    .replace("__TITLE__", () => title.replace(/[<&]/g, ""))
    .replace("__DATA__", () => json);
  // الـ Artifact بيضيف هيكل الصفحة لوحده؛ الموقع محتاج صفحة كاملة
  const html = options.standalone
    ? `<!doctype html>\n<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#1f8a57">${options.baseHref ? `<base href="${options.baseHref}">` : ""}</head><body>\n${fragment}\n</body></html>\n`
    : fragment;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  return { lessonId, sessions: script.sessions.length, photos: Object.keys(media).length, recorded: recordedCount, lines: narration.length, out };
}
