// سيناريوهات الحصص التفاعلية. الدرس اللي لسه مالوش سيناريو بيتعرض بالطريقة القديمة (أهم المعلومات + القاموس).
import type { LessonScript } from "../../../teaching/script-types";
import { ch1l1Script } from "./ch1-l1";

export const scienceG4Term1Scripts: Record<string, LessonScript> = {
  [ch1l1Script.lessonId]: ch1l1Script,
};
