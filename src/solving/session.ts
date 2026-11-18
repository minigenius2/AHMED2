// «حل معايا»: من «صفحة 45 سؤال 3» أو صورة المسألة، لحد ما الطالب يوصل للإجابة بنفسه.
// الملف ده مش مربوط بموديل معين: قراءة المسألة والكلام مع الطالب بيتبعتوا كدوال، عشان نختبر ونغيّر الموديل بسهولة.
import { SOLVE_CONFIG, type SolveConfig } from "../config";
import { TutorUnavailableError } from "../teaching/ask-teacher";
import { BOOKS, findBook } from "./books";
import { ProblemLibrary } from "./library";
import { compactMath, normalizeArabic, numbersIn } from "./normalize";
import { describeReference, parseReference, type ParsedReference } from "./parse-reference";
import { describePlan, describeStudent, SOLVE_RULES } from "./rules";
import type { Book, ProblemPlan, ProblemRef, SolveProgress, SolveTurn, StudentContext } from "./types";

export { TutorUnavailableError };

export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp";

export interface ImageInput {
  /** base64 من غير "data:" */
  data: string;
  mediaType: ImageMediaType;
}

export interface PlanRequest {
  student: StudentContext;
  image?: ImageInput;
  /** المسألة مكتوبة (لو الطالب كتبها بنفسه) */
  problemText?: string;
  /** لو الطالب قال رقمها: «صفحة 45 سؤال 3 ب»، عشان لو الصورة فيها كذا مسألة */
  refLabel?: string;
}

export type PlanResult =
  | { status: "ok"; plan: ProblemPlan; costUsd: number }
  | { status: "unreadable" | "multiple" | "not_math" | "refused"; message: string; costUsd: number };

/** بيقرا المسألة ويحلّها في الخفا ويطلّع خطة الحل */
export type ProblemPlanner = (request: PlanRequest) => Promise<PlanResult>;

export interface TutorTurnRequest {
  rules: string;
  studentContext: string;
  planContext: string;
  turns: SolveTurn[];
  /** تنبيه للموديل لما رده الأولاني كان فيه الإجابة */
  reminder?: string;
}

export interface TutorTurnReply {
  reply: string;
  stepIndex: number;
  hintLevel: number;
  solved: boolean;
  wrongProblem: boolean;
  refused: boolean;
  costUsd: number;
}

/** المساعد وهو بيكلّم الطالب */
export type SolveTutorModel = (request: TutorTurnRequest) => Promise<TutorTurnReply>;

function displayPart(part: string): string {
  return part === "ا" ? "أ" : part;
}

export const SOLVE_MESSAGES = {
  askReference: "قولي رقم الصفحة ورقم السؤال، أو صوّر المسألة 📸",
  askQuestion: (page: number) => `تمام، صفحة ${page}. سؤال رقم كام؟`,
  askPage: (question: string) => `سؤال ${question} في صفحة كام؟`,
  askBook: "في أنهي كتاب؟",
  askPart: (parts: string[]) => `السؤال ده فيه أكتر من جزء: ${parts.map(displayPart).join(" ولا ")}؟`,
  askPhoto: "المسألة دي لسه مش عندي 📸 صوّرهالي المرة دي، وبعد كده أي حد يقول رقمها هلاقيها على طول.",
  noBooks: "لسه ماختارتش كتبك 📚 اختارها من الإعدادات، أو صوّر المسألة على طول.",
  opening: (problemText: string, firstHint: string) => `هي دي المسألة؟\n«${problemText}»\n\nلو هي، يلا نبدأ: ${firstHint}`,
  empty: "اكتبلي ردّك الأول 😊",
  refused: "خلينا نرجع للمسألة 😊 قولي إنت وصلت لحد فين؟",
  tooLong: "رسالتك طويلة شوية 😅 قولّي بس الخطوة اللي عملتها.",
  turnLimit: "اشتغلنا كتير على المسألة دي، وده شطارة منك 💪 خد استراحة صغيرة، وارجع حلّها من الأول لوحدك، أو اسأل مدرس الرياضيات في المدرسة.",
  alreadySolved: "إنت حليت المسألة خلاص 🎉 صوّرلي مسألة جديدة، أو قولي رقمها.",
  safeHint: "قرّبت جدًا! 💪 راجع آخر خطوة عملتها، وقولّي النتيجة اللي وصلتلها.",
};

/** زرار يدوس عليه الطالب بدل ما يكتب (أنهي كتاب، أنهي جزء): بيبعت المرحلة دي تاني */
export interface StartOption {
  label: string;
  pending: PendingReference;
}

/** المرحلة اللي الطالب فيها قبل ما المسألة تتحدد (بتتبعت تاني مع الرسالة الجاية) */
export interface PendingReference {
  bookId?: string;
  page?: number;
  question?: string;
  part?: string;
}

export type StartResult =
  | {
      kind: "ask";
      need: "reference" | "book" | "part" | "photo" | "retake";
      message: string;
      pending?: PendingReference;
      options?: StartOption[];
      costUsd: number;
    }
  | { kind: "ready"; plan: ProblemPlan; ref?: ProblemRef; fromLibrary: boolean; opening: string; costUsd: number };

export interface StartInput {
  student: StudentContext;
  text?: string;
  image?: ImageInput;
  pending?: PendingReference;
}

export interface TurnResult {
  reply: string;
  progress: SolveProgress;
  turns: SolveTurn[];
  wrongProblem: boolean;
  /** الرد اترفض أو اتبدّل بتلميح عشان كان فيه الإجابة */
  guarded: boolean;
}

export interface SolveDeps {
  planner: ProblemPlanner;
  tutor: SolveTutorModel;
  library: ProblemLibrary;
  books?: Book[];
  config?: SolveConfig;
}

/** لو الطالب كتب المسألة نفسها بدل رقمها */
function looksLikeProblem(text: string): boolean {
  return text.length >= 12 && /\d/.test(text) && /[=+\-×÷*/^²√<>]|حل|اوجد|أوجد|احسب|اثبت|أثبت|بسط|بسّط/.test(text);
}

function mergeReference(pending: PendingReference | undefined, parsed: ParsedReference): PendingReference {
  return {
    ...(pending ?? {}),
    ...(parsed.page !== undefined ? { page: parsed.page } : {}),
    ...(parsed.question !== undefined ? { question: parsed.question } : {}),
    ...(parsed.part !== undefined ? { part: parsed.part } : {}),
  };
}

function completeRef(p: PendingReference | undefined): ProblemRef | undefined {
  if (!p?.bookId || p.page === undefined || p.question === undefined) return undefined;
  return { bookId: p.bookId, page: p.page, question: p.question, ...(p.part ? { part: p.part } : {}) };
}

function clamp(n: number, min: number, max: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : min;
}

/** أرقام الإجابة اللي مش موجودة في نص المسألة (لو المساعد قالها يبقى قال الإجابة) */
function answerOnlyNumbers(plan: ProblemPlan): string[] {
  const inProblem = new Set(numbersIn(plan.problemText));
  return [...new Set(numbersIn(plan.finalAnswer))].filter((n) => !inProblem.has(n));
}

function saidAnswer(text: string, plan: ProblemPlan): boolean {
  const answer = compactMath(plan.finalAnswer);
  if (answer.length >= 2 && compactMath(text).includes(answer)) return true;
  const numbers = answerOnlyNumbers(plan);
  if (!numbers.length) return false;
  const inText = new Set(numbersIn(text));
  return numbers.every((n) => inText.has(n));
}

/** الطالب كتب الإجابة النهائية بنفسه؟ لو الإجابة مش أرقام (برهان مثلًا) بنصدّق المساعد */
export function studentReachedAnswer(plan: ProblemPlan, turns: SolveTurn[]): boolean {
  const studentText = turns.filter((t) => t.role === "student").map((t) => t.text).join("\n");
  const hasCheckableAnswer = compactMath(plan.finalAnswer).length >= 2 || answerOnlyNumbers(plan).length > 0;
  return !hasCheckableAnswer || saidAnswer(studentText, plan);
}

/** رد المساعد فيه الإجابة النهائية والطالب لسه ماقالهاش؟ */
export function leaksAnswer(reply: string, plan: ProblemPlan, turns: SolveTurn[]): boolean {
  const studentText = turns.filter((t) => t.role === "student").map((t) => t.text).join("\n");
  if (saidAnswer(studentText, plan)) return false;
  return saidAnswer(reply, plan);
}

export class SolveWithMe {
  private readonly books: Book[];
  private readonly config: SolveConfig;

  constructor(private readonly deps: SolveDeps) {
    this.books = deps.books ?? BOOKS;
    this.config = deps.config ?? SOLVE_CONFIG;
  }

  /** كتب الرياضيات اللي الطالب اختارها */
  studentBooks(student: StudentContext): Book[] {
    return student.bookIds.map((id) => findBook(id, this.books)).filter((b): b is Book => Boolean(b && b.subject === "math"));
  }

  private opening(plan: ProblemPlan): string {
    return SOLVE_MESSAGES.opening(plan.problemText, plan.steps[0]?.hints[0] ?? "إيه المطلوب في السؤال؟");
  }

  /** بداية مسألة: برقم الصفحة والسؤال، أو بالصورة، أو مكتوبة */
  async start(input: StartInput): Promise<StartResult> {
    const text = (input.text ?? "").trim().slice(0, this.config.maxMessageChars);
    const parsed = parseReference(text);
    const pending = mergeReference(input.pending, parsed);
    // بعد «السؤال ده فيه أكتر من جزء»، الطالب ممكن يقول الحرف بس: «ب»
    const letter = /^\(?\s*([ابجدهوزح]|[a-h])\s*\)?$/u.exec(normalizeArabic(text));
    if (input.pending?.question !== undefined && parsed.part === undefined && letter) pending.part = letter[1]!;

    if (input.image) return this.startFromPhoto(input.student, input.image, pending);

    const hasReference = pending.page !== undefined || pending.question !== undefined;
    if (!hasReference && looksLikeProblem(text)) return this.plan(input.student, { problemText: text }, undefined);
    if (!hasReference) return { kind: "ask", need: "reference", message: SOLVE_MESSAGES.askReference, costUsd: 0 };
    if (pending.page === undefined) return { kind: "ask", need: "reference", message: SOLVE_MESSAGES.askPage(pending.question!), pending, costUsd: 0 };
    if (pending.question === undefined) return { kind: "ask", need: "reference", message: SOLVE_MESSAGES.askQuestion(pending.page), pending, costUsd: 0 };

    // أنهي كتاب؟ الكتاب معروف من الأول لو الطالب عنده كتاب واحد بس في المادة
    if (!pending.bookId || !findBook(pending.bookId, this.books)) {
      let books = this.studentBooks(input.student);
      if (parsed.book) {
        const matching = books.filter((b) => b.kind === parsed.book);
        if (matching.length) books = matching;
      }
      if (!books.length) return { kind: "ask", need: "photo", message: SOLVE_MESSAGES.noBooks, pending, costUsd: 0 };
      if (books.length > 1) {
        return {
          kind: "ask",
          need: "book",
          message: SOLVE_MESSAGES.askBook,
          pending,
          options: books.map((b) => ({ label: b.title, pending: { ...pending, bookId: b.id } })),
          costUsd: 0,
        };
      }
      pending.bookId = books[0]!.id;
    }

    const ref = completeRef(pending)!;
    const found = this.deps.library.findByRef(ref);
    if (found.kind === "found") {
      return { kind: "ready", plan: found.entry.plan, ref: found.entry.ref, fromLibrary: true, opening: this.opening(found.entry.plan), costUsd: 0 };
    }
    if (found.kind === "choose_part") {
      return {
        kind: "ask",
        need: "part",
        message: SOLVE_MESSAGES.askPart(found.parts),
        pending,
        options: found.parts.map((part) => ({ label: displayPart(part), pending: { ...pending, part } })),
        costUsd: 0,
      };
    }
    return { kind: "ask", need: "photo", message: SOLVE_MESSAGES.askPhoto, pending, costUsd: 0 };
  }

  private async startFromPhoto(student: StudentContext, image: ImageInput, pending: PendingReference): Promise<StartResult> {
    // لو الطالب قال رقمها ومعاه كتاب واحد بس، المسألة بتتسجل بالعنوان ده
    if (!pending.bookId && pending.page !== undefined && pending.question !== undefined) {
      const books = this.studentBooks(student);
      if (books.length === 1) pending.bookId = books[0]!.id;
    }
    const ref = completeRef(pending);
    if (ref) {
      const found = this.deps.library.findByRef(ref);
      if (found.kind === "found") {
        return { kind: "ready", plan: found.entry.plan, ref: found.entry.ref, fromLibrary: true, opening: this.opening(found.entry.plan), costUsd: 0 };
      }
    }
    const refLabel = pending.page !== undefined && pending.question !== undefined ? describeReference({ page: pending.page, question: pending.question, part: pending.part }) : pending.question ? `سؤال ${pending.question}` : undefined;
    return this.plan(student, { image, ...(refLabel ? { refLabel } : {}) }, ref, pending);
  }

  private async plan(student: StudentContext, request: Omit<PlanRequest, "student">, ref: ProblemRef | undefined, pending?: PendingReference): Promise<StartResult> {
    const result = await this.deps.planner({ student, ...request });
    if (result.status !== "ok") {
      const need = result.status === "multiple" ? "reference" : "retake";
      return { kind: "ask", need, message: result.message || SOLVE_MESSAGES.askReference, ...(pending ? { pending } : {}), costUsd: result.costUsd };
    }
    // لو نفس المسألة اتحلّت قبل كده واتراجعت، بناخد الخطة المراجَعة
    const known = this.deps.library.findByText(result.plan.problemText);
    if (known?.reviewed) {
      if (ref && !known.ref) this.deps.library.add(known.plan, { ref, source: known.source, reviewed: true });
      return { kind: "ready", plan: known.plan, ref: known.ref ?? ref, fromLibrary: true, opening: this.opening(known.plan), costUsd: result.costUsd };
    }
    const entry = this.deps.library.add(result.plan, { ...(ref ? { ref } : {}), source: "student" });
    return { kind: "ready", plan: entry.plan, ref: entry.ref ?? ref, fromLibrary: false, opening: this.opening(entry.plan), costUsd: result.costUsd };
  }

  /** رسالة من الطالب، ورد المساعد */
  async turn(student: StudentContext, plan: ProblemPlan, turnsSoFar: SolveTurn[], progress: SolveProgress, rawMessage: string): Promise<TurnResult> {
    const message = rawMessage.trim();
    const same = (reply: string): TurnResult => ({ reply, progress, turns: turnsSoFar, wrongProblem: false, guarded: false });
    if (!message) return same(SOLVE_MESSAGES.empty);
    if (message.length > this.config.maxMessageChars) return same(SOLVE_MESSAGES.tooLong);
    if (progress.solved) return same(SOLVE_MESSAGES.alreadySolved);
    if (turnsSoFar.filter((t) => t.role === "student").length >= this.config.maxStudentTurns) return same(SOLVE_MESSAGES.turnLimit);

    const turns: SolveTurn[] = [...turnsSoFar, { role: "student", text: message }];
    const request: TutorTurnRequest = {
      rules: SOLVE_RULES,
      studentContext: describeStudent(student),
      planContext: describePlan(plan),
      turns,
    };

    let cost = 0;
    let reply = await this.deps.tutor(request);
    cost += reply.costUsd;
    let guarded = false;
    if (!reply.refused && !reply.solved && leaksAnswer(reply.reply, plan, turns)) {
      guarded = true;
      reply = await this.deps.tutor({
        ...request,
        reminder: "Your draft reply revealed the final answer. Rewrite it as a hint at the current hint level, without the final answer or this step's result.",
      });
      cost += reply.costUsd;
      if (!reply.refused && leaksAnswer(reply.reply, plan, turns)) {
        const step = plan.steps[clamp(reply.stepIndex, 0, plan.steps.length - 1)];
        const hint = step?.hints[clamp(reply.hintLevel, 0, 3)];
        reply = { ...reply, reply: hint && !leaksAnswer(hint, plan, turns) ? hint : SOLVE_MESSAGES.safeHint, solved: false };
      }
    }

    const text = reply.refused || !reply.reply.trim() ? SOLVE_MESSAGES.refused : reply.reply.trim();
    const solved = !reply.refused && reply.solved && studentReachedAnswer(plan, turns);
    const next: SolveProgress = {
      stepIndex: clamp(reply.stepIndex, 0, Math.max(0, plan.steps.length - 1)),
      hintLevel: clamp(reply.hintLevel, 0, 3),
      solved,
      costUsd: progress.costUsd + cost,
    };
    return { reply: text, progress: next, turns: [...turns, { role: "tutor", text }], wrongProblem: reply.wrongProblem, guarded };
  }
}

export function newProgress(costUsd = 0): SolveProgress {
  return { stepIndex: 0, hintLevel: 0, solved: false, costUsd };
}

