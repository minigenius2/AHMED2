// فحص سيناريو الحصة قبل ما يوصل لطفل: كل ناتج تعلم متشرح ومتسأل عليه وليه شرح بديل.
import type { LessonRef } from "../curriculum/types";
import type { LessonScript, MediaLibrary, ScriptStep } from "./script-types";

/** كل أسماء الصور اللي الخطوة بتستخدمها */
function photosOf(step: ScriptStep): string[] {
  const illustration = "illustration" in step && step.illustration ? (step.illustration.photos ?? []).filter((p) => p !== "|") : [];
  switch (step.kind) {
    case "activity":
      return [...step.items.flatMap((i) => (i.photo ? [i.photo] : []))];
    case "probe":
      return [...(step.tool.photo ? [step.tool.photo] : []), ...step.items.flatMap((i) => (i.photo ? [i.photo] : []))];
    case "hunt":
      return step.spots.flatMap((s) => [s.photo, s.find?.photo].filter((p): p is string => !!p));
    default:
      return illustration;
  }
}

/** media: مكتبة الصور — لو اتبعتت، أي اسم صورة مش موجود فيها بيتحسب غلطة */
export function validateScript(script: LessonScript, lesson: LessonRef, media?: MediaLibrary): string[] {
  const problems: string[] = [];
  const tag = `Script ${script.lessonId}`;
  if (script.lessonId !== lesson.id) problems.push(`${tag}: lessonId does not match ${lesson.id}`);
  if (script.sessions.length !== lesson.sessions) {
    problems.push(`${tag}: has ${script.sessions.length} sessions but the lesson plans ${lesson.sessions}`);
  }

  const objectiveIds = new Set(lesson.objectives.map((o) => o.id));
  const allSteps = script.sessions.flatMap((s) => s.steps);
  const checkSteps = (steps: ScriptStep[]) => {
    for (const step of steps) {
      if ("objectiveId" in step && !objectiveIds.has(step.objectiveId)) {
        problems.push(`${tag}: step "${step.kind}" points to unknown objective ${step.objectiveId}`);
      }
      if (step.kind === "check") {
        const correct = step.choices.filter((c) => c.correct).length;
        if (correct !== 1) problems.push(`${tag}: check "${step.ask}" must have exactly one correct choice (has ${correct})`);
        if (step.choices.length < 2) problems.push(`${tag}: check "${step.ask}" needs at least 2 choices`);
      }
      if (step.kind === "explain") {
        const { answer, distractors } = step.confirm;
        if (!containsWord(step.english.text, answer)) problems.push(`${tag}: confirm answer "${answer}" is not in "${step.english.text}"`);
        const options = [answer, ...distractors].map((o) => o.toLowerCase());
        if (distractors.length < 2 || new Set(options).size !== options.length) {
          problems.push(`${tag}: confirm for "${step.title}" needs 2+ distractors that differ from the answer and each other`);
        }
      }
      if (step.kind === "activity" && step.items.some((i) => !step.groups.includes(i.group))) {
        problems.push(`${tag}: activity item assigned to an unknown group`);
      }
      if (step.kind === "activity" && step.groupsAr && step.groupsAr.length !== step.groups.length) {
        problems.push(`${tag}: groupsAr must have one Arabic name per group`);
      }
      if (step.kind === "probe" && step.items.length < 2) problems.push(`${tag}: probe "${step.title}" needs at least 2 items to compare`);
      if (step.kind === "hunt") {
        const finds = step.spots.filter((s) => s.find);
        if (step.spots.length < 3 || finds.length < 2) problems.push(`${tag}: hunt "${step.title}" needs 3+ places and 2+ creatures to find`);
        if (!finds.some((s) => s.label === step.guess.answer)) problems.push(`${tag}: hunt guess answer "${step.guess.answer}" must be a place with a creature`);
      }
      if (media) {
        for (const photo of photosOf(step)) if (!media[photo]) problems.push(`${tag}: unknown photo "${photo}" in step "${step.kind}"`);
      }
    }
  };
  checkSteps(allSteps);

  for (const objective of lesson.objectives) {
    const explained = allSteps.some((s) => s.kind === "explain" && s.objectiveId === objective.id);
    const checked = allSteps.some((s) => s.kind === "check" && s.objectiveId === objective.id);
    if (!explained) problems.push(`${tag}: objective ${objective.id} is never explained`);
    if (!checked) problems.push(`${tag}: objective ${objective.id} has no understanding check`);
    const alternative = script.alternatives[objective.id];
    if (!alternative || alternative.length === 0) {
      problems.push(`${tag}: objective ${objective.id} has no alternative explanation for remediation`);
    } else {
      checkSteps(alternative);
      if (!alternative.some((s) => s.kind === "check")) problems.push(`${tag}: alternative for ${objective.id} must end with a check`);
    }
  }

  for (const [i, session] of script.sessions.entries()) {
    if (session.steps[session.steps.length - 1]?.kind !== "summary") problems.push(`${tag}: session ${i + 1} should end with a summary`);
  }
  return problems;
}

/** الكلمة موجودة ككلمة كاملة (مش جزء من كلمة أطول) — نفس اللي الواجهة بتعمله لما تخبي الكلمة */
export function containsWord(text: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text);
}

/** كل الصور اللي السيناريو بيستخدمها (الحصص والمراجعة العلاجية) — عشان تتنسخ مع الدرس */
export function scriptPhotos(script: LessonScript): string[] {
  const steps = [...script.sessions.flatMap((s) => s.steps), ...Object.values(script.alternatives).flat()];
  return [...new Set(steps.flatMap(photosOf))];
}
