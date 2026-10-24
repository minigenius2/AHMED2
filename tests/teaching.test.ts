import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import {
  answerAll,
  anthropicTutor,
  AskTeacher,
  buildLearningSession,
  buildStudyPlan,
  buildWeeklyReport,
  DEFAULT_CONFIG,
  findLesson,
  MESSAGES,
  scienceG4Term1,
  scienceG4Term1Bank,
  scienceG4Term1Scripts,
  StudentJourney,
  term1Calendar2026,
  TutorUnavailableError,
  validateScript,
  type AssistantConfig,
  type TutorModel,
  type TutorRequest,
} from "../src/index";

const DAY = "2026-09-20";
const plan = buildStudyPlan(scienceG4Term1, term1Calendar2026);
const script = scienceG4Term1Scripts["ch1-l1"]!;

function start(config: AssistantConfig = DEFAULT_CONFIG) {
  return StudentJourney.start({ id: "kid-7", name: "Malak" }, scienceG4Term1, plan, scienceG4Term1Bank, "2026-09-19", config);
}

describe("lesson scripts", () => {
  it("has a valid script for every lesson that has one", () => {
    for (const s of Object.values(scienceG4Term1Scripts)) {
      expect(validateScript(s, findLesson(scienceG4Term1, s.lessonId)), s.lessonId).toEqual([]);
    }
  });

  it("serves the lesson session by session, with recall questions from the earlier session", () => {
    const j = start();
    const first = buildLearningSession(j, script, scienceG4Term1Bank);
    expect(first).toMatchObject({ kind: "lesson", session: 1, sessions: 2 });
    expect(first.steps[0]!.kind).toBe("hook");
    expect(first.steps.some((s) => s.kind === "recall")).toBe(false); // أول درس في الترم: مفيش حاجة قبله

    j.completeLearning("ch1-l1", DAY);
    const second = buildLearningSession(j, script, scienceG4Term1Bank);
    expect(second.session).toBe(2);
    const recall = second.steps.find((s) => s.kind === "recall");
    expect(recall && recall.kind === "recall" && recall.items).toHaveLength(2);
    if (recall?.kind === "recall") {
      expect(recall.items.every((i) => ["ch1-l1-o1", "ch1-l1-o2"].includes(i.objectiveId))).toBe(true);
    }
  });

  it("re-teaches only the weak objectives in a different way after two basic failures", () => {
    const j = start();
    while (j.lesson("ch1-l1").status === "learning") j.completeLearning("ch1-l1", DAY);
    const hw = j.createQuiz({ type: "homework", lessonId: "ch1-l1", remediation: false });
    j.submit(hw, answerAll(hw, () => true), DAY);
    for (let i = 0; i < 2; i++) {
      const quiz = j.createQuiz({ type: "quiz", lessonId: "ch1-l1", tier: "basic" });
      j.submit(quiz, answerAll(quiz, () => false), DAY);
    }
    const weak = j.lesson("ch1-l1").remediationObjectiveIds!;
    const session = buildLearningSession(j, script, scienceG4Term1Bank);
    expect(session.kind).toBe("remediation");
    const taught = new Set(session.steps.flatMap((s) => ("objectiveId" in s ? [s.objectiveId] : [])));
    expect([...taught].sort()).toEqual([...weak].sort());
    const alternativeTitles = weak.flatMap((o) => script.alternatives[o]!.filter((s) => s.kind === "explain").map((s) => (s.kind === "explain" ? s.title : "")));
    expect(session.steps.some((s) => s.kind === "explain" && alternativeTitles.includes(s.title))).toBe(true);
    expect(session.steps[session.steps.length - 1]!.kind).toBe("summary");
  });
});

describe("ask the teacher", () => {
  const reply = (text: string): TutorModel => vi.fn(async () => ({ text, refused: false }));

  it("answers from the lesson facts and logs the question for the parent", async () => {
    const j = start();
    const model = vi.fn(async (_req: TutorRequest) => ({ text: "الـ habitat يعني الموطن 🐜", refused: false }));
    const result = await new AskTeacher(j, model).ask("ch1-l1", "يعني ايه habitat؟", DAY);
    expect(result).toMatchObject({ answer: "الـ habitat يعني الموطن 🐜", counted: true, remaining: DEFAULT_CONFIG.askTeacher.dailyLimit - 1 });
    const request = model.mock.calls[0]![0];
    expect(request.lessonContext).toContain("Habitat: the place where the living organism lives.");
    expect(request.rules).toContain("Egyptian Arabic");
    expect(j.state.teacherQuestions).toHaveLength(1);

    const report = buildWeeklyReport(j, 1, "2026-09-25");
    expect(report.text).toContain("سأل المعلم 1 سؤال");
  });

  it("sends the same day's earlier questions on the same lesson as context", async () => {
    const j = start();
    const model = vi.fn(async (_req: TutorRequest) => ({ text: "رد", refused: false }));
    const teacher = new AskTeacher(j, model);
    await teacher.ask("ch1-l1", "سؤال 1", DAY);
    await teacher.ask("ch1-l1", "سؤال 2", DAY);
    expect(model.mock.calls[1]![0].history).toEqual([{ question: "سؤال 1", answer: "رد" }]);
  });

  it("stops at the daily limit without calling the model", async () => {
    const j = start({ ...DEFAULT_CONFIG, askTeacher: { dailyLimit: 1, maxQuestionChars: 300 } });
    const model = reply("تمام");
    const teacher = new AskTeacher(j, model);
    await teacher.ask("ch1-l1", "سؤال", DAY);
    const second = await teacher.ask("ch1-l1", "سؤال تاني", DAY);
    expect(second).toEqual({ answer: MESSAGES.limitReached, remaining: 0, counted: false });
    expect(model).toHaveBeenCalledTimes(1);
    expect((await teacher.ask("ch1-l1", "بكرة", "2026-09-21")).counted).toBe(true);
  });

  it("handles refusals, outages, empty questions and locked lessons", async () => {
    const j = start();
    expect((await new AskTeacher(j, vi.fn(async () => ({ text: "", refused: true }))).ask("ch1-l1", "؟", DAY)).answer).toBe(MESSAGES.refused);
    const busy = await new AskTeacher(j, vi.fn(async () => { throw new TutorUnavailableError("429"); })).ask("ch1-l1", "سؤال", DAY);
    expect(busy).toMatchObject({ answer: MESSAGES.busy, counted: false });
    expect((await new AskTeacher(j, reply("x")).ask("ch1-l1", "   ", DAY)).answer).toBe(MESSAGES.empty);
    await expect(new AskTeacher(j, reply("x")).ask("ch2-l1", "سؤال", DAY)).rejects.toThrow(/locked/);
  });
});

describe("Anthropic tutor", () => {
  function fakeClient(reply: { stop_reason: string; content: Array<{ type: string; text?: string }> }) {
    const create = vi.fn(async (_params: Record<string, unknown>) => reply);
    return { create, client: { beta: { messages: { create } } } as unknown as Anthropic };
  }
  const request: TutorRequest = { rules: "RULES", lessonContext: "CONTEXT", history: [{ question: "q1", answer: "a1" }], question: "q2" };

  it("caches the lesson context and asks for the server fallback on refusals", async () => {
    const { create, client } = fakeClient({ stop_reason: "end_turn", content: [{ type: "text", text: " الـ habitat يعني الموطن " }] });
    expect(await anthropicTutor({ client })(request)).toEqual({ text: "الـ habitat يعني الموطن", refused: false });
    const params = create.mock.calls[0]![0];
    expect(params).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    expect(params.system).toEqual([{ type: "text", text: "RULES" }, { type: "text", text: "CONTEXT", cache_control: { type: "ephemeral" } }]);
    expect(params.messages).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
    ]);
  });

  it("does not send the fallback to Haiku models, which reject it", async () => {
    const { create, client } = fakeClient({ stop_reason: "refusal", content: [] });
    expect(await anthropicTutor({ client, model: "claude-haiku-5-5" })(request)).toEqual({ text: "", refused: true });
    expect(create.mock.calls[0]![0]).not.toHaveProperty("fallbacks");
    expect(create.mock.calls[0]![0]).not.toHaveProperty("betas");
  });
});
