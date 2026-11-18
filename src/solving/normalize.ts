// توحيد الكتابة: الأرقام العربي والإنجليزي، والهمزات، والمسافات. بيستخدمه فهم «صفحة كام وسؤال كام»،
// وبصمة المسألة في المكتبة، والفحص اللي بيمنع المساعد يقول الإجابة.

const DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4", "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4", "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

/** الأرقام العربي (٤٥) بقت 45، والفاصلة العشرية العربي (٫) بقت نقطة */
export function asciiDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => DIGITS[d] ?? d).replace(/٫/g, ".").replace(/٬/g, ",");
}

/** شكل واحد للحروف: من غير تشكيل ولا تطويل، والهمزات ألف، والياء والتاء المربوطة بشكل واحد */
export function normalizeArabic(text: string): string {
  return asciiDigits(text)
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();
}

/** المعادلة من غير مسافات وبرموز موحّدة: «س = ٥» و«س=5» نفس الحاجة */
export function compactMath(text: string): string {
  return normalizeArabic(text)
    .replace(/[×✕]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, "");
}

/** كل الأرقام اللي في الكلام (صحيحة وعشرية وكسور زي 3/4) */
export function numbersIn(text: string): string[] {
  const found = asciiDigits(text).match(/\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?/g) ?? [];
  return found.map((n) => n.replace(/\.0+$/, ""));
}

/** الرقم ده موجود في الكلام كرقم لوحده (5 مش جزء من 15 أو 50) */
export function containsNumber(text: string, number: string): boolean {
  return numbersIn(text).includes(number);
}
