// بيطلّع صفحة HTML واحدة تتجرب من الموبايل لأي درس ليه سيناريو:
//   npm run preview:lesson -- ch1-l1 [preview/ch1-l1.html] [--title="حصة الكائنات الحية"] [--audio=فولدر]
// الصفحة بتقرا السيناريو زي المحرك بالظبط (استرجاع، أسئلة فهم وإعادة شرح، ألعاب وتجارب، نصايح امتحان، خلاصة، مراجعة علاجية)،
// وفيها "اسأل المعلم" بنفس قواعد المعلم ومعلومات الدرس — بيشتغل لما الصفحة تتنشر كـ Artifact فيه قدرة sample.
// لو فيه تسجيلات في recordings/<الدرس>/ و recordings/common/ (أو --audio=فولدر)، الصفحة بتشغّلها بدل صوت الموبايل.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildLessonPage } from "./page";

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=") as [string, string]));
const [lessonId = "ch1-l1", outArg] = args.filter((a) => !a.startsWith("--"));
const out = outArg ?? join(dirname(fileURLToPath(import.meta.url)), "../../preview", `${lessonId}.html`);
const r = buildLessonPage({ lessonId, out, title: flags.title, audioDir: flags.audio });
console.log(`${r.lessonId}: ${r.sessions} sessions, ${r.photos} photos, ${r.recorded}/${r.lines} lines recorded → ${r.out}`);
