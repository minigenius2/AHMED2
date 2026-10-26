// فحص سيناريو الحصة قبل ما يوصل لطفل: كل ناتج تعلم متشرح الأول وبعدين متسأل عليه وليه شرح بديل،
// وكل لعبة مكتوبة صح، والمصطلحات زي الكتاب، والإنجليزي ليه ترجمة، والصور متسجلة.
import type { LessonRef } from "../curriculum/types";
import type { LessonScript, MediaLibrary, ScriptStep, Term } from "./script-types";

const termPhotos = (terms: Array<Partial<Term> | undefined>) => terms.flatMap((t) => (t?.photo ? [t.photo] : []));

/** كل أسماء الصور اللي الخطوة بتستخدمها */
function photosOf(step: ScriptStep): string[] {
  const illustration = "illustration" in step && step.illustration ? (step.illustration.photos ?? []).filter((p) => p !== "|") : [];
  switch (step.kind) {
    case "mission":
      return [...illustration, ...termPhotos(step.badges)];
    case "terms":
      return termPhotos(step.terms);
    case "explain":
      return [...illustration, ...termPhotos(step.points)];
    case "activity":
      return termPhotos(step.items);
    case "probe":
      return termPhotos([step.tool, ...step.items]);
    case "match":
      return termPhotos(step.pairs.flatMap((p) => [p.left, p.right]));
    case "sequence":
      return termPhotos(step.items);
    case "hunt":
      return step.spots.flatMap((s) => [s.photo, s.find?.photo].filter((p): p is string => !!p));
    default:
      return illustration;
  }
}

/** الخطوات اللي بتثبت إن الطفل فهم ناتج التعلم */
const CHECKING_KINDS = new Set<ScriptStep["kind"]>(["check", "build", "match", "activity", "sequence"]);
/** خطوات التطبيق: مايبدأش واحدة منهم على ناتج تعلم غير بعد ما يتشرح */
const PRACTICE_KINDS = new Set<ScriptStep["kind"]>(["check", "build", "match", "activity", "sequence", "probe", "hunt"]);

/** "non-living thing" و "non-living things" نفس الكلمة — عشان نمسك المصطلح اللي اتكتب بشكل مختلف عن الكتاب */
const singular = (word: string) => word.trim().toLowerCase().replace(/s$/, "");

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
  const needsAr = (what: string, ar: string | undefined) => {
    if (!ar?.trim()) problems.push(`${tag}: ${what} needs an Arabic translation`);
  };
  // المصطلح اللي في قاموس الكتاب بيتكتب زيه بالظبط وبنفس ترجمته
  const vocabulary = lesson.vocabulary ?? [];
  const bookTerm = (what: string, en: string, ar?: string) => {
    const same = vocabulary.find((v) => v.en.toLowerCase() === en.trim().toLowerCase());
    if (same) {
      if (ar !== undefined && ar.trim() !== same.ar) problems.push(`${tag}: ${what} "${en}" should be translated "${same.ar}" like the book`);
      return;
    }
    const near = vocabulary.find((v) => singular(v.en) === singular(en));
    if (near) problems.push(`${tag}: ${what} "${en}" should be written "${near.en}" like the book`);
  };

  /** explained: نواتج التعلم اللي اتشرحت قبل الخطوات دي (من حصص قبلها) — وبتزيد مع كل شرح */
  const checkSteps = (steps: ScriptStep[], badges: number, explained: Set<string>) => {
    for (const step of steps) {
      if ("objectiveId" in step && !objectiveIds.has(step.objectiveId)) {
        problems.push(`${tag}: step "${step.kind}" points to unknown objective ${step.objectiveId}`);
      }
      if ("badge" in step && step.badge !== undefined && (step.badge < 0 || step.badge >= badges)) {
        problems.push(`${tag}: step "${step.kind}" gives badge ${step.badge} but the session mission has ${badges} badges`);
      }
      if (step.kind === "explain") explained.add(step.objectiveId);
      if (PRACTICE_KINDS.has(step.kind) && "objectiveId" in step && !explained.has(step.objectiveId)) {
        problems.push(`${tag}: step "${step.kind}" practices ${step.objectiveId} before it is explained`);
      }
      switch (step.kind) {
        case "mission":
          if (step.badges.length < 1) problems.push(`${tag}: mission "${step.titleEn}" needs at least one badge`);
          step.badges.forEach((b) => needsAr(`badge "${b.en}"`, b.ar));
          break;
        case "terms":
          if (step.terms.length < 2) problems.push(`${tag}: terms step needs at least 2 terms`);
          step.terms.forEach((t) => { needsAr(`term "${t.en}"`, t.ar); bookTerm("term", t.en, t.ar); });
          break;
        case "explain": {
          if (step.points.length < 2 || step.points.length > 4) problems.push(`${tag}: explain "${step.titleEn}" needs 2–4 cards to reveal`);
          step.points.forEach((p) => { needsAr(`card "${p.en}"`, p.ar); bookTerm("card", p.en, p.ar); });
          needsAr(`exam sentence "${step.english.text}"`, step.english.ar);
          if (step.confirm) {
            const { answer, distractors } = step.confirm;
            if (!containsWord(step.english.text, answer)) problems.push(`${tag}: confirm answer "${answer}" is not in "${step.english.text}"`);
            const options = [answer, ...distractors].map((o) => o.toLowerCase());
            if (distractors.length < 2 || new Set(options).size !== options.length) {
              problems.push(`${tag}: confirm for "${step.titleEn}" needs 2+ distractors that differ from the answer and each other`);
            }
          }
          break;
        }
        case "check": {
          const correct = step.choices.filter((c) => c.correct).length;
          if (correct !== 1) problems.push(`${tag}: check "${step.ask}" must have exactly one correct choice (has ${correct})`);
          if (step.choices.length < 2) problems.push(`${tag}: check "${step.ask}" needs at least 2 choices`);
          for (const c of step.choices) if (c.en) bookTerm("choice", c.en);
          break;
        }
        case "activity":
          if (step.items.some((i) => !step.groups.includes(i.group))) problems.push(`${tag}: activity item assigned to an unknown group`);
          if (step.groupsAr && step.groupsAr.length !== step.groups.length) problems.push(`${tag}: groupsAr must have one Arabic name per group`);
          step.groups.forEach((g, gi) => bookTerm("group", g, step.groupsAr?.[gi]));
          step.items.forEach((i) => needsAr(`sort item "${i.en}"`, i.ar));
          break;
        case "probe":
          if (step.items.length < 2) problems.push(`${tag}: probe "${step.titleEn}" needs at least 2 items to compare`);
          step.items.forEach((i) => needsAr(`probe item "${i.en}"`, i.ar));
          needsAr(`probe tool "${step.tool.en}"`, step.tool.ar);
          break;
        case "match":
          if (step.pairs.length < 2) problems.push(`${tag}: match needs at least 2 pairs`);
          step.pairs.forEach((p) => { needsAr(`match "${p.left.en}"`, p.left.ar); needsAr(`match "${p.right.en}"`, p.right.ar); });
          break;
        case "build": {
          if (step.tiles.join(" ") !== step.sentence) problems.push(`${tag}: build tiles must join into "${step.sentence}"`);
          if ((step.distractors ?? []).some((d) => step.tiles.includes(d))) problems.push(`${tag}: build distractors must not be real tiles`);
          if (step.tiles.length < 3) problems.push(`${tag}: build "${step.sentence}" needs at least 3 tiles`);
          needsAr(`build sentence "${step.sentence}"`, step.ar);
          break;
        }
        case "sequence":
          if (step.items.length < 3) problems.push(`${tag}: sequence "${step.titleEn}" needs at least 3 stages`);
          step.items.forEach((i) => needsAr(`stage "${i.en}"`, i.ar));
          break;
        case "hunt": {
          const finds = step.spots.filter((s) => s.find);
          if (step.spots.length < 3 || finds.length < 2) problems.push(`${tag}: hunt "${step.titleEn}" needs 3+ places and 2+ creatures to find`);
          if (!finds.some((s) => s.en === step.guess.answer)) problems.push(`${tag}: hunt guess answer "${step.guess.answer}" must be a place with a creature`);
          step.spots.forEach((s) => { needsAr(`place "${s.en}"`, s.ar); if (s.find) needsAr(`creature "${s.find.en}"`, s.find.ar); });
          break;
        }
        case "summary":
          step.points.forEach((p) => needsAr(`summary point "${p.en}"`, p.ar));
          break;
        default:
          break;
      }
      if (media) {
        for (const photo of photosOf(step)) if (!media[photo]) problems.push(`${tag}: unknown photo "${photo}" in step "${step.kind}"`);
      }
    }
  };

  const explained = new Set<string>();
  for (const [i, session] of script.sessions.entries()) {
    const mission = session.steps.find((s) => s.kind === "mission");
    if (!session.titleEn?.trim()) problems.push(`${tag}: session ${i + 1} needs an English title`);
    if (session.steps[0]?.kind !== "mission") problems.push(`${tag}: session ${i + 1} should start with a mission`);
    if (session.steps[session.steps.length - 1]?.kind !== "summary") problems.push(`${tag}: session ${i + 1} should end with a summary`);
    const recallAt = session.steps.findIndex((s) => s.kind === "recall");
    const firstExplainAt = session.steps.findIndex((s) => s.kind === "explain");
    if (recallAt >= 0 && (firstExplainAt < 0 || recallAt < firstExplainAt)) problems.push(`${tag}: session ${i + 1} asks recall questions before explaining anything`);
    checkSteps(session.steps, mission?.kind === "mission" ? mission.badges.length : 0, explained);
  }

  for (const objective of lesson.objectives) {
    const explained = allSteps.some((s) => s.kind === "explain" && s.objectiveId === objective.id);
    const checked = allSteps.some((s) => CHECKING_KINDS.has(s.kind) && "objectiveId" in s && s.objectiveId === objective.id);
    if (!explained) problems.push(`${tag}: objective ${objective.id} is never explained`);
    if (!checked) problems.push(`${tag}: objective ${objective.id} has no understanding check`);
    const alternative = script.alternatives[objective.id];
    if (!alternative || alternative.length === 0) {
      problems.push(`${tag}: objective ${objective.id} has no alternative explanation for remediation`);
    } else {
      checkSteps(alternative, 0, new Set());
      if (!alternative.some((s) => s.kind === "check")) problems.push(`${tag}: alternative for ${objective.id} must end with a check`);
    }
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
