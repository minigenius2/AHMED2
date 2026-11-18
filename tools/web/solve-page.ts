// صفحة «حل معايا» (/solve/): بتتبني مرة واحدة وقت البناء، والكلام مع المساعد من خلال /api/solve و /api/stt و /api/tts
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EGP_PER_USD, SOLVE_CONFIG } from "../../src/config";
import { BOOKS } from "../../src/solving/books";
import { PREP_GRADE_LABELS } from "../../src/solving/types";

const here = dirname(fileURLToPath(import.meta.url));

export interface SolvePageOptions {
  endpoints?: { solve: string; stt: string; tts: string };
}

export function buildSolvePage(options: SolvePageOptions = {}): string {
  const data = {
    books: BOOKS,
    grades: PREP_GRADE_LABELS,
    endpoints: options.endpoints ?? { solve: "/api/solve", stt: "/api/stt", tts: "/api/tts" },
    limits: {
      dailyProblems: SOLVE_CONFIG.dailyProblems,
      imageMaxEdgePx: SOLVE_CONFIG.imageMaxEdgePx,
      maxImageBytes: SOLVE_CONFIG.maxImageBytes,
      maxVoiceNoteSeconds: SOLVE_CONFIG.maxVoiceNoteSeconds,
    },
    egpPerUsd: EGP_PER_USD,
  };
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return readFileSync(join(here, "solve-template.html"), "utf8").replace("__DATA__", () => json);
}
