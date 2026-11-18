// مكتبة المسائل: كل مسألة ليها عنوان (الكتاب بطبعته، والصفحة، ورقم السؤال، والجزء) وبصمة من نصها، ومعاها خطة الحل.
// المسألة بتتحل مرة واحدة، والطالب اللي بعده بيلاقيها جاهزة ومراجَعة، وده اللي بيخلّي «صفحة 45 سؤال 3» تشتغل.
// في التجربة دي المكتبة في الذاكرة ومعاها ملف JSON. بعدين: قاعدة بيانات.
import { createHash } from "node:crypto";
import { compactMath } from "./normalize";
import type { ProblemPlan, ProblemRef } from "./types";

export interface LibraryEntry {
  ref?: ProblemRef;
  fingerprint: string;
  plan: ProblemPlan;
  /** مدرس راجع الحل؟ الخطط اللي اتعملت وقت الحل بتبقى false لحد ما تتراجع */
  reviewed: boolean;
  source: "seed" | "batch" | "student";
  addedAt: string;
}

/** بصمة نص المسألة: نفس المسألة بأرقام عربي أو إنجليزي أو بمسافات مختلفة ليها نفس البصمة */
export function fingerprint(problemText: string): string {
  const compact = compactMath(problemText).replace(/[.,،؛:!؟?«»"'()[\]{}]/g, "");
  return createHash("sha256").update(compact).digest("hex").slice(0, 32);
}

function samePart(a?: string, b?: string): boolean {
  return compactMath(a ?? "") === compactMath(b ?? "");
}

export type RefLookup =
  | { kind: "found"; entry: LibraryEntry }
  /** السؤال فيه أجزاء والطالب ماقالش أنهي جزء */
  | { kind: "choose_part"; parts: string[] }
  | { kind: "missing" };

export class ProblemLibrary {
  private readonly items: LibraryEntry[];

  constructor(
    entries: LibraryEntry[] = [],
    /** بيتنده بعد أي إضافة (مثلًا يكتب الملف) */
    private readonly onChange?: (entries: LibraryEntry[]) => void,
  ) {
    this.items = [...entries];
  }

  entries(): readonly LibraryEntry[] {
    return this.items;
  }

  findByRef(ref: ProblemRef): RefLookup {
    const sameQuestion = this.items.filter(
      (e) => e.ref && e.ref.bookId === ref.bookId && e.ref.page === ref.page && compactMath(e.ref.question) === compactMath(ref.question),
    );
    if (!sameQuestion.length) return { kind: "missing" };
    const exact = sameQuestion.find((e) => samePart(e.ref!.part, ref.part));
    if (exact) return { kind: "found", entry: exact };
    if (!ref.part) {
      const parts = [...new Set(sameQuestion.map((e) => e.ref!.part).filter((p): p is string => Boolean(p)))];
      if (parts.length) return { kind: "choose_part", parts };
    }
    return { kind: "missing" };
  }

  findByText(problemText: string): LibraryEntry | undefined {
    const fp = fingerprint(problemText);
    return this.items.find((e) => e.fingerprint === fp);
  }

  /** بيحفظ الخطة. لو المسألة موجودة بنفس النص ومن غير عنوان، بيضيفلها العنوان */
  add(plan: ProblemPlan, options: { ref?: ProblemRef; source: LibraryEntry["source"]; reviewed?: boolean; now?: Date }): LibraryEntry {
    const fp = fingerprint(plan.problemText);
    const sameRef = options.ref ? this.findByRef(options.ref) : undefined;
    if (sameRef?.kind === "found") return sameRef.entry;
    const sameText = this.items.find((e) => e.fingerprint === fp && (!e.ref || !options.ref));
    if (sameText) {
      if (options.ref && !sameText.ref) {
        sameText.ref = options.ref;
        this.onChange?.(this.items);
      }
      return sameText;
    }
    const entry: LibraryEntry = {
      ...(options.ref ? { ref: options.ref } : {}),
      fingerprint: fp,
      plan,
      reviewed: options.reviewed ?? false,
      source: options.source,
      addedAt: (options.now ?? new Date()).toISOString(),
    };
    this.items.push(entry);
    this.onChange?.(this.items);
    return entry;
  }
}
