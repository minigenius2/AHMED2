// التواريخ كلها نصوص بصيغة YYYY-MM-DD وبنحسبها بتوقيت UTC
// عشان مايحصلش لخبطة في فرق التوقيت بين السيرفر وموبايل الطالب.

export type ISODate = string;

/** 0 = الأحد ... 6 = السبت (نفس ترتيب JavaScript) */
export const WEEKDAY_NAMES_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] as const;

export function parseDate(date: ISODate): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid date (expected YYYY-MM-DD): ${date}`);
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function formatDate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

export function dayOfWeek(date: ISODate): number {
  return parseDate(date).getUTCDay();
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);
}

export function isBetween(date: ISODate, from: ISODate, to: ISODate): boolean {
  return date >= from && date <= to;
}
