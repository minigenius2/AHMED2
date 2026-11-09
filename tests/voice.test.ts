import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { elevenLabsVoice, speakableMath, VoiceUnavailableError, type VoiceService } from "../src/voice/elevenlabs";
import { createSttHandler, createTtsHandler } from "../tools/web/voice-handler";

describe("math read aloud", () => {
  it.each([
    ["3س + 5 = 20", "3س زائد 5 يساوي 20"],
    ["−7 − 12", "سالب 7 ناقص 12"],
    ["احسب -7 + 12 يا بطل 💪", "احسب سالب 7 زائد 12 يا بطل"],
    ["3س - 5 = -2", "3س ناقص 5 يساوي سالب 2"],
    ["3/4 + 2/3", "3 على 4 زائد 2 على 3"],
    ["س² ≥ 4", "س تربيع أكبر من أو يساوي 4"],
    ["(2 - x) × 3", "(2 ناقص x) في 3"],
  ])("%s", (text, spoken) => {
    expect(speakableMath(text)).toBe(spoken);
  });
});

describe("ElevenLabs", () => {
  const ok = (body: ConstructorParameters<typeof Response>[0], type = "application/json") => new Response(body, { status: 200, headers: { "content-type": type } });

  it("speaks with the Egyptian teacher voice, with accent tags only on eleven_v3", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ok(new Uint8Array([1, 2, 3]), "audio/mpeg"));
    const v3 = await elevenLabsVoice({ apiKey: "k", fetch: fetchMock as typeof fetch }).speak("3س + 5 = 20");
    expect(v3).toEqual({ audio: new Uint8Array([1, 2, 3]), contentType: "audio/mpeg", characters: expect.any(Number) });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.elevenlabs.io/v1/text-to-speech/HB30Rk1hky9f5uvxWktR?output_format=mp3_44100_64");
    expect(init!.headers).toMatchObject({ "xi-api-key": "k" });
    expect(JSON.parse(String(init!.body))).toEqual({ text: "[strong Egyptian accent] [warmly] 3س زائد 5 يساوي 20", model_id: "eleven_v3" });

    await elevenLabsVoice({ apiKey: "k", fetch: fetchMock as typeof fetch, ttsModel: "eleven_flash_v2_5" }).speak("برافو");
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]!.body))).toEqual({ text: "برافو", model_id: "eleven_flash_v2_5" });
  });

  it("turns a voice note into text with Scribe in Arabic", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => ok(JSON.stringify({ text: " صفحة 45 سؤال 3 " })));
    expect(await elevenLabsVoice({ apiKey: "k", fetch: fetchMock as typeof fetch }).transcribe(new Uint8Array(2000), "audio/webm")).toBe("صفحة 45 سؤال 3");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    const form = init!.body as FormData;
    expect(form.get("model_id")).toBe("scribe_v2");
    expect(form.get("language_code")).toBe("ar");
    expect((form.get("file") as Blob).type).toBe("audio/webm");
  });

  it("reports busy (not a crash) when ElevenLabs is overloaded", async () => {
    const fetchMock = vi.fn(async () => new Response("slow down", { status: 429 }));
    await expect(elevenLabsVoice({ apiKey: "k", fetch: fetchMock as typeof fetch }).speak("x")).rejects.toBeInstanceOf(VoiceUnavailableError);
  });
});

describe("voice server", () => {
  function call(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>, body: Buffer, headers: Record<string, string>) {
    const req = Readable.from([body]) as unknown as IncomingMessage;
    Object.assign(req, { method: "POST", headers: { "x-forwarded-for": "1.2.3.4", ...headers }, socket: {} });
    let status = 0;
    let type = "";
    let payload: Buffer = Buffer.alloc(0);
    const res = {
      writeHead: (s: number, h: Record<string, string>) => { status = s; type = h["content-type"] ?? ""; return res; },
      end: (b: string | Buffer) => { payload = Buffer.from(b); },
    } as unknown as ServerResponse;
    return handler(req, res).then(() => ({ status, type, payload }));
  }
  const voice: VoiceService = {
    transcribe: vi.fn(async () => "صفحة 45 سؤال 3"),
    speak: vi.fn(async () => ({ audio: new Uint8Array([9, 9]), contentType: "audio/mpeg", characters: 5 })),
  };

  it("transcribes a voice note, behind the pilot code", async () => {
    const stt = createSttHandler({ voice: () => voice, pilotCode: "1234", log: () => {} });
    const audio = Buffer.alloc(5000);
    expect((await call(stt, audio, { "content-type": "audio/webm" })).status).toBe(401);
    expect((await call(stt, audio, { "content-type": "text/plain", "x-pilot-code": "1234" })).status).toBe(415);
    expect((await call(stt, Buffer.alloc(10), { "content-type": "audio/webm", "x-pilot-code": "1234" })).status).toBe(400);
    const r = await call(stt, audio, { "content-type": "audio/webm;codecs=opus", "x-pilot-code": "1234" });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.payload.toString())).toEqual({ text: "صفحة 45 سؤال 3" });
    expect(voice.transcribe).toHaveBeenCalledWith(expect.any(Uint8Array), "audio/webm;codecs=opus");
  });

  it("returns the tutor's reply as mp3", async () => {
    const tts = createTtsHandler({ voice: () => voice, log: () => {} });
    const r = await call(tts, Buffer.from(JSON.stringify({ text: "برافو!" })), { "content-type": "application/json" });
    expect(r).toEqual({ status: 200, type: "audio/mpeg", payload: Buffer.from([9, 9]) });
  });

  it("says busy when ElevenLabs is not configured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const tts = createTtsHandler({ voice: () => { throw new Error("no key"); }, log: () => {} });
    const r = await call(tts, Buffer.from(JSON.stringify({ text: "x" })), { "content-type": "application/json" });
    expect(r.status).toBe(503);
  });
});
