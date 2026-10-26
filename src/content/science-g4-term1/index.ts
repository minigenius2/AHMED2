import { withPlaceholders } from "../../questions/placeholder-bank";
import { term1Calendar2026 } from "./calendar";
import { scienceG4Term1 } from "./curriculum";
import { chapter1Questions } from "./questions-ch1";
import { chapter2Questions } from "./questions-ch2";
import { chapter3Questions } from "./questions-ch3";
import { chapter4Questions } from "./questions-ch4";
import { chapter5Questions } from "./questions-ch5";
import { chapter6Questions } from "./questions-ch6";
import { chapter7Questions } from "./questions-ch7";
import { chapter8Questions } from "./questions-ch8";
import { scienceG4Term1Media } from "./media";
import { scienceG4Term1Scripts } from "./scripts";

export { scienceG4Term1, term1Calendar2026, scienceG4Term1Scripts, scienceG4Term1Media };

/** بنك الأسئلة الحقيقي فقط (اللي يظهر لطالب حقيقي). */
export const scienceG4Term1Bank = [
  ...chapter1Questions,
  ...chapter2Questions,
  ...chapter3Questions,
  ...chapter4Questions,
  ...chapter5Questions,
  ...chapter6Questions,
  ...chapter7Questions,
  ...chapter8Questions,
];

/** البنك + أسئلة تجريبية لأي فصل لسه ما اتكتبش — للمحاكاة والتجربة بس (دلوقتي كل الفصول مكتوبة). */
export const scienceG4Term1DemoBank = withPlaceholders(scienceG4Term1, scienceG4Term1Bank);
