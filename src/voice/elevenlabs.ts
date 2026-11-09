// الفويسات في «حل معايا» على ElevenLabs: فويس الطالب بيتحول لكتابة (Scribe)، ورد المساعد بيتقري بصوت مصري.
// الصوت نفسه اللي اخترناه لأستاذ نبيه (src/content/science-g4-term1/voice/config.json).
// الأسعار والقرار (v3 أحسن نطق، Flash أرخص بالنص): docs/08-solve-with-me.md
import voiceConfig from "../content/science-g4-term1/voice/config.json";

export class VoiceUnavailableError extends Error {}

export interface ElevenLabsOptions {
  apiKey: string;
  fetch?: typeof fetch;
  voiceId?: string;
  /** eleven_v3 (الافتراضي: أحسن نطق للعامية) أو موديل أرخص زي Flash */
  ttsModel?: string;
  sttModel?: string;
  /** لغة الفويس (ISO-639-1). الطلاب بيتكلموا عامية مصرية */
  language?: string;
  outputFormat?: string;
  baseUrl?: string;
}

export interface SpeechResult {
  audio: Uint8Array;
  contentType: string;
  /** عدد الحروف اللي اتحاسبنا عليها */
  characters: number;
}

export interface VoiceService {
  transcribe(audio: Uint8Array, mimeType: string): Promise<string>;
  speak(text: string): Promise<SpeechResult>;
}

/** رقم، أو متغير حرف واحد (س، x)، أو رقم ومتغير (3س)، أو قوس مقفول */
const MATH_OPERAND = /^[\p{N}.,]+$|[\p{N})²³]$|^\p{L}$|\p{N}\p{L}$/u;

/** الرموز الرياضية بتتقري كلام: «3س + 5 = 20» ← «3س زائد 5 يساوي 20» */
export function speakableMath(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}️?/gu, " ")
    .replace(/\^\s*2\b|²/g, " تربيع ")
    .replace(/\^\s*3\b|³/g, " تكعيب ")
    .replace(/\^\s*(\d+)/g, " أس $1 ")
    .replace(/√/g, " جذر ")
    .replace(/≠/g, " لا يساوي ")
    .replace(/≤/g, " أصغر من أو يساوي ")
    .replace(/≥/g, " أكبر من أو يساوي ")
    .replace(/</g, " أصغر من ")
    .replace(/>/g, " أكبر من ")
    .replace(/=/g, " يساوي ")
    .replace(/\+/g, " زائد ")
    .replace(/[×*]/g, " في ")
    .replace(/[÷/]/g, " على ")
    // «ناقص» بعد رقم أو متغير أو قوس (3س - 5)، و«سالب» في أول العدد (احسب -7)
    .replace(/([^\s−–-]*)(\s*)[−–-]\s*(?=[\p{N}\p{L}(])/gu, (_m, prev: string, space: string) => `${prev}${space} ${MATH_OPERAND.test(prev) ? "ناقص" : "سالب"} `)
    .replace(/\s+/g, " ")
    .trim();
}

function asBlob(audio: Uint8Array, mimeType: string): Blob {
  const copy = new Uint8Array(audio.byteLength);
  copy.set(audio);
  return new Blob([copy], { type: mimeType });
}

async function check(response: Response, what: string): Promise<void> {
  if (response.ok) return;
  const detail = (await response.text().catch(() => "")).slice(0, 300);
  if (response.status === 429 || response.status >= 500) throw new VoiceUnavailableError(`${what}: ${response.status} ${detail}`);
  throw new Error(`${what} failed: ${response.status} ${detail}`);
}

export function elevenLabsVoice(options: ElevenLabsOptions): VoiceService {
  const doFetch = options.fetch ?? fetch;
  const base = options.baseUrl ?? "https://api.elevenlabs.io";
  const voiceId = options.voiceId ?? voiceConfig.voiceId;
  const ttsModel = options.ttsModel ?? voiceConfig.model;
  const sttModel = options.sttModel ?? "scribe_v2";
  const language = options.language ?? "ar";
  const outputFormat = options.outputFormat ?? "mp3_44100_64";
  // علامات النطق ([strong Egyptian accent]) بتشتغل مع eleven_v3 بس
  const prefix = ttsModel === "eleven_v3" ? voiceConfig.prefix : "";

  return {
    async transcribe(audio, mimeType) {
      const form = new FormData();
      form.append("model_id", sttModel);
      form.append("language_code", language);
      form.append("file", asBlob(audio, mimeType || "audio/webm"), "voice-note");
      let response: Response;
      try {
        response = await doFetch(`${base}/v1/speech-to-text`, { method: "POST", headers: { "xi-api-key": options.apiKey }, body: form });
      } catch (error) {
        throw new VoiceUnavailableError(`speech-to-text: ${error instanceof Error ? error.message : error}`);
      }
      await check(response, "speech-to-text");
      const body = (await response.json()) as { text?: unknown };
      return typeof body.text === "string" ? body.text.trim() : "";
    },

    async speak(text) {
      const spoken = prefix + speakableMath(text);
      let response: Response;
      try {
        response = await doFetch(`${base}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`, {
          method: "POST",
          headers: { "xi-api-key": options.apiKey, "content-type": "application/json", accept: "audio/mpeg" },
          body: JSON.stringify({ text: spoken, model_id: ttsModel }),
        });
      } catch (error) {
        throw new VoiceUnavailableError(`text-to-speech: ${error instanceof Error ? error.message : error}`);
      }
      await check(response, "text-to-speech");
      return { audio: new Uint8Array(await response.arrayBuffer()), contentType: response.headers.get("content-type") ?? "audio/mpeg", characters: spoken.length };
    },
  };
}
