import { withPlaceholders } from "../../questions/placeholder-bank";
import { term1Calendar2026 } from "./calendar";
import { scienceG4Term1 } from "./curriculum";
import { chapter1Questions } from "./questions-ch1";

export { scienceG4Term1, term1Calendar2026, chapter1Questions };

/** بنك الأسئلة الحقيقي فقط (اللي يظهر لطالب حقيقي). */
export const scienceG4Term1Bank = [...chapter1Questions];

/** البنك + أسئلة تجريبية للفصول اللي لسه ما وصلتش — للمحاكاة والتجربة بس. */
export const scienceG4Term1DemoBank = withPlaceholders(scienceG4Term1, scienceG4Term1Bank);
