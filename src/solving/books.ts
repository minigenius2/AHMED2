// كتب رياضيات إعدادي: بيانات مش كود. الطالب بيختار كتبه مرة واحدة أول ما يسجّل.
// كل طبعة ليها id لوحدها، لأن أرقام الصفحات بتتغيّر من سنة للتانية.
// الكتب الخارجية بتتضاف هنا بعد الاتفاق مع الناشر (حقوق النشر: docs/08-solve-with-me.md).
import { PREP_GRADE_LABELS, type Book, type PrepGrade, type SchoolType, type SchoolTerm } from "./types";

const EDITION = 2026;
const GRADES: PrepGrade[] = ["prep1", "prep2", "prep3"];
const TERMS: SchoolTerm[] = [1, 2];

function ministryBooks(): Book[] {
  const books: Book[] = [];
  for (const grade of GRADES) {
    for (const term of TERMS) {
      const termAr = term === 1 ? "الترم الأول" : "الترم التاني";
      books.push({
        id: `moe-math-${grade}-t${term}-ar-${EDITION}`,
        title: `كتاب الوزارة — الرياضيات — ${PREP_GRADE_LABELS[grade]} — ${termAr}`,
        kind: "ministry",
        subject: "math",
        grade,
        term,
        schoolType: "arabic",
        edition: EDITION,
      });
      books.push({
        id: `moe-math-${grade}-t${term}-en-${EDITION}`,
        title: `كتاب الوزارة — Mathematics — ${PREP_GRADE_LABELS[grade]} — ${termAr}`,
        kind: "ministry",
        subject: "math",
        grade,
        term,
        schoolType: "languages",
        edition: EDITION,
      });
    }
  }
  return books;
}

/** كتاب تجريبي فيه كام مسألة من تأليفنا، عشان نجرّب «صفحة كام وسؤال كام» قبل ما مكتبة الكتب الحقيقية تتجهّز */
export const DEMO_BOOK_ID = `demo-math-prep1-${EDITION}`;

export const BOOKS: Book[] = [
  ...ministryBooks(),
  {
    id: DEMO_BOOK_ID,
    title: "الكتاب التجريبي (مسائل للتجربة)",
    kind: "demo",
    subject: "math",
    grade: "prep1",
    term: 1,
    schoolType: "arabic",
    edition: EDITION,
  },
];

export function findBook(id: string, books: Book[] = BOOKS): Book | undefined {
  return books.find((b) => b.id === id);
}

/** الكتب اللي تنفع للطالب ده (صفّه وترمه ونوع مدرسته)، والكتاب التجريبي دايمًا */
export function booksFor(grade: PrepGrade, term: SchoolTerm, schoolType: SchoolType, books: Book[] = BOOKS): Book[] {
  return books.filter((b) => b.kind === "demo" || (b.grade === grade && b.term === term && b.schoolType === schoolType));
}
