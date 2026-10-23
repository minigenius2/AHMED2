// شكل المنهج: مادة ← فصل دراسي ← فصول (Chapters) ← دروس ← نواتج تعلم.
// المنهج "بيانات" مش "كود": لما الكتاب يوصل بنملأ الملفات من غير ما نغير المحرك.

export interface LearningObjective {
  id: string;
  /** ناتج التعلم بلغة الكتاب */
  text: string;
}

export interface VocabularyItem {
  en: string;
  ar: string;
}

/**
 * محتوى الشرح — لسه هنحدد شكله لما نتكلم في "إزاي المساعد هيشرح".
 * سايبين المكان جاهز: نص، صورة، فيديو، نشاط، تجربة، أو جلسة مع المعلم الذكي.
 */
export interface ContentBlock {
  kind: "text" | "image" | "video" | "activity" | "experiment" | "ai_tutor";
  title?: string;
  body?: string;
  url?: string;
}

export interface Lesson {
  id: string;
  title: string;
  titleAr?: string;
  objectives: LearningObjective[];
  /** عدد "الحلقات التعليمية" المقترحة للدرس — المخطِّط بيوزع على أساسه */
  sessions: number;
  /**
   * رقم أسبوع الدراسة في المدرسة (حسب توزيع الوزارة / كتاب التقييمات).
   * لو موجود، المخطِّط بيمشي عليه عشان الطالب يفضل ماشي مع المدرسة.
   */
  schoolWeek?: number;
  bookPages?: { from: number; to: number };
  /** أهم المعلومات اللي لازم الطالب يطلع بيها من الدرس (أساس الشرح والتلخيص) */
  keyFacts?: string[];
  /** القاموس اللي في أسفل صفحات الكتاب — مهم جدًا لطالب لغات */
  vocabulary?: VocabularyItem[];
  content?: ContentBlock[];
}

export interface Unit {
  id: string;
  title: string;
  titleAr?: string;
  /** verified = متراجع على الكتاب، outline = هيكل مبدئي لحد ما باقي الكتاب يوصل */
  status: "verified" | "outline";
  lessons: Lesson[];
  /** نقاط التلخيص اللي بتظهر في مرحلة المراجعة النهائية */
  summary?: string[];
}

export interface Curriculum {
  id: string;
  subject: string;
  grade: string;
  term: string;
  title: string;
  /** لغة الكتاب والامتحان (مدارس اللغات = en) */
  language: "en" | "ar";
  source: string;
  units: Unit[];
}

export interface LessonRef extends Lesson {
  unitId: string;
  unitTitle: string;
}

export function listLessons(curriculum: Curriculum): LessonRef[] {
  return curriculum.units.flatMap((unit) =>
    unit.lessons.map((lesson) => ({ ...lesson, unitId: unit.id, unitTitle: unit.title })),
  );
}

export function findLesson(curriculum: Curriculum, lessonId: string): LessonRef {
  const lesson = listLessons(curriculum).find((l) => l.id === lessonId);
  if (!lesson) throw new Error(`Unknown lesson: ${lessonId}`);
  return lesson;
}

/** يتأكد إن المعرّفات مش مكررة وإن كل درس ليه ناتج تعلم واحد على الأقل. */
export function validateCurriculum(curriculum: Curriculum): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const remember = (id: string) => {
    if (ids.has(id)) problems.push(`Duplicate id: ${id}`);
    ids.add(id);
  };
  for (const unit of curriculum.units) {
    remember(unit.id);
    if (unit.lessons.length === 0) problems.push(`Unit without lessons: ${unit.id}`);
    for (const lesson of unit.lessons) {
      remember(lesson.id);
      if (lesson.objectives.length === 0) problems.push(`Lesson without objectives: ${lesson.id}`);
      if (lesson.sessions < 1) problems.push(`Lesson needs at least one session: ${lesson.id}`);
      lesson.objectives.forEach((o) => remember(o.id));
    }
  }
  return problems;
}
