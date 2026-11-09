// بيفهم «صفحة 45 سؤال 3 ب» من الكتابة، أو من كلام الفويس بعد ما يتحول لكتابة:
// أرقام عربي وإنجليزي («ص ٤٥ س ٣»)، وكلام («صفحة خمسة وأربعين السؤال التالت»)، واسم الكتاب لو اتقال.
import { normalizeArabic } from "./normalize";
import type { Book } from "./types";

export interface ParsedReference {
  page?: number;
  question?: string;
  part?: string;
  /** الطالب قال أنهي كتاب */
  book?: Book["kind"];
}

// الكلمات مكتوبة بعد التوحيد (من غير همزات، والتاء المربوطة هاء، والألف المقصورة ياء)
const WORDS: Record<string, number> = {};
function words(n: number, ...list: string[]) {
  for (const w of list) WORDS[w] = n;
}
words(1, "واحد", "واحده", "اول", "الاول", "الاولي", "اولي");
words(2, "اتنين", "اثنين", "اثنان", "تاني", "التاني", "ثاني", "الثاني", "تانيه", "التانيه", "الثانيه");
words(3, "تلاته", "ثلاثه", "تلات", "ثلاث", "تالت", "التالت", "ثالث", "الثالث", "التالته", "الثالثه");
words(4, "اربعه", "اربع", "رابع", "الرابع", "الرابعه");
words(5, "خمسه", "خمس", "خامس", "الخامس", "الخامسه");
words(6, "سته", "ست", "سادس", "السادس", "السادسه");
words(7, "سبعه", "سبع", "سابع", "السابع", "السابعه");
words(8, "تمانيه", "ثمانيه", "تمن", "ثمان", "تامن", "التامن", "ثامن", "الثامن", "التامنه", "الثامنه");
words(9, "تسعه", "تسع", "تاسع", "التاسع", "التاسعه");
words(10, "عشره", "عشر", "عاشر", "العاشر", "العاشره");
words(11, "حداشر", "احداشر");
words(12, "اتناشر", "اطناشر");
words(13, "تلتاشر", "تلاتاشر", "تلطاشر");
words(14, "اربعتاشر", "اربعطاشر");
words(15, "خمستاشر", "خمسطاشر");
words(16, "ستاشر", "سطاشر");
words(17, "سبعتاشر", "سبعطاشر");
words(18, "تمنتاشر", "تمنطاشر");
words(19, "تسعتاشر", "تسعطاشر");
words(20, "عشرين", "عشرون");
words(30, "تلاتين", "ثلاثين", "ثلاثون");
words(40, "اربعين", "اربعون");
words(50, "خمسين", "خمسون");
words(60, "ستين", "ستون");
words(70, "سبعين", "سبعون");
words(80, "تمانين", "ثمانين", "ثمانون");
words(90, "تسعين", "تسعون");
words(100, "ميه", "مائه", "مايه", "ميت");
words(200, "ميتين", "مائتين", "مئتين");
words(300, "تلتميه", "تلاتميه", "ثلاثمائه", "ثلاثمايه");
words(400, "ربعميه", "اربعميه", "اربعمائه");
words(500, "خمسميه", "خمسمائه");

function wordValue(token: string): number | undefined {
  return WORDS[token];
}

/** «خمسة وأربعين» بقت 45، و«مية وعشرة» بقت 110 */
function numberWordsToDigits(text: string): string {
  const tokens = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const first = wordValue(tokens[i]!);
    if (first === undefined) {
      out.push(tokens[i]!);
      continue;
    }
    let sum = first;
    while (i + 1 < tokens.length) {
      const next = tokens[i + 1]!;
      const joined = next.startsWith("و") ? wordValue(next.slice(1)) : undefined;
      if (joined !== undefined) {
        sum += joined;
        i += 1;
      } else if (next === "و" && i + 2 < tokens.length && wordValue(tokens[i + 2]!) !== undefined) {
        sum += wordValue(tokens[i + 2]!)!;
        i += 2;
      } else break;
    }
    out.push(String(sum));
  }
  return out.join(" ");
}

const B = String.raw`(?:^|[\s,،(\-])`;
const PAGE = new RegExp(`${B}(?:صفحه|صفحت|الصفحه|ص|page|pg|p)\\s*\\.?\\s*(?:رقم\\s*)?(\\d{1,4})(?!\\d)(?!\\s*[=+*/])`, "u");
const QUESTION = new RegExp(
  `${B}(?:سؤال|سوال|السؤال|السوال|س|تمرين|التمرين|مساله|المساله|رقم|question|q|ex|exercise|no)\\s*\\.?\\s*(?:رقم\\s*)?(\\d{1,3})(?!\\d)(?!\\s*[=+*/])`,
  "u",
);
// الجزء: «3 ب» و«3 (ب)» و«3-b» و«3 جزء ب». الحروف «هـ» و«و» بس لو قبلهم كلمة «جزء» أو قوس، عشان «و» بتبقى «و» العطف
const PART_SAFE = /^\s*(?:-|\/|،|,)?\s*\(?\s*([ابجد]|[a-h])\s*\)?(?=$|[\s),.،؟?!])/u;
const PART_EXPLICIT = /^\s*(?:-|\/|،|,)?\s*(?:(?:جزء|الجزء|فقره|الفقره|حرف|part)\s*\(?\s*|\(\s*)([ابجدهوزح]|[a-h])\s*\)?(?=$|[\s),.،؟?!])/u;

export function parseReference(raw: string): ParsedReference {
  const text = numberWordsToDigits(normalizeArabic(raw).replace(/[«»"]/g, " "));
  const result: ParsedReference = {};

  let rest = text;
  const page = PAGE.exec(text);
  if (page) {
    result.page = Number(page[1]);
    rest = text.slice(0, page.index) + " " + text.slice(page.index + page[0].length);
  }
  const question = QUESTION.exec(rest);
  if (question) {
    result.question = question[1]!;
    const after = rest.slice(question.index + question[0].length);
    const part = PART_EXPLICIT.exec(after) ?? PART_SAFE.exec(after);
    if (part) result.part = part[1]!;
  }

  if (/الوزاره|المدرسه/.test(text)) result.book = "ministry";
  else if (/خارجي/.test(text)) result.book = "external";
  else if (/تجريبي/.test(text)) result.book = "demo";
  return result;
}

export function isCompleteReference(r: ParsedReference): r is ParsedReference & { page: number; question: string } {
  return r.page !== undefined && r.question !== undefined;
}

/** «صفحة 45 سؤال 3 ب» للعرض */
export function describeReference(r: { page: number; question: string; part?: string }): string {
  const part = r.part ? ` ${r.part === "ا" ? "أ" : r.part}` : "";
  return `صفحة ${r.page} سؤال ${r.question}${part}`;
}
