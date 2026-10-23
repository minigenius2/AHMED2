// نقطة الدخول للمحرك — أي واجهة (موبايل، ويب، بوت واتساب) بتتعامل مع المساعد من هنا.
export * from "./config";
export * from "./utils/dates";
export * from "./curriculum/types";
export * from "./questions/types";
export { questionWriter } from "./questions/builders";
export { withPlaceholders } from "./questions/placeholder-bank";
export * from "./planner/planner";
export * from "./assessment/quiz";
export * from "./assessment/grading";
export * from "./mastery/mastery";
export * from "./gamification/gamification";
export * from "./journey/types";
export { StudentJourney } from "./journey/journey";
export * from "./reports/parent-report";
export { formatPlan } from "./reports/plan-format";
export * from "./notifications/notifier";
export * from "./simulation/simulated-student";
export * from "./content/science-g4-term1";
