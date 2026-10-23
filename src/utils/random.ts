// مولّد أرقام عشوائية ثابت (seeded) عشان كل اختبار يتولد بشكل مختلف،
// لكن نقدر نعيد توليد نفس الاختبار بالظبط لو عرفنا الـ seed (مهم للمراجعة والتصحيح).

export type Rng = () => number;

/** mulberry32: مولّد بسيط وسريع وكافي للاستخدام التعليمي (مش للتشفير). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** يحوّل أي نص لرقم ثابت (FNV-1a) — بنستخدمه نطلع seed من (الطالب + نوع الاختبار + رقم المحاولة). */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export function pickOne<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new Error("pickOne: empty list");
  return items[Math.floor(rng() * items.length)] as T;
}
