// منهج صغير للاختبارات: فصلين × درسين، وتقويم 6 أسابيع، واختبار تراكمي كل أسبوعين.
import {
  buildStudyPlan,
  StudentJourney,
  withPlaceholders,
  type AssistantConfig,
  type Curriculum,
  type TermCalendar,
  DEFAULT_CONFIG,
} from "../src/index";

export const tinyCurriculum: Curriculum = {
  id: "tiny",
  subject: "Science",
  grade: "Test",
  term: "T1",
  title: "Tiny",
  language: "en",
  source: "fixture",
  units: [
    {
      id: "u1",
      title: "Unit 1",
      status: "verified",
      summary: ["Point A", "Point B"],
      lessons: [
        { id: "u1-l1", title: "L1", sessions: 2, objectives: [{ id: "u1-l1-o1", text: "O1" }, { id: "u1-l1-o2", text: "O2" }] },
        { id: "u1-l2", title: "L2", sessions: 2, objectives: [{ id: "u1-l2-o1", text: "O1" }] },
      ],
    },
    {
      id: "u2",
      title: "Unit 2",
      status: "verified",
      lessons: [
        { id: "u2-l1", title: "L3", sessions: 2, objectives: [{ id: "u2-l1-o1", text: "O1" }] },
        { id: "u2-l2", title: "L4", sessions: 2, objectives: [{ id: "u2-l2-o1", text: "O1" }] },
      ],
    },
  ],
};

export const tinyCalendar: TermCalendar = {
  startDate: "2026-09-19",
  endDate: "2026-10-30",
  holidays: [],
  weekStartsOn: 6,
  studyDays: [6, 0, 1, 2, 3],
  weeklyTestDay: 4,
};

export const tinyBank = withPlaceholders(tinyCurriculum, []);
export const tinyPlan = buildStudyPlan(tinyCurriculum, tinyCalendar, { revisionWeeks: 1, periodicEveryWeeks: 2 });

export function startTiny(config: AssistantConfig = DEFAULT_CONFIG): StudentJourney {
  return StudentJourney.start(
    { id: "kid-1", name: "Test Kid", parent: { name: "Parent" } },
    tinyCurriculum,
    tinyPlan,
    tinyBank,
    "2026-09-19",
    config,
  );
}
