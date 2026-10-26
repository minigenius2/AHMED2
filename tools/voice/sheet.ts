// بيطلّع نص التسجيل لمؤدي الصوت: كل جملة في الدرس، واسم الملف اللي تتسجل بيه، ومكانها في الحصة.
//   npm run voice:sheet -- ch1-l1            ← recording/ch1-l1.md + recording/ch1-l1.csv
//   npm run voice:sheet -- --all             ← كل الدروس اللي ليها سيناريو + الجمل الثابتة
//   npm run voice:sheet -- ch1-l1 --audio=recordings/ch1-l1   ← نفس الكلام + مين اتسجل ومين لسه
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findLesson } from "../../src/curriculum/types";
import { commonNarration, lessonNarration, type NarrationLine } from "../../src/teaching/narration";
import { scienceG4Term1, scienceG4Term1Scripts } from "../../src/content/science-g4-term1";

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=") as [string, string | undefined]));
const ids = args.filter((a) => !a.startsWith("--"));
const targets = "all" in flags ? [...Object.keys(scienceG4Term1Scripts), "common"] : ids.length ? ids : ["ch1-l1"];
const outDir = join(dirname(fileURLToPath(import.meta.url)), "../../recording");

/** سرعة كلام هادية لطفل: حوالي 12 حرف في الثانية */
const minutes = (lines: NarrationLine[]) => Math.max(1, Math.round(lines.reduce((n, l) => n + l.text.length, 0) / 12 / 60));
const LANG_MARK = { ar: "", mixed: "🔀", en: "🇬🇧" } as const;

function recordedIds(dir: string | undefined): Set<string> | null {
  if (!dir) return null;
  return new Set(readdirSync(dir).map((f) => f.replace(/\.(wav|mp3|m4a|ogg)$/i, "")));
}

function writeSheet(name: string, title: string, lines: NarrationLine[]) {
  const done = recordedIds(flags.audio);
  const count = (lang: NarrationLine["lang"]) => lines.filter((l) => l.lang === lang).length;
  const status = done ? ` · متسجل ${lines.filter((l) => done.has(l.id)).length} من ${lines.length}` : "";
  const md = [
    `# نص التسجيل — ${title}`,
    "",
    `- **${lines.length} جملة** (عربي ${count("ar")} · عربي فيه كلمات إنجليزي ${count("mixed")} · إنجليزي ${count("en")})، حوالي **${minutes(lines)} دقيقة** صوت${status}.`,
    "- كل جملة في ملف لوحدها، واسم الملف هو اللي في عمود **الملف** + `.wav` (مثلًا `" + (lines[0]?.id ?? "n…") + ".wav`).",
    "- 🔀 عربي فيه كلمات إنجليزي: الكلمات الإنجليزي تتنطق بنطق إنجليزي واضح. 🇬🇧 الجملة كلها إنجليزي: تتقري بنطق إنجليزي واضح وأبطأ شوية، زي مدرس بيملي.",
    "- إرشادات التسجيل كاملة: [docs/05-voice-recording.md](../docs/05-voice-recording.md)",
    "",
    `| # | الملف |${done ? " ✓ |" : ""} | النص | مكانها في الحصة |`,
    `|---|---|${done ? "---|" : ""}---|---|---|`,
    ...lines.map((l, i) => `| ${i + 1} | \`${l.id}\` |${done ? ` ${done.has(l.id) ? "✅" : "⬜"} |` : ""} ${LANG_MARK[l.lang]} | ${l.text} | ${l.where} |`),
    "",
  ].join("\n");
  // CSV للمونتير أو لمتابعة التسجيل في Excel (BOM عشان العربي يتفتح صح)
  const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = "﻿" + ["#,file,language,text,where", ...lines.map((l, i) => [String(i + 1), `${l.id}.wav`, l.lang, l.text, l.where].map(csvCell).join(","))].join("\n") + "\n";
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${name}.md`), md);
  writeFileSync(join(outDir, `${name}.csv`), csv);
  console.log(`${name}: ${lines.length} lines, ~${minutes(lines)} min → recording/${name}.md`);
}

for (const target of targets) {
  if (target === "common") {
    writeSheet("common", "الجمل الثابتة (بتتقال في كل الدروس، بتتسجل مرة واحدة)", commonNarration());
    continue;
  }
  const script = scienceG4Term1Scripts[target];
  if (!script) throw new Error(`No lesson script for ${target}. Available: ${Object.keys(scienceG4Term1Scripts).join(", ")}`);
  const lesson = findLesson(scienceG4Term1, target);
  writeSheet(target, `${lesson.title} (${lesson.titleAr ?? ""})`, lessonNarration(script));
}
