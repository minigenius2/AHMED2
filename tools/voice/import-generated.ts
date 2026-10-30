// بيحط أصوات ElevenLabs المولّدة في مكانها: كل ملف <اسم الجملة>.mp3 في الفولدر بيروح لفولدر درسه
// (أو common للجمل الثابتة) في src/content/science-g4-term1/voice/، ومضغوط لصوت كلام (mono 48kbps).
//   npm run voice:import -- <فولدر الملفات>
// الصوت والموديل والنص اللي اتبعت لكل جملة في voice/config.json و voice/<الدرس>.tts.json.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { commonNarration, lessonNarration } from "../../src/teaching/narration";
import { scienceG4Term1Scripts } from "../../src/content/science-g4-term1";

const from = process.argv[2];
if (!from) throw new Error("usage: npm run voice:import -- <folder of <id>.mp3 files>");
const voiceDir = join(dirname(fileURLToPath(import.meta.url)), "../../src/content/science-g4-term1/voice");

const groupOf = new Map<string, string>();
for (const [lessonId, script] of Object.entries(scienceG4Term1Scripts)) {
  for (const line of lessonNarration(script)) groupOf.set(line.id, lessonId);
}
for (const line of commonNarration()) groupOf.set(line.id, "common");

const unknown: string[] = [];
const counts: Record<string, number> = {};
for (const file of readdirSync(from)) {
  const id = file.match(/^(n[0-9a-z]+)\.mp3$/)?.[1];
  if (!id) continue; // التسجيل التاني (<id>.b.mp3) وأي ملف تاني مالوش دعوة
  const group = groupOf.get(id);
  if (!group) { unknown.push(file); continue; }
  mkdirSync(join(voiceDir, group), { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", join(from, file), "-ac", "1", "-b:a", "48k", join(voiceDir, group, file)]);
  counts[group] = (counts[group] ?? 0) + 1;
}
for (const [group, n] of Object.entries(counts)) console.log(`${group}: ${n} files → voice/${group}/`);
if (unknown.length) console.log(`not a current narration line (skipped): ${unknown.join(", ")}`);
