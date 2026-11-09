// الدالة اللي Vercel بيشغّلها على /api/stt: فويس الطالب ← كتابة.
// الإعدادات: ELEVENLABS_API_KEY (لازم)، و PILOT_CODE (اختياري)
import { elevenLabsVoice } from "../../src/voice/elevenlabs";
import { createSttHandler } from "./voice-handler";

export default createSttHandler({
  voice: () => {
    if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not set in Vercel → Settings → Environment Variables");
    return elevenLabsVoice({ apiKey: process.env.ELEVENLABS_API_KEY });
  },
  pilotCode: process.env.PILOT_CODE || undefined,
});
