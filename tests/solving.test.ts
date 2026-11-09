import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  anthropicPlanner,
  anthropicSolveTutor,
  DEMO_BOOK_ID,
  demoLibraryEntries,
  fingerprint,
  leaksAnswer,
  newProgress,
  openProblem,
  parseReference,
  ProblemLibrary,
  sealProblem,
  SOLVE_MESSAGES,
  SOLVE_RULES,
  SolveWithMe,
  TutorUnavailableError,
  usageCostUsd,
  type PlanRequest,
  type PlanResult,
  type ProblemPlan,
  type SolveTurn,
  type StudentContext,
  type TutorTurnReply,
  type TutorTurnRequest,
} from "../src/index";
import { createSolveHandler } from "../tools/web/solve-handler";

const MINISTRY = "moe-math-prep1-t1-ar-2026";
const student = (bookIds: string[] = [DEMO_BOOK_ID]): StudentContext => ({ grade: "prep1", schoolType: "arabic", term: 1, bookIds });

const equationPlan = (): ProblemPlan => demoLibraryEntries()[0]!.plan;

const newPlan: ProblemPlan = {
  problemText: "أوجد قيمة س: 2س + 3 = 11",
  subject: "math",
  grade: "prep1",
  topic: "المعادلات",
  concepts: ["نطرح من الطرفين", "نقسم الطرفين"],
  steps: [
    { id: "s1", goal: "نشيل الـ 3", expected: "2س = 8", hints: ["h0", "h1", "h2", "h3"], commonMistakes: [] },
    { id: "s2", goal: "نخلّي س لوحدها", expected: "س = 4", hints: ["k0", "k1", "k2", "k3"], commonMistakes: [] },
  ],
  finalAnswer: "س = 4",
  check: "عوّض",
};

function setup(options: { planResult?: PlanResult; replies?: Array<Partial<TutorTurnReply>> } = {}) {
  const planner = vi.fn(async (_: PlanRequest): Promise<PlanResult> => options.planResult ?? { status: "ok", plan: newPlan, costUsd: 0.07 });
  const replies = [...(options.replies ?? [])];
  const tutor = vi.fn(async (_: TutorTurnRequest): Promise<TutorTurnReply> => ({
    reply: "تمام، كمّل",
    stepIndex: 0,
    hintLevel: 0,
    solved: false,
    wrongProblem: false,
    refused: false,
    costUsd: 0.01,
    ...(replies.shift() ?? {}),
  }));
  const library = new ProblemLibrary(demoLibraryEntries());
  return { planner, tutor, library, solver: new SolveWithMe({ planner, tutor, library }) };
}

describe("understanding «صفحة 45 سؤال 3 ب»", () => {
  it.each([
    ["صفحة 45 سؤال 3 ب", { page: 45, question: "3", part: "ب" }],
    ["ص ٤٥ س ٣", { page: 45, question: "3" }],
    ["صفحة خمسة وأربعين السؤال التالت", { page: 45, question: "3" }],
    ["في كتاب المدرسة صفحه 12 رقم 4 (أ)", { page: 12, question: "4", part: "ا", book: "ministry" }],
    ["page 45 q3b", { page: 45, question: "3", part: "b" }],
    ["سؤال 2 صفحة 30", { page: 30, question: "2" }],
    ["ص 45 تمرين 7 جزء هـ", { page: 45, question: "7", part: "ه" }],
    ["الصفحة رقم 101 المسألة الخامسة", { page: 101, question: "5" }],
    ["صفحة مية وعشرة سؤال 2 في الخارجي", { page: 110, question: "2", book: "external" }],
    ["صفحة 45 سؤال 3 و 4", { page: 45, question: "3" }],
    ["صفحة 45 سؤال 3 ومش فاهمه", { page: 45, question: "3" }],
    ["س = 5", {}],
    ["مش فاهم حاجة", {}],
  ])("%s", (text, expected) => {
    expect(parseReference(text)).toEqual(expected);
  });
});

describe("problem library", () => {
  const library = new ProblemLibrary(demoLibraryEntries());

  it("finds a problem by book, page and question, and asks which part when there are parts", () => {
    expect(library.findByRef({ bookId: DEMO_BOOK_ID, page: 1, question: "1" })).toMatchObject({ kind: "found", entry: { plan: { finalAnswer: "س = 5" } } });
    expect(library.findByRef({ bookId: DEMO_BOOK_ID, page: 2, question: "1" })).toEqual({ kind: "choose_part", parts: ["أ", "ب"] });
    expect(library.findByRef({ bookId: DEMO_BOOK_ID, page: 2, question: "1", part: "ا" })).toMatchObject({ kind: "found", entry: { plan: { finalAnswer: "5" } } });
    expect(library.findByRef({ bookId: DEMO_BOOK_ID, page: 9, question: "1" })).toEqual({ kind: "missing" });
  });

  it("never returns a problem from another edition with the same page number", () => {
    expect(library.findByRef({ bookId: DEMO_BOOK_ID.replace("2026", "2025"), page: 1, question: "1" })).toEqual({ kind: "missing" });
  });

  it("gives the same fingerprint for Arabic and Western digits and different spacing", () => {
    expect(fingerprint("أوجد قيمة س: ٣س + ٥ = ٢٠")).toBe(fingerprint("اوجد قيمه س:3س+5=20"));
    expect(fingerprint("3س + 5 = 20")).not.toBe(fingerprint("3س + 5 = 21"));
  });

  it("adds the book reference to a problem it already knows by text", () => {
    const lib = new ProblemLibrary();
    const onChange = vi.fn();
    const withChange = new ProblemLibrary([], onChange);
    lib.add(newPlan, { source: "student" });
    lib.add(newPlan, { source: "student", ref: { bookId: MINISTRY, page: 30, question: "2" } });
    expect(lib.entries()).toHaveLength(1);
    expect(lib.findByRef({ bookId: MINISTRY, page: 30, question: "2" }).kind).toBe("found");
    withChange.add(newPlan, { source: "student" });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("starting a problem", () => {
  it("gets the problem from the library by page and question, without calling the model", async () => {
    const { solver, planner } = setup();
    const r = await solver.start({ student: student(), text: "صفحة 1 سؤال 1" });
    expect(r).toMatchObject({ kind: "ready", fromLibrary: true, costUsd: 0, ref: { bookId: DEMO_BOOK_ID, page: 1, question: "1" } });
    if (r.kind !== "ready") throw new Error("not ready");
    expect(r.opening).toContain("«أوجد قيمة س: 3س + 5 = 20»");
    expect(r.opening).toContain(equationPlan().steps[0]!.hints[0]);
    expect(planner).not.toHaveBeenCalled();
  });

  it("asks which book when the student has two, with buttons that carry the reference", async () => {
    const { solver } = setup();
    const r = await solver.start({ student: student([MINISTRY, DEMO_BOOK_ID]), text: "صفحة 1 سؤال 1" });
    expect(r).toMatchObject({ kind: "ask", need: "book", message: SOLVE_MESSAGES.askBook });
    if (r.kind !== "ask") throw new Error("not ask");
    expect(r.options!.map((o) => o.pending)).toEqual([
      { page: 1, question: "1", bookId: MINISTRY },
      { page: 1, question: "1", bookId: DEMO_BOOK_ID },
    ]);
    expect(await solver.start({ student: student([MINISTRY, DEMO_BOOK_ID]), pending: r.options![1]!.pending })).toMatchObject({ kind: "ready", fromLibrary: true });
  });

  it("uses the book the student names", async () => {
    const { solver } = setup();
    const r = await solver.start({ student: student([MINISTRY, DEMO_BOOK_ID]), text: "صفحة 1 سؤال 1 في الكتاب التجريبي" });
    expect(r).toMatchObject({ kind: "ready", ref: { bookId: DEMO_BOOK_ID } });
  });

  it("asks which part, and understands a reply of just the letter", async () => {
    const { solver } = setup();
    const r = await solver.start({ student: student(), text: "صفحة 2 سؤال 1" });
    expect(r).toMatchObject({ kind: "ask", need: "part", message: "السؤال ده فيه أكتر من جزء: أ ولا ب؟" });
    if (r.kind !== "ask") throw new Error("not ask");
    const b = await solver.start({ student: student(), text: "ب", pending: r.pending });
    expect(b).toMatchObject({ kind: "ready", plan: { problemText: "احسب: −7 − 12" } });
  });

  it("asks for the page or the question number when one is missing", async () => {
    const { solver } = setup();
    const r = await solver.start({ student: student(), text: "صفحة 1" });
    expect(r).toMatchObject({ kind: "ask", need: "reference", message: SOLVE_MESSAGES.askQuestion(1), pending: { page: 1 } });
    if (r.kind !== "ask") throw new Error("not ask");
    expect(await solver.start({ student: student(), text: "سؤال 2", pending: r.pending })).toMatchObject({ kind: "ready", plan: { problemText: "أوجد ناتج: 3/4 + 2/3" } });
    expect(await solver.start({ student: student(), text: "سؤال 3" })).toMatchObject({ kind: "ask", message: SOLVE_MESSAGES.askPage("3") });
    expect(await solver.start({ student: student(), text: "مش فاهم حاجة" })).toMatchObject({ kind: "ask", need: "reference", message: SOLVE_MESSAGES.askReference });
  });

  it("asks for a photo when the problem is not in the library yet, then saves it under that page and question", async () => {
    const { solver, planner } = setup();
    const ask = await solver.start({ student: student([MINISTRY]), text: "صفحة 30 سؤال 2" });
    expect(ask).toMatchObject({ kind: "ask", need: "photo", message: SOLVE_MESSAGES.askPhoto, pending: { page: 30, question: "2", bookId: MINISTRY } });
    if (ask.kind !== "ask") throw new Error("not ask");

    const image = { data: "aGVsbG8=", mediaType: "image/jpeg" as const };
    const photo = await solver.start({ student: student([MINISTRY]), image, pending: ask.pending });
    expect(photo).toMatchObject({ kind: "ready", fromLibrary: false, costUsd: 0.07, ref: { bookId: MINISTRY, page: 30, question: "2" } });
    expect(planner.mock.calls[0]![0]).toMatchObject({ image, refLabel: "صفحة 30 سؤال 2" });

    // الطالب اللي بعده بيقول الرقم بس
    expect(await solver.start({ student: student([MINISTRY]), text: "ص 30 س 2" })).toMatchObject({ kind: "ready", fromLibrary: true, costUsd: 0 });
    expect(planner).toHaveBeenCalledTimes(1);
  });

  it("plans a problem the student typed", async () => {
    const { solver, planner } = setup();
    expect(await solver.start({ student: student(), text: "حل المعادلة 2س + 3 = 11" })).toMatchObject({ kind: "ready", fromLibrary: false });
    expect(planner.mock.calls[0]![0].problemText).toBe("حل المعادلة 2س + 3 = 11");
  });

  it("asks for another photo when the photo can't be read", async () => {
    const { solver } = setup({ planResult: { status: "unreadable", message: "صوّرها تاني", costUsd: 0.01 } });
    expect(await solver.start({ student: student(), image: { data: "aGk=", mediaType: "image/png" } })).toEqual({ kind: "ask", need: "retake", message: "صوّرها تاني", pending: {}, costUsd: 0.01 });
  });

  it("asks the student to choose their books (or send a photo) when they have none", async () => {
    const { solver } = setup();
    expect(await solver.start({ student: student([]), text: "صفحة 1 سؤال 1" })).toMatchObject({ kind: "ask", need: "photo", message: SOLVE_MESSAGES.noBooks });
  });
});

describe("solving together without giving the answer", () => {
  const plan = equationPlan();
  const opening: SolveTurn[] = [{ role: "tutor", text: "هي دي المسألة؟" }];

  it("sends the rules, the student and the secret plan to the tutor", async () => {
    const { solver, tutor } = setup({ replies: [{ reply: "صح! كمّل", stepIndex: 1 }] });
    const r = await solver.turn(student(), plan, opening, newProgress(), "3س = 15");
    expect(r).toMatchObject({ reply: "صح! كمّل", progress: { stepIndex: 1, hintLevel: 0, solved: false, costUsd: 0.01 }, guarded: false });
    expect(r.turns).toEqual([...opening, { role: "student", text: "3س = 15" }, { role: "tutor", text: "صح! كمّل" }]);
    const req = tutor.mock.calls[0]![0];
    expect(req.rules).toBe(SOLVE_RULES);
    expect(req.planContext).toContain("Final answer (SECRET — never reveal it): س = 5");
    expect(req.studentContext).toContain("أولى إعدادي");
  });

  it("rewrites a reply that gives away the answer", async () => {
    const { solver, tutor } = setup({ replies: [{ reply: "الحل: س = 5" }, { reply: "قسّم الطرفين على 3 وقولّي النتيجة" }] });
    const r = await solver.turn(student(), plan, opening, newProgress(), "قولي الإجابة");
    expect(r).toMatchObject({ reply: "قسّم الطرفين على 3 وقولّي النتيجة", guarded: true, progress: { costUsd: 0.02 } });
    expect(tutor.mock.calls[1]![0].reminder).toMatch(/revealed the final answer/);
  });

  it("falls back to the plan's hint when the rewrite still gives away the answer", async () => {
    const { solver } = setup({ replies: [{ reply: "س = 5" }, { reply: "يعني س=5", stepIndex: 1, hintLevel: 1 }] });
    const r = await solver.turn(student(), plan, opening, newProgress(), "قولي الإجابة");
    expect(r.reply).toBe(plan.steps[1]!.hints[1]);
    expect(r.guarded).toBe(true);
  });

  it("counts the problem as solved only when the student wrote the answer", async () => {
    const { solver } = setup({ replies: [{ reply: "برافو!", solved: true }, { reply: "برافو!", solved: true }] });
    expect((await solver.turn(student(), plan, opening, newProgress(), "خلصت")).progress.solved).toBe(false);
    expect((await solver.turn(student(), plan, opening, newProgress(), "س = ٥")).progress.solved).toBe(true);
  });

  it("lets the tutor repeat the answer once the student found it", () => {
    expect(leaksAnswer("برافو، س = 5 صح!", plan, [{ role: "student", text: "س=5" }])).toBe(false);
    expect(leaksAnswer("برافو، س = 5 صح!", plan, [{ role: "student", text: "3س = 15" }])).toBe(true);
    // الإجابة رقم مش موجود في المسألة: أي رد فيه الرقم ده لوحده بيتمنع
    const fraction = demoLibraryEntries()[1]!.plan;
    expect(leaksAnswer("الناتج 17/12", fraction, [])).toBe(true);
    expect(leaksAnswer("9 + 8 يبقى كام؟", fraction, [])).toBe(false);
  });

  it("handles refusals, empty messages, long chats and solved problems without calling the model when it doesn't need to", async () => {
    const { solver, tutor } = setup({ replies: [{ refused: true, reply: "" }] });
    expect((await solver.turn(student(), plan, opening, newProgress(), "؟؟")).reply).toBe(SOLVE_MESSAGES.refused);
    expect((await solver.turn(student(), plan, opening, newProgress(), "   ")).reply).toBe(SOLVE_MESSAGES.empty);
    expect((await solver.turn(student(), plan, opening, { ...newProgress(), solved: true }, "تاني")).reply).toBe(SOLVE_MESSAGES.alreadySolved);
    const long: SolveTurn[] = Array.from({ length: 30 }, () => ({ role: "student" as const, text: "x" }));
    expect((await solver.turn(student(), plan, long, newProgress(), "تاني")).reply).toBe(SOLVE_MESSAGES.turnLimit);
    expect(tutor).toHaveBeenCalledTimes(1);
  });

  it("every hint in the demo library is safe to show", () => {
    for (const { plan: p } of demoLibraryEntries()) {
      for (const step of p.steps) {
        expect(step.hints).toHaveLength(4);
        for (const hint of step.hints) expect(leaksAnswer(hint, p, [])).toBe(false);
      }
    }
  });
});

describe("Claude for solve-with-me", () => {
  function fakeClient(reply: { stop_reason: string; content: Array<{ type: string; text?: string }>; model?: string }) {
    const create = vi.fn(async (_params: Record<string, unknown>) => ({
      model: "claude-opus-5-5",
      usage: { input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      ...reply,
    }));
    return { create, client: { beta: { messages: { create } } } as unknown as Anthropic };
  }
  const planJson = {
    status: "ok",
    message: "",
    problemText: "أوجد قيمة س: 2س + 3 = 11",
    topic: "المعادلات",
    concepts: ["c"],
    steps: [{ goal: "نشيل الـ 3", expected: "2س = 8", hints: ["h0", "h1"], commonMistakes: ["m"] }],
    finalAnswer: "س = 4",
    check: "عوّض",
  };

  it("reads the photo with high effort and returns a plan with exactly 4 hints per step", async () => {
    const { create, client } = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(planJson) }] });
    const r = await anthropicPlanner({ client })({ student: student(), image: { data: "aGk=", mediaType: "image/jpeg" }, refLabel: "صفحة 30 سؤال 2" });
    expect(r).toMatchObject({ status: "ok", plan: { problemText: planJson.problemText, grade: "prep1", steps: [{ id: "s1", hints: ["h0", "h1", "h1", "h1"] }] } });
    expect(r.costUsd).toBeCloseTo((1000 * 4 + 500 * 20) / 1e6);
    const params = create.mock.calls[0]![0] as Record<string, any>;
    expect(params).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", output_config: { effort: "high", format: { type: "json_schema" } } });
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(params.messages[0].content[0]).toEqual({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "aGk=" } });
    expect(params.messages[0].content[1].text).toContain("صفحة 30 سؤال 2");
  });

  it("passes on the model's message when the photo has several problems", async () => {
    const { client } = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ ...planJson, status: "multiple", message: "أنهي سؤال؟" }) }] });
    expect(await anthropicPlanner({ client })({ student: student() })).toMatchObject({ status: "multiple", message: "أنهي سؤال؟" });
  });

  it("talks with low effort, caches the plan and the chat, and sends the reminder as a system message", async () => {
    const reply = { reply: "قسّم على 2", stepIndex: 1, hintLevel: 0, solved: false, wrongProblem: false };
    const { create, client } = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(reply) }] });
    const r = await anthropicSolveTutor({ client })({
      rules: "RULES",
      studentContext: "STUDENT",
      planContext: "PLAN",
      turns: [{ role: "tutor", text: "هي دي؟" }, { role: "student", text: "2س = 8" }],
      reminder: "REMIND",
    });
    expect(r).toMatchObject({ reply: "قسّم على 2", stepIndex: 1, refused: false });
    const params = create.mock.calls[0]![0] as Record<string, any>;
    expect(params).toMatchObject({ output_config: { effort: "low", format: { type: "json_schema" } }, cache_control: { type: "ephemeral" } });
    expect(params.system).toEqual([{ type: "text", text: "RULES" }, { type: "text", text: "STUDENT\n\nPLAN", cache_control: { type: "ephemeral" } }]);
    expect(params.messages).toEqual([
      { role: "user", content: "[The student opened this problem in the app.]" },
      { role: "assistant", content: "هي دي؟" },
      { role: "user", content: "2س = 8" },
      { role: "system", content: "REMIND" },
    ]);
  });

  it("does not send the fallback to Haiku, and treats a cut-off reply as busy", async () => {
    const { create, client } = fakeClient({ stop_reason: "max_tokens", content: [{ type: "text", text: "{" }] });
    await expect(anthropicSolveTutor({ client, tutorModel: "claude-haiku-5-5" })({ rules: "", studentContext: "", planContext: "", turns: [{ role: "student", text: "x" }] })).rejects.toBeInstanceOf(TutorUnavailableError);
    expect(create.mock.calls[0]![0]).not.toHaveProperty("fallbacks");
  });

  it("computes the real cost from the usage, including the cache", () => {
    const usage = { model: "claude-opus-5-5", input_tokens: 1_000_000, output_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 };
    expect(usageCostUsd(usage)).toBeCloseTo(4 + 20 + 5 + 0.2);
    expect(usageCostUsd({ ...usage, model: "claude-unknown" }, "claude-haiku-5-5")).toBeCloseTo(0.1 + 0.5 + 0.125 + 0.01);
  });
});

describe("the secret plan travels encrypted", () => {
  it("opens only with the same secret, untouched, and not too old", () => {
    const token = sealProblem({ plan: newPlan, startedAt: 1_000 }, "secret");
    const bytes = Buffer.from(token, "base64url").toString("utf8");
    expect(bytes).not.toContain("finalAnswer");
    expect(bytes).not.toContain("س = 4");
    expect(openProblem(token, "secret", 2_000)?.plan.finalAnswer).toBe("س = 4");
    expect(openProblem(token, "other", 2_000)).toBeUndefined();
    expect(openProblem(`${token.slice(0, -4)}AAAA`, "secret", 2_000)).toBeUndefined();
    expect(openProblem(token, "secret", 1_000 + 25 * 3_600_000)).toBeUndefined();
  });
});

describe("solve-with-me server", () => {
  function call(handler: ReturnType<typeof createSolveHandler>, body: unknown, ip = "1.2.3.4") {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
    Object.assign(req, { method: "POST", headers: { "x-forwarded-for": ip }, socket: {} });
    let status = 0;
    let payload = "";
    const res = {
      writeHead: (s: number) => { status = s; return res; },
      end: (b: string) => { payload = b; },
    } as unknown as ServerResponse;
    return handler(req, res).then(() => ({ status, raw: payload, body: JSON.parse(payload) as Record<string, any> }));
  }
  const make = (extra: Partial<Parameters<typeof createSolveHandler>[0]> = {}, replies: Array<Partial<TutorTurnReply>> = []) => {
    const { solver } = setup({ replies });
    return createSolveHandler({ solver: () => solver, secret: () => "s3cret", log: () => {}, ...extra });
  };
  const s = { grade: "prep1", schoolType: "arabic", term: 1, bookIds: [DEMO_BOOK_ID] };

  it("starts from page and question and never sends the answer to the phone", async () => {
    const handler = make({}, [{ reply: "صح!", stepIndex: 1 }]);
    const start = await call(handler, { action: "start", student: s, text: "صفحة 1 سؤال 1" });
    expect(start.status).toBe(200);
    expect(start.body).toMatchObject({ status: "ready", fromLibrary: true, problemText: "أوجد قيمة س: 3س + 5 = 20", steps: 2 });
    expect(start.raw).not.toContain("س = 5");
    expect(start.raw).not.toContain("3س = 15");

    const turn = await call(handler, { action: "turn", student: s, token: start.body.token, turns: start.body.turns, progress: start.body.progress, message: "3س = 15" });
    expect(turn.body).toMatchObject({ status: "ok", reply: "صح!", progress: { stepIndex: 1 }, solved: false });
    expect(turn.body.turns).toHaveLength(3);
  });

  it("returns the question back to the page when it needs more (which book, which part, a photo)", async () => {
    const r = await call(make(), { action: "start", student: s, text: "صفحة 2 سؤال 1" });
    expect(r.body).toMatchObject({ status: "ask", need: "part", options: [{ label: "أ" }, { label: "ب" }] });
  });

  it("asks for the pilot code, rejects bad requests, and expired sessions", async () => {
    const handler = make({ pilotCode: "1234" });
    expect((await call(handler, { action: "start", student: s, text: "صفحة 1 سؤال 1" })).status).toBe(401);
    expect((await call(handler, { action: "start", code: "1234", student: { grade: "prep9" }, text: "x" })).status).toBe(400);
    expect((await call(handler, { action: "start", code: "1234", student: s, image: { data: "not base64!", mediaType: "image/jpeg" } })).body.error).toBe("bad_image");
    expect((await call(handler, { action: "turn", code: "1234", student: s, token: "nope", message: "x" })).body.error).toBe("expired");
  });

  it("limits new problems per device per day", async () => {
    const handler = make({ problemsPerDay: 1 });
    expect((await call(handler, { action: "start", student: s, text: "صفحة 1 سؤال 1" })).body.status).toBe("ready");
    expect((await call(handler, { action: "start", student: s, text: "صفحة 1 سؤال 2" })).body.error).toBe("daily_limit");
    expect((await call(handler, { action: "start", student: s, text: "صفحة 1 سؤال 2" }, "5.6.7.8")).body.status).toBe("ready");
  });

  it("says busy when the model is unavailable or not configured", async () => {
    const unavailable = new SolveWithMe({
      planner: async () => { throw new TutorUnavailableError("overloaded"); },
      tutor: async () => { throw new TutorUnavailableError("overloaded"); },
      library: new ProblemLibrary(),
    });
    const busy = createSolveHandler({ solver: () => unavailable, secret: () => "x", log: () => {} });
    expect((await call(busy, { action: "start", student: s, text: "حل المعادلة 2س + 3 = 11" })).status).toBe(503);
    const notConfigured = createSolveHandler({ solver: () => { throw new Error("no key"); }, secret: () => "x", log: () => {} });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await call(notConfigured, { action: "start", student: s, text: "صفحة 1 سؤال 1" })).body.error).toBe("not_configured");
  });
});
