// منهج Science — الصف الرابع الابتدائي (لغات) — الفصل الدراسي الأول 2026/2027.
// المرجع: كتاب المعاصر Science 4 Primary — First Term 2027 (334 صفحة، 8 فصول، 26 درس).
// كل فصل في ملف لوحده جوه chapters/.
import type { Curriculum } from "../../curriculum/types";
import { chapter1 } from "./chapters/ch1";
import { chapter2 } from "./chapters/ch2";
import { chapter3 } from "./chapters/ch3";
import { chapter4 } from "./chapters/ch4";
import { chapter5 } from "./chapters/ch5";
import { chapter6 } from "./chapters/ch6";
import { chapter7 } from "./chapters/ch7";
import { chapter8 } from "./chapters/ch8";

export const scienceG4Term1: Curriculum = {
  id: "science-g4-term1-2026",
  subject: "Science",
  grade: "Primary 4",
  term: "First Term 2026/2027",
  title: "Science — Primary 4 — First Term",
  language: "en",
  source: "El-Moasser Science 4 Primary, First Term 2027 — مرجع للمادة العلمية؛ النصوص والأسئلة متعاد صياغتها",
  units: [chapter1, chapter2, chapter3, chapter4, chapter5, chapter6, chapter7, chapter8],
};
