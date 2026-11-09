// الدالة اللي Vercel بيشغّلها على /api/solve (بتتجمّع في ملف واحد وقت البناء).
// الإعدادات من Vercel → Settings → Environment Variables:
//   ANTHROPIC_API_KEY   (لازم)    مفتاح الـ API
//   PILOT_CODE          (اختياري) كود التجربة اللي بتديه للطلاب
//   PLAN_MODEL          (اختياري) موديل قراءة المسألة وخطة الحل (الافتراضي claude-opus-5-5)
//   SOLVE_TUTOR_MODEL   (اختياري) موديل الكلام مع الطالب (الافتراضي claude-opus-5-5، والأرخص claude-haiku-5-5)
//   SOLVE_SECRET        (اختياري) سر تشفير خطة الحل. لو مش موجود بيتعمل من ANTHROPIC_API_KEY
//   SOLVE_LIBRARY_FILE  (اختياري، على جهازك بس) ملف JSON تتحفظ فيه المسائل الجديدة
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { demoLibraryEntries } from "../../src/content/prep-math/demo-library";
import { anthropicPlanner, anthropicSolveTutor } from "../../src/solving/anthropic-solver";
import { ProblemLibrary, type LibraryEntry } from "../../src/solving/library";
import { SolveWithMe } from "../../src/solving/session";
import { createSolveHandler } from "./solve-handler";

function loadLibrary(): ProblemLibrary {
  const file = process.env.SOLVE_LIBRARY_FILE;
  let saved: LibraryEntry[] = [];
  if (file && existsSync(file)) {
    try {
      saved = JSON.parse(readFileSync(file, "utf8")) as LibraryEntry[];
    } catch (error) {
      console.error("could not read SOLVE_LIBRARY_FILE:", error instanceof Error ? error.message : error);
    }
  }
  // على Vercel المسائل الجديدة بتفضل في الذاكرة لحد ما السيرفر يرتاح. الحفظ الدائم: قاعدة بيانات (الخطوة الجاية)
  return new ProblemLibrary([...demoLibraryEntries(), ...saved], (entries) => {
    if (!file) return;
    try {
      writeFileSync(file, JSON.stringify(entries.filter((e) => e.source !== "seed"), null, 2));
    } catch (error) {
      console.error("could not write SOLVE_LIBRARY_FILE:", error instanceof Error ? error.message : error);
    }
  });
}

const library = loadLibrary();

export default createSolveHandler({
  solver: () => {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set in Vercel → Settings → Environment Variables");
    return new SolveWithMe({
      planner: anthropicPlanner({ planModel: process.env.PLAN_MODEL || undefined }),
      tutor: anthropicSolveTutor({ tutorModel: process.env.SOLVE_TUTOR_MODEL || undefined }),
      library,
    });
  },
  secret: () => {
    const secret = process.env.SOLVE_SECRET || process.env.ANTHROPIC_API_KEY;
    if (!secret) throw new Error("SOLVE_SECRET or ANTHROPIC_API_KEY is not set");
    return secret;
  },
  pilotCode: process.env.PILOT_CODE || undefined,
});
