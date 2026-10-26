// الدالة اللي Vercel بيشغّلها على /api/ask (بتتجمّع في ملف واحد وقت البناء).
// الإعدادات من Vercel → Settings → Environment Variables:
//   ANTHROPIC_API_KEY  (لازم)    مفتاح الـ API
//   PILOT_CODE         (اختياري) كود التجربة اللي بتديه للطلاب
//   TUTOR_MODEL        (اختياري) موديل تاني بدل الافتراضي، زي claude-haiku-5-5
import { anthropicTutor } from "../../src/teaching/anthropic-tutor";
import { createAskHandler } from "./ask-handler";

export default createAskHandler({
  tutor: () => {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set in Vercel → Settings → Environment Variables");
    return anthropicTutor({ model: process.env.TUTOR_MODEL || undefined });
  },
  pilotCode: process.env.PILOT_CODE || undefined,
});
