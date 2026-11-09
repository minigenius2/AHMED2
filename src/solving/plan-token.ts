// خطة الحل فيها الإجابة، فمابتوصلش للموبايل مكشوفة: بتتبعت مشفّرة (AES-256-GCM)، والسيرفر بس اللي بيفتحها.
// كده السيرفر مش محتاج يحفظ الجلسة، والطالب مايقدرش يشوف الإجابة من أدوات المتصفح.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { ProblemPlan, ProblemRef } from "./types";

export interface SealedProblem {
  plan: ProblemPlan;
  ref?: ProblemRef;
  /** وقت البداية، عشان التوكن مايفضلش شغال للأبد */
  startedAt: number;
}

const MAX_AGE_MS = 24 * 3_600_000;

function keyFrom(secret: string): Buffer {
  return createHash("sha256").update(`solve-with-me:${secret}`).digest();
}

export function sealProblem(problem: SealedProblem, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(problem), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** بيرجّع undefined لو التوكن متلعّب فيه أو قديم */
export function openProblem(token: string, secret: string, now = Date.now()): SealedProblem | undefined {
  try {
    const raw = Buffer.from(token, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
    const problem = JSON.parse(json) as SealedProblem;
    return now - problem.startedAt > MAX_AGE_MS ? undefined : problem;
  } catch {
    return undefined;
  }
}
