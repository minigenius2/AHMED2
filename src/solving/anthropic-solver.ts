// «حل معايا» على Claude: قراءة المسألة وخطة الحل (مجهود تفكير عالي)، والكلام مع الطالب (مجهود قليل).
// القواعد عليها cache، وخطة المسألة عليها cache، والمحادثة نفسها عليها cache، فكل رسالة بتبقى أرخص من اللي قبلها.
import Anthropic from "@anthropic-ai/sdk";
import { supportsServerFallback } from "../teaching/anthropic-tutor";
import { TutorUnavailableError } from "../teaching/ask-teacher";
import { describeStudent, PLAN_RULES } from "./rules";
import type { PlanRequest, PlanResult, ProblemPlanner, SolveTutorModel, TutorTurnReply, TutorTurnRequest } from "./session";
import type { PlanStep, ProblemPlan } from "./types";
import { usageCostUsd } from "./usage-cost";

/**
 * الموديل الافتراضي للاتنين. تغييره قرار تكلفة وجودة (docs/08-solve-with-me.md):
 * بيتغيّر من PLAN_MODEL و SOLVE_TUTOR_MODEL بعد اختبار الجودة على مسائل حقيقية.
 */
export const DEFAULT_SOLVE_MODEL = "claude-opus-5-5";

const STRINGS = { type: "array", items: { type: "string" } } as const;

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ok", "unreadable", "multiple", "not_math"] },
    message: { type: "string" },
    problemText: { type: "string" },
    topic: { type: "string" },
    concepts: STRINGS,
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: { goal: { type: "string" }, expected: { type: "string" }, hints: STRINGS, commonMistakes: STRINGS },
        required: ["goal", "expected", "hints", "commonMistakes"],
        additionalProperties: false,
      },
    },
    finalAnswer: { type: "string" },
    check: { type: "string" },
  },
  required: ["status", "message", "problemText", "topic", "concepts", "steps", "finalAnswer", "check"],
  additionalProperties: false,
};

const TURN_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    stepIndex: { type: "integer" },
    hintLevel: { type: "integer" },
    solved: { type: "boolean" },
    wrongProblem: { type: "boolean" },
  },
  required: ["reply", "stepIndex", "hintLevel", "solved", "wrongProblem"],
  additionalProperties: false,
};

const UNREADABLE = "مش قادر أقرا المسألة كويس 🙈 صوّرها تاني من قريب وفي نور كويس، والسؤال كله باين في الصورة.";

export interface AnthropicSolverOptions {
  client?: Anthropic;
  /** موديل قراءة المسألة وخطة الحل */
  planModel?: string;
  /** موديل الكلام مع الطالب */
  tutorModel?: string;
}

function fallbackParams(model: string) {
  return supportsServerFallback(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {};
}

function unavailable(error: unknown): never {
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.InternalServerError) {
    throw new TutorUnavailableError(error.message);
  }
  throw error;
}

function jsonText(response: Anthropic.Beta.BetaMessage): unknown {
  if (response.stop_reason === "max_tokens") throw new TutorUnavailableError("the reply was cut off (max_tokens)");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return JSON.parse(text);
  } catch {
    throw new TutorUnavailableError("the reply was not valid JSON");
  }
}

function cost(response: Anthropic.Beta.BetaMessage, requested: string): number {
  return usageCostUsd({ model: response.model, ...response.usage }, requested);
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const strs = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** 4 تلميحات بالظبط لكل خطوة (لو الموديل رجّع أقل، آخر تلميح بيتكرر) */
function fourHints(hints: string[], goal: string): string[] {
  const list = hints.length ? hints.slice(0, 4) : [goal];
  while (list.length < 4) list.push(list[list.length - 1]!);
  return list;
}

export function toPlan(raw: Record<string, unknown>, request: PlanRequest): ProblemPlan | undefined {
  const steps: PlanStep[] = (Array.isArray(raw.steps) ? raw.steps : []).map((s: Record<string, unknown>, i: number) => ({
    id: `s${i + 1}`,
    goal: str(s?.goal),
    expected: str(s?.expected),
    hints: fourHints(strs(s?.hints), str(s?.goal)),
    commonMistakes: strs(s?.commonMistakes),
  }));
  const plan: ProblemPlan = {
    problemText: str(raw.problemText),
    subject: "math",
    grade: request.student.grade,
    topic: str(raw.topic),
    concepts: strs(raw.concepts),
    steps: steps.filter((s) => s.goal && s.expected),
    finalAnswer: str(raw.finalAnswer),
    check: str(raw.check),
  };
  return plan.problemText && plan.steps.length && plan.finalAnswer ? plan : undefined;
}

export function anthropicPlanner(options: AnthropicSolverOptions = {}): ProblemPlanner {
  const client = options.client ?? new Anthropic();
  const model = options.planModel ?? DEFAULT_SOLVE_MODEL;

  return async (request) => {
    const note = [
      describeStudent(request.student),
      request.refLabel ? `The student says the problem is: ${request.refLabel}.` : "",
      request.problemText ? `The student typed the problem:\n${request.problemText}` : "The problem is in the photo.",
      "Prepare the plan.",
    ]
      .filter(Boolean)
      .join("\n\n");
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (request.image) content.push({ type: "image", source: { type: "base64", media_type: request.image.mediaType, data: request.image.data } });
    content.push({ type: "text", text: note });

    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        // الحل لازم يبقى صح: مجهود تفكير عالي هنا بس، مرة واحدة لكل مسألة
        output_config: { effort: "high", format: { type: "json_schema", schema: PLAN_SCHEMA } },
        ...fallbackParams(model),
        system: [{ type: "text", text: PLAN_RULES, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content }],
      });
    } catch (error) {
      unavailable(error);
    }
    const costUsd = cost(response, model);
    if (response.stop_reason === "refusal") return { status: "refused", message: "", costUsd };
    const raw = jsonText(response) as Record<string, unknown>;
    const status = str(raw.status);
    if (status === "unreadable" || status === "multiple" || status === "not_math") {
      return { status, message: str(raw.message) || UNREADABLE, costUsd };
    }
    const plan = toPlan(raw, request);
    return plan ? { status: "ok", plan, costUsd } : { status: "unreadable", message: UNREADABLE, costUsd };
  };
}

export function toMessages(request: TutorTurnRequest): Anthropic.Beta.BetaMessageParam[] {
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  // أول رسالة لازم تبقى من الطالب، وأول رد للمساعد (عرض المسألة) بيتكتب من غير موديل
  if (request.turns[0]?.role === "tutor") messages.push({ role: "user", content: "[The student opened this problem in the app.]" });
  for (const turn of request.turns) messages.push({ role: turn.role === "student" ? "user" : "assistant", content: turn.text });
  if (request.reminder) messages.push({ role: "system", content: request.reminder });
  return messages;
}

export function anthropicSolveTutor(options: AnthropicSolverOptions = {}): SolveTutorModel {
  const client = options.client ?? new Anthropic();
  const model = options.tutorModel ?? DEFAULT_SOLVE_MODEL;

  return async (request): Promise<TutorTurnReply> => {
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        model,
        max_tokens: 4000,
        // الرد قصير: مجهود قليل يكفي ويقلل التكلفة والوقت
        output_config: { effort: "low", format: { type: "json_schema", schema: TURN_SCHEMA } },
        ...fallbackParams(model),
        // الـ cache التلقائي بيحفظ المحادثة لحد آخر رسالة، فالرسالة الجاية بتقرا اللي فات من الـ cache
        cache_control: { type: "ephemeral" },
        system: [
          { type: "text", text: request.rules },
          { type: "text", text: `${request.studentContext}\n\n${request.planContext}`, cache_control: { type: "ephemeral" } },
        ],
        messages: toMessages(request),
      });
    } catch (error) {
      unavailable(error);
    }
    const costUsd = cost(response, model);
    if (response.stop_reason === "refusal") return { reply: "", stepIndex: 0, hintLevel: 0, solved: false, wrongProblem: false, refused: true, costUsd };
    const raw = jsonText(response) as Record<string, unknown>;
    return {
      reply: str(raw.reply),
      stepIndex: Number(raw.stepIndex ?? 0),
      hintLevel: Number(raw.hintLevel ?? 0),
      solved: raw.solved === true,
      wrongProblem: raw.wrongProblem === true,
      refused: false,
      costUsd,
    };
  };
}
