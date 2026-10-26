// "اسأل المعلم" على الموقع: الصفحة بتبعت السؤال هنا، والسيرفر بيسأل Claude بمفتاح الـ API
// اللي متخزن في إعدادات Vercel (ANTHROPIC_API_KEY) — المفتاح عمره ما بيوصل لموبايل الطفل.
import type { IncomingMessage, ServerResponse } from "node:http";
import { findLesson, type LessonRef } from "../../src/curriculum/types";
import { buildLessonContext, MESSAGES, TUTOR_RULES, TutorUnavailableError, type TutorModel, type TutorTurn } from "../../src/teaching/ask-teacher";
import { scienceG4Term1 } from "../../src/content/science-g4-term1/curriculum";

export interface AskHandlerOptions {
  /** بيتنده مرة واحدة أول ما ييجي سؤال (عشان لو المفتاح ناقص، الصفحة تقول "مشغول" بدل ما السيرفر يقع) */
  tutor: () => TutorModel;
  /** كود التجربة: لو متحدد، أي سؤال لازم يبعته — عشان محدش من برّه يصرف من رصيد الـ API */
  pilotCode?: string;
  /** أقصى عدد أسئلة من نفس الجهاز في الساعة (فوق الحد اليومي اللي في الصفحة) */
  perHour?: number;
  now?: () => number;
}

export type AskHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

const MAX_QUESTION = 300;
const MAX_BODY = 20_000;

function send(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) reject(new Error("too large"));
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createAskHandler(options: AskHandlerOptions): AskHandler {
  const perHour = options.perHour ?? 30;
  const now = options.now ?? Date.now;
  const recent = new Map<string, number[]>();
  let tutor: TutorModel | null = null;

  return async (req, res) => {
    if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" });
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(await readBody(req)) as Record<string, unknown>;
    } catch {
      return send(res, 400, { error: "bad_request" });
    }
    if (options.pilotCode && body.code !== options.pilotCode) return send(res, 401, { error: "pilot_code" });

    const question = String(body.question ?? "").trim().slice(0, MAX_QUESTION);
    if (!question) return send(res, 400, { error: "empty", answer: MESSAGES.empty });
    let lesson: LessonRef;
    try {
      lesson = findLesson(scienceG4Term1, String(body.lessonId ?? ""));
    } catch {
      return send(res, 400, { error: "unknown_lesson" });
    }

    // حد بسيط لكل جهاز. الذاكرة دي بتتمسح لما السيرفر يرتاح، وده كفاية لتجربة مع كام طالب.
    const forwarded = req.headers["x-forwarded-for"];
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
    const hourAgo = now() - 3_600_000;
    const hits = (recent.get(ip) ?? []).filter((t) => t > hourAgo);
    if (hits.length >= perHour) return send(res, 429, { error: "rate_limited", answer: MESSAGES.busy });
    recent.set(ip, [...hits, now()]);

    const history: TutorTurn[] = (Array.isArray(body.history) ? body.history : [])
      .slice(-4)
      .map((t: { question?: unknown; answer?: unknown }) => ({ question: String(t?.question ?? "").slice(0, MAX_QUESTION), answer: String(t?.answer ?? "").slice(0, 1500) }))
      .filter((t) => t.question && t.answer);
    const where = String(body.where ?? "").slice(0, 240);

    try {
      tutor ??= options.tutor();
    } catch (error) {
      console.error("ask-the-teacher is not configured:", error instanceof Error ? error.message : error);
      return send(res, 503, { error: "not_configured", answer: MESSAGES.busy });
    }
    try {
      const reply = await tutor({
        rules: TUTOR_RULES,
        lessonContext: buildLessonContext(lesson),
        history,
        question: where ? `[${where}]\n\n${question}` : question,
      });
      const answer = reply.refused || !reply.text.trim() ? MESSAGES.refused : reply.text.trim();
      return send(res, 200, { answer });
    } catch (error) {
      if (!(error instanceof TutorUnavailableError)) console.error("ask-the-teacher failed:", error);
      return send(res, 503, { error: "unavailable", answer: MESSAGES.busy });
    }
  };
}
