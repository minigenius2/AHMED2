// الدالة اللي Vercel بيشغّلها على /api/tts: رد المساعد ← صوت.
// الإعدادات: ELEVENLABS_API_KEY (لازم)، و PILOT_CODE (اختياري)،
// و ELEVENLABS_TTS_MODEL (اختياري): الافتراضي eleven_v3 (أحسن نطق للعامية)، وفيه موديلات أرخص بالنص (docs/08-solve-with-me.md)
import { elevenLabsVoice } from "../../src/voice/elevenlabs";
import { createTtsHandler } from "./voice-handler";

export default createTtsHandler({
  voice: () => {
    if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not set in Vercel → Settings → Environment Variables");
    return elevenLabsVoice({ apiKey: process.env.ELEVENLABS_API_KEY, ttsModel: process.env.ELEVENLABS_TTS_MODEL || undefined });
  },
  pilotCode: process.env.PILOT_CODE || undefined,
});
