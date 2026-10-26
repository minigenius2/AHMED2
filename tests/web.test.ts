import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { MESSAGES, TUTOR_RULES, TutorUnavailableError, type TutorModel, type TutorRequest } from "../src/index";
import { createAskHandler } from "../tools/web/ask-handler";

function call(handler: ReturnType<typeof createAskHandler>, body: unknown, { method = "POST", ip = "1.2.3.4" } = {}) {
  const req = Readable.from([Buffer.from(typeof body === "string" ? body : JSON.stringify(body))]) as unknown as IncomingMessage;
  Object.assign(req, { method, headers: { "x-forwarded-for": ip }, socket: {} });
  let status = 0;
  let payload = "";
  const res = {
    writeHead: (s: number) => { status = s; return res; },
    end: (b: string) => { payload = b; },
  } as unknown as ServerResponse;
  return handler(req, res).then(() => ({ status, body: JSON.parse(payload) as Record<string, string> }));
}

const ok: TutorModel = vi.fn(async () => ({ text: " الـ habitat يعني الموطن ", refused: false }));
const question = { lessonId: "ch1-l1", question: "يعني إيه habitat؟", history: [{ question: "q1", answer: "a1" }], where: "session 1" };

describe("ask-the-teacher server", () => {
  it("answers from the lesson facts with the same tutor rules as the app", async () => {
    const tutor = vi.fn(async (_: TutorRequest) => ({ text: " الـ habitat يعني الموطن ", refused: false }));
    const res = await call(createAskHandler({ tutor: () => tutor }), question);
    expect(res).toEqual({ status: 200, body: { answer: "الـ habitat يعني الموطن" } });
    const req = tutor.mock.calls[0]![0];
    expect(req.rules).toBe(TUTOR_RULES);
    expect(req.lessonContext).toContain("Habitat: the place where the living organism lives.");
    expect(req.history).toEqual([{ question: "q1", answer: "a1" }]);
    expect(req.question).toBe("[session 1]\n\nيعني إيه habitat؟");
  });

  it("asks for the pilot code when one is set", async () => {
    const handler = createAskHandler({ tutor: () => ok, pilotCode: "1234" });
    expect((await call(handler, question)).status).toBe(401);
    expect((await call(handler, { ...question, code: "1234" })).status).toBe(200);
  });

  it("rejects bad requests before calling the model", async () => {
    const tutor = vi.fn(ok);
    const handler = createAskHandler({ tutor: () => tutor });
    expect((await call(handler, { ...question, question: "   " })).body.error).toBe("empty");
    expect((await call(handler, { ...question, lessonId: "ch99" })).body.error).toBe("unknown_lesson");
    expect((await call(handler, "not json")).status).toBe(400);
    expect((await call(handler, question, { method: "GET" })).status).toBe(405);
    expect(tutor).not.toHaveBeenCalled();
  });

  it("limits each device per hour", async () => {
    let t = 0;
    const handler = createAskHandler({ tutor: () => ok, perHour: 2, now: () => t });
    expect((await call(handler, question)).status).toBe(200);
    expect((await call(handler, question)).status).toBe(200);
    expect(await call(handler, question)).toEqual({ status: 429, body: { error: "rate_limited", answer: MESSAGES.busy } });
    expect((await call(handler, question, { ip: "5.6.7.8" })).status).toBe(200);
    t = 3_600_001;
    expect((await call(handler, question)).status).toBe(200);
  });

  it("says the teacher is busy when the key is missing or the model is down, and on refusals steers back to the lesson", async () => {
    const missingKey = createAskHandler({ tutor: () => { throw new Error("ANTHROPIC_API_KEY is missing"); } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await call(missingKey, question)).toEqual({ status: 503, body: { error: "not_configured", answer: MESSAGES.busy } });
    const down = createAskHandler({ tutor: () => async () => { throw new TutorUnavailableError("overloaded"); } });
    expect((await call(down, question)).body.answer).toBe(MESSAGES.busy);
    const refusing = createAskHandler({ tutor: () => async () => ({ text: "", refused: true }) });
    expect((await call(refusing, question)).body.answer).toBe(MESSAGES.refused);
  });
});
