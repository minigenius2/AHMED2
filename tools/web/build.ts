// بيبني الموقع اللي بيترفع على Vercel (npm run build:web) بصيغة Vercel الجاهزة (Build Output API):
//   .vercel/output/static/index.html                 ← صفحة الدروس
//   .vercel/output/static/lessons/<الدرس>/           ← كل درس ليه سيناريو (+ صوره وتسجيلاته)
//   .vercel/output/functions/api/ask.func/           ← "اسأل المعلم" على السيرفر
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { buildLessonPage } from "../lesson-preview/page";
import { scienceG4Term1, scienceG4Term1Scripts } from "../../src/content/science-g4-term1";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const output = join(root, ".vercel/output");
const staticDir = join(output, "static");
rmSync(output, { recursive: true, force: true });
mkdirSync(staticDir, { recursive: true });

// 1) صفحات الدروس
const ready = new Set(Object.keys(scienceG4Term1Scripts));
for (const lessonId of ready) {
  const r = buildLessonPage({
    lessonId,
    out: join(staticDir, "lessons", lessonId, "index.html"),
    standalone: true,
    baseHref: `/lessons/${lessonId}/`,
    tutorEndpoint: "/api/ask",
  });
  console.log(`lesson ${lessonId}: ${r.photos} photos, ${r.recorded}/${r.lines} lines recorded`);
}

// 2) صفحة الدروس: الدروس الجاهزة بتتفتح، والباقي "قريبًا"
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const units = scienceG4Term1.units
  .map((unit, ui) => {
    const lessons = unit.lessons
      .map((l, li) => {
        const label = `<span class="n">${ui + 1}.${li + 1}</span><span class="t"><b dir="ltr">${esc(l.title)}</b><small>${esc(l.titleAr ?? "")}</small></span>`;
        return ready.has(l.id) ? `<a class="lesson" href="/lessons/${l.id}/">${label}<span class="go">▶️</span></a>` : `<div class="lesson soon">${label}<span class="go">قريبًا</span></div>`;
      })
      .join("");
    return `<section><h2><span dir="ltr">${esc(unit.title)}</span>${unit.titleAr ? ` · ${esc(unit.titleAr)}` : ""}</h2>${lessons}</section>`;
  })
  .join("");
writeFileSync(
  join(staticDir, "index.html"),
  `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1f8a57"><title>مساعد العلوم — رابعة ابتدائي</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Baloo+Bhaijaan+2:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  :root { --bg: #fbf7ef; --surface: #fff; --ink: #1f2a37; --ink-2: #5d6774; --line: #e5ddcb; --leaf: #1f8a57; --leaf-soft: #dcf1e5; color-scheme: light; }
  @media (prefers-color-scheme: dark) { :root { --bg: #10151c; --surface: #19212b; --ink: #eef2f6; --ink-2: #a7b1be; --line: #2d3947; --leaf: #3cc483; --leaf-soft: #17392a; color-scheme: dark; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: "Baloo Bhaijaan 2", "Segoe UI", Tahoma, sans-serif; line-height: 1.6; }
  main { max-width: 600px; margin: 0 auto; padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 32px max(16px, env(safe-area-inset-left)); }
  .hero { text-align: center; padding: 16px 0 8px; }
  .owl { width: 96px; height: 96px; margin: 0 auto; border-radius: 50%; background: #fff0c7; display: grid; place-items: center; font-size: 56px; }
  h1 { margin: 10px 0 0; font-size: 28px; }
  .hero p { margin: 0; color: var(--ink-2); }
  h2 { font-size: 17px; margin: 22px 0 8px; color: var(--ink-2); }
  .lesson { display: flex; align-items: center; gap: 12px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; padding: 10px 14px; margin: 8px 0; color: inherit; text-decoration: none; }
  a.lesson { border-color: var(--leaf); box-shadow: 0 6px 18px rgba(31, 138, 87, .15); }
  .lesson .n { flex: none; width: 42px; height: 42px; border-radius: 13px; background: var(--leaf-soft); display: grid; place-items: center; font-weight: 800; }
  .lesson .t { flex: 1; display: flex; flex-direction: column; line-height: 1.35; }
  .lesson small { color: var(--ink-2); }
  .lesson .go { font-size: 14px; color: var(--ink-2); font-weight: 700; }
  .soon { opacity: .6; }
</style></head><body><main>
<section class="hero"><div class="owl" aria-hidden="true">🦉</div><h1>مساعد العلوم</h1><p>رابعة ابتدائي — الترم الأول · مع أستاذ نبيه</p></section>
${units}
</main></body></html>
`,
);

// 3) "اسأل المعلم": الكود كله ومكتبة Anthropic في ملف واحد
const func = join(output, "functions/api/ask.func");
await build({
  entryPoints: [join(root, "tools/web/ask-entry.ts")],
  outfile: join(func, "index.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // بعض المكتبات بتستخدم require جوه ملف ESM
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: "warning",
});
writeFileSync(join(func, ".vc-config.json"), JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false }, null, 2));
writeFileSync(join(output, "config.json"), JSON.stringify({ version: 3 }, null, 2));
console.log(`site → ${output}`);
