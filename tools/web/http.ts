// أدوات صغيرة مشتركة لدوال السيرفر على Vercel («حل معايا» والفويسات)
import type { IncomingMessage, ServerResponse } from "node:http";

export function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

export class BodyTooLargeError extends Error {}

export function readBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) reject(new BodyTooLargeError("too large"));
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
}

/** حد بسيط لكل جهاز في فترة زمنية. الذاكرة دي بتتمسح لما السيرفر يرتاح، وده كفاية لتجربة مع كام طالب */
export class WindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** فاضل كام؟ (من غير ما يحسب) */
  remaining(key: string): number {
    const since = this.now() - this.windowMs;
    return Math.max(0, this.limit - (this.hits.get(key) ?? []).filter((t) => t > since).length);
  }

  /** بيحسب مرة لو لسه فيه، ويرجّع false لو الحد خلص */
  take(key: string): boolean {
    const since = this.now() - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= this.limit) return false;
    this.hits.set(key, [...recent, this.now()]);
    return true;
  }
}
