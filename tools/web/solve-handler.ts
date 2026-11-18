// «حل معايا» على الموقع (/api/solve). الصفحة بتبعت: بداية مسألة (رقم الصفحة والسؤال، أو صورة)، أو رسالة جديدة.
// خطة الحل (وفيها الإجابة) بتروح للموبايل مشفّرة بس، فالسيرفر مش محتاج يحفظ الجلسة.
import type { IncomingMessage, ServerResponse } from "node:http";
import { SOLVE_CONFIG } from "../../src/config";
import { findBook } from "../../src/solving/books";
import { openProblem, sealProblem } from "../../src/solving/plan-token";
import { newProgress, TutorUnavailableError, type ImageInput, type PendingReference, type SolveWithMe } from "../../src/solving/session";
import type { PrepGrade, SolveProgress, SolveTurn, StudentContext } from "../../src/solving/types";
import { BodyTooLargeError, clientIp, readBody, sendJson, WindowLimiter } from "./http";

export interface SolveHandlerOptions {
  /** بيتنده أول ما ييجي طلب (لو المفتاح ناقص، الصفحة تقول «مشغول» بدل ما السيرفر يقع) */
  solver: () => SolveWithMe;
  /** سر تشفير خطة الحل */
  secret: () => string;
  pilotCode?: string;
  /** أقصى عدد طلبات من نفس الجهاز في الساعة */
  perHour?: number;
  /** أقصى عدد مسائل جديدة من نفس الجهاز في اليوم */
  problemsPerDay?: number;
  now?: () => number;
  /** تسجيل التكلفة الحقيقية لكل طلب (في Vercel → Logs) */
  log?: (event: Record<string, unknown>) => void;
}

export type SolveHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

export const SOLVE_HTTP_MESSAGES = {
  busy: "المساعد مشغول ثانية… جرّب تاني كمان شوية 🙏",
  dailyLimit: "خلصت مسائلك النهارده يا بطل 🌟 كمّل بكرة، ولو مسألة واقفة معاك اسأل مدرس الرياضيات.",
  expired: "الجلسة دي قدمت 🙈 ابدأ المسألة من الأول.",
  badImage: "الصورة دي مش هتنفع 🙈 صوّر تاني.",
};

const GRADES: PrepGrade[] = ["prep1", "prep2", "prep3"];
const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

function readStudent(raw: unknown): StudentContext | undefined {
  const s = (raw ?? {}) as Record<string, unknown>;
  const grade = GRADES.find((g) => g === s.grade);
  if (!grade) return undefined;
  const bookIds = (Array.isArray(s.bookIds) ? s.bookIds : []).map(String).filter((id) => findBook(id)).slice(0, 10);
  return {
    grade,
    schoolType: s.schoolType === "languages" ? "languages" : "arabic",
    term: s.term === 2 ? 2 : 1,
    bookIds,
    ...(typeof s.currentLesson === "string" && s.currentLesson ? { currentLesson: s.currentLesson.slice(0, 120) } : {}),
  };
}

function readPending(raw: unknown): PendingReference | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as Record<string, unknown>;
  const page = Number(p.page);
  return {
    ...(typeof p.bookId === "string" && findBook(p.bookId) ? { bookId: p.bookId } : {}),
    ...(Number.isInteger(page) && page > 0 && page < 10_000 ? { page } : {}),
    ...(typeof p.question === "string" && p.question ? { question: p.question.slice(0, 8) } : {}),
    ...(typeof p.part === "string" && p.part ? { part: p.part.slice(0, 3) } : {}),
  };
}

function readImage(raw: unknown): ImageInput | "bad" | undefined {
  if (!raw) return undefined;
  const i = raw as Record<string, unknown>;
  const mediaType = MEDIA_TYPES.find((t) => t === i.mediaType);
  const data = typeof i.data === "string" ? i.data.replace(/^data:[^,]*,/, "") : "";
  if (!mediaType || !data || !/^[A-Za-z0-9+/=]+$/.test(data)) return "bad";
  if ((data.length * 3) / 4 > SOLVE_CONFIG.maxImageBytes) return "bad";
  return { data, mediaType };
}

function readTurns(raw: unknown): SolveTurn[] {
  return (Array.isArray(raw) ? raw : [])
    .slice(-2 * SOLVE_CONFIG.maxStudentTurns - 2)
    .map((t: { role?: unknown; text?: unknown }) => ({ role: t?.role === "student" ? ("student" as const) : ("tutor" as const), text: String(t?.text ?? "").slice(0, 2000) }))
    .filter((t) => t.text);
}

function readProgress(raw: unknown): SolveProgress {
  const p = (raw ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return { stepIndex: n(p.stepIndex), hintLevel: n(p.hintLevel), solved: p.solved === true, costUsd: n(p.costUsd) };
}

export function createSolveHandler(options: SolveHandlerOptions): SolveHandler {
  const now = options.now ?? Date.now;
  const hourly = new WindowLimiter(options.perHour ?? 120, 3_600_000, now);
  const daily = new WindowLimiter(options.problemsPerDay ?? 3 * SOLVE_CONFIG.dailyProblems, 24 * 3_600_000, now);
  const log = options.log ?? ((event) => console.log(JSON.stringify(event)));
  let solver: SolveWithMe | null = null;

  return async (req, res) => {
    if (req.method !== "POST") return sendJson(res, 405, { error: "method_not_allowed" });
    let body: Record<string, unknown>;
    try {
      body = JSON.parse((await readBody(req, Math.ceil(SOLVE_CONFIG.maxImageBytes * 1.4) + 200_000)).toString("utf8")) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof BodyTooLargeError) return sendJson(res, 413, { error: "too_large", message: SOLVE_HTTP_MESSAGES.badImage });
      return sendJson(res, 400, { error: "bad_request" });
    }
    if (options.pilotCode && body.code !== options.pilotCode) return sendJson(res, 401, { error: "pilot_code" });
    const student = readStudent(body.student);
    if (!student) return sendJson(res, 400, { error: "bad_student" });

    const ip = clientIp(req);
    if (!hourly.take(ip)) return sendJson(res, 429, { error: "rate_limited", message: SOLVE_HTTP_MESSAGES.busy });

    try {
      solver ??= options.solver();
    } catch (error) {
      console.error("solve-with-me is not configured:", error instanceof Error ? error.message : error);
      return sendJson(res, 503, { error: "not_configured", message: SOLVE_HTTP_MESSAGES.busy });
    }

    try {
      if (body.action === "start") {
        const image = readImage(body.image);
        if (image === "bad") return sendJson(res, 400, { error: "bad_image", message: SOLVE_HTTP_MESSAGES.badImage });
        // المسائل الجديدة ليها حد في اليوم (قراءة الصورة وحلّها هي أغلى حاجة)
        if (daily.remaining(ip) <= 0) return sendJson(res, 429, { error: "daily_limit", message: SOLVE_HTTP_MESSAGES.dailyLimit });
        const result = await solver.start({
          student,
          text: typeof body.text === "string" ? body.text : "",
          ...(image ? { image } : {}),
          ...(readPending(body.pending) ? { pending: readPending(body.pending)! } : {}),
        });
        log({ event: "solve_start", kind: result.kind, need: result.kind === "ask" ? result.need : undefined, fromLibrary: result.kind === "ready" ? result.fromLibrary : undefined, photo: Boolean(image), costUsd: result.costUsd });
        if (result.kind === "ask") {
          return sendJson(res, 200, { status: "ask", need: result.need, message: result.message, pending: result.pending ?? null, options: result.options ?? [] });
        }
        daily.take(ip);
        const turns: SolveTurn[] = [{ role: "tutor", text: result.opening }];
        return sendJson(res, 200, {
          status: "ready",
          token: sealProblem({ plan: result.plan, ...(result.ref ? { ref: result.ref } : {}), startedAt: now() }, options.secret()),
          problemText: result.plan.problemText,
          fromLibrary: result.fromLibrary,
          reply: result.opening,
          turns,
          progress: newProgress(result.costUsd),
          steps: result.plan.steps.length,
        });
      }

      if (body.action === "turn") {
        const problem = openProblem(String(body.token ?? ""), options.secret(), now());
        if (!problem) return sendJson(res, 400, { error: "expired", message: SOLVE_HTTP_MESSAGES.expired });
        const progress = readProgress(body.progress);
        const result = await solver.turn(student, problem.plan, readTurns(body.turns), progress, String(body.message ?? ""));
        log({ event: "solve_turn", costUsd: result.progress.costUsd - progress.costUsd, totalUsd: result.progress.costUsd, solved: result.progress.solved, guarded: result.guarded });
        return sendJson(res, 200, {
          status: result.wrongProblem ? "wrong_problem" : "ok",
          reply: result.reply,
          turns: result.turns,
          progress: result.progress,
          solved: result.progress.solved,
        });
      }
      return sendJson(res, 400, { error: "bad_action" });
    } catch (error) {
      if (!(error instanceof TutorUnavailableError)) console.error("solve-with-me failed:", error);
      return sendJson(res, 503, { error: "unavailable", message: SOLVE_HTTP_MESSAGES.busy });
    }
  };
}
