// الفويسات على الموقع: /api/stt (فويس الطالب ← كتابة) و /api/tts (رد المساعد ← صوت).
// مفتاح ElevenLabs متخزن في Vercel بس، ومابيوصلش للموبايل.
import type { IncomingMessage, ServerResponse } from "node:http";
import { SOLVE_CONFIG } from "../../src/config";
import { VoiceUnavailableError, type VoiceService } from "../../src/voice/elevenlabs";
import { BodyTooLargeError, clientIp, readBody, sendJson, WindowLimiter } from "./http";

export interface VoiceHandlerOptions {
  voice: () => VoiceService;
  pilotCode?: string;
  perHour?: number;
  now?: () => number;
  log?: (event: Record<string, unknown>) => void;
}

export type VoiceHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

export const VOICE_MESSAGES = {
  busy: "الصوت مش شغال دلوقتي 🙏 اكتبلي بدل الفويس.",
  tooLong: "الفويس طويل شوية 😅 قولّي في أقل من دقيقة.",
  empty: "ماسمعتش حاجة 🙈 قرّب الموبايل وسجّل تاني.",
};

// فويس دقيقة بصيغة webm/opus أو m4a بيبقى أقل من 1 ميجا تقريبًا
const MAX_AUDIO_BYTES = 3_000_000;
const AUDIO_TYPES = /^audio\/(webm|ogg|mp4|mpeg|mp3|wav|x-wav|aac|x-m4a|m4a)(;.*)?$/;

function lazy(options: VoiceHandlerOptions) {
  let voice: VoiceService | null = null;
  return (res: ServerResponse): VoiceService | null => {
    try {
      voice ??= options.voice();
      return voice;
    } catch (error) {
      console.error("voice is not configured:", error instanceof Error ? error.message : error);
      sendJson(res, 503, { error: "not_configured", message: VOICE_MESSAGES.busy });
      return null;
    }
  };
}

function failed(res: ServerResponse, error: unknown): void {
  if (!(error instanceof VoiceUnavailableError)) console.error("voice failed:", error);
  sendJson(res, 503, { error: "unavailable", message: VOICE_MESSAGES.busy });
}

/** الصفحة بتبعت الفويس نفسه في الـ body، وكود التجربة في x-pilot-code */
export function createSttHandler(options: VoiceHandlerOptions): VoiceHandler {
  const hourly = new WindowLimiter(options.perHour ?? 120, 3_600_000, options.now);
  const getVoice = lazy(options);
  const log = options.log ?? ((event) => console.log(JSON.stringify(event)));

  return async (req, res) => {
    if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
    if (options.pilotCode && req.headers["x-pilot-code"] !== options.pilotCode) return sendJson(res, 401, { error: "pilot_code" });
    const type = String(req.headers["content-type"] ?? "");
    if (!AUDIO_TYPES.test(type)) return sendJson(res, 415, { error: "audio_type", message: VOICE_MESSAGES.busy });
    let audio: Buffer;
    try {
      audio = await readBody(req, MAX_AUDIO_BYTES);
    } catch (error) {
      if (error instanceof BodyTooLargeError) return sendJson(res, 413, { error: "too_large", message: VOICE_MESSAGES.tooLong });
      return sendJson(res, 400, { error: "bad_request" });
    }
    if (audio.length < 1000) return sendJson(res, 400, { error: "empty", message: VOICE_MESSAGES.empty });
    if (!hourly.take(clientIp(req))) return sendJson(res, 429, { error: "rate_limited", message: VOICE_MESSAGES.busy });
    const voice = getVoice(res);
    if (!voice) return;
    try {
      const text = await voice.transcribe(new Uint8Array(audio), type);
      log({ event: "voice_stt", bytes: audio.length });
      if (!text) return sendJson(res, 200, { text: "", message: VOICE_MESSAGES.empty });
      return sendJson(res, 200, { text: text.slice(0, SOLVE_CONFIG.maxMessageChars) });
    } catch (error) {
      return failed(res, error);
    }
  };
}

/** الصفحة بتبعت { code, text } وبترجعلها mp3 */
export function createTtsHandler(options: VoiceHandlerOptions): VoiceHandler {
  const hourly = new WindowLimiter(options.perHour ?? 200, 3_600_000, options.now);
  const getVoice = lazy(options);
  const log = options.log ?? ((event) => console.log(JSON.stringify(event)));

  return async (req, res) => {
    if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
    let body: Record<string, unknown>;
    try {
      body = JSON.parse((await readBody(req, 20_000)).toString("utf8")) as Record<string, unknown>;
    } catch {
      return sendJson(res, 400, { error: "bad_request" });
    }
    if (options.pilotCode && body.code !== options.pilotCode) return sendJson(res, 401, { error: "pilot_code" });
    const text = String(body.text ?? "").trim().slice(0, SOLVE_CONFIG.maxSpeechChars);
    if (!text) return sendJson(res, 400, { error: "empty" });
    if (!hourly.take(clientIp(req))) return sendJson(res, 429, { error: "rate_limited", message: VOICE_MESSAGES.busy });
    const voice = getVoice(res);
    if (!voice) return;
    try {
      const speech = await voice.speak(text);
      log({ event: "voice_tts", characters: speech.characters });
      res.writeHead(200, { "content-type": speech.contentType, "cache-control": "no-store", "content-length": String(speech.audio.byteLength) });
      res.end(Buffer.from(speech.audio));
    } catch (error) {
      return failed(res, error);
    }
  };
}
