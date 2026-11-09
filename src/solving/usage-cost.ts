// تكلفة كل طلب من أرقام الاستهلاك اللي بترجع مع الرد، عشان نعرف التكلفة الحقيقية لكل مسألة بدل التقدير.
import { EGP_PER_USD, MODEL_PRICES, type ModelPrice } from "../config";
import type { ModelUsage } from "./types";

function priceFor(model: string, requested?: string): ModelPrice | undefined {
  return MODEL_PRICES[model] ?? (requested ? MODEL_PRICES[requested] : undefined);
}

/** التكلفة بالدولار. لو الموديل مش في جدول الأسعار (موديل بديل مثلًا) بنحسب بسعر الموديل اللي طلبناه */
export function usageCostUsd(usage: ModelUsage, requestedModel?: string): number {
  const price = priceFor(usage.model, requestedModel);
  if (!price) return 0;
  const perToken = (perMillion: number) => perMillion / 1_000_000;
  return (
    usage.input_tokens * perToken(price.input) +
    (usage.cache_creation_input_tokens ?? 0) * perToken(price.cacheWrite) +
    (usage.cache_read_input_tokens ?? 0) * perToken(price.cacheRead) +
    usage.output_tokens * perToken(price.output)
  );
}

export function usdToEgp(usd: number): number {
  return usd * EGP_PER_USD;
}
