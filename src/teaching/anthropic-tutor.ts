// "اسأل المعلم" على Claude. قواعد المعلم + معلومات الدرس عليهم cache (ثابتين)، والسؤال في الآخر.
import Anthropic from "@anthropic-ai/sdk";
import { TutorUnavailableError, type TutorModel } from "./ask-teacher";

/**
 * الموديل الافتراضي. Claude Haiku 5.5 أرخص بكتير لكل سؤال — تغييره قرار تكلفة وجودة،
 * فبيتغير من هنا أو من options.model بعد ما نجرّب الاتنين على أسئلة أطفال حقيقية.
 */
export const DEFAULT_TUTOR_MODEL = "claude-opus-5-5";

/** موديلات Haiku مابتقبلش الموديل البديل من السيرفر (الطلب بيرجع 400)، فمابنبعتهوش ليها */
function supportsServerFallback(model: string): boolean {
  return !model.startsWith("claude-haiku");
}

export interface AnthropicTutorOptions {
  client?: Anthropic;
  model?: string;
}

export function anthropicTutor(options: AnthropicTutorOptions = {}): TutorModel {
  const client = options.client ?? new Anthropic();
  const model = options.model ?? DEFAULT_TUTOR_MODEL;

  return async ({ rules, lessonContext, history, question }) => {
    const messages: Anthropic.Beta.BetaMessageParam[] = [];
    for (const turn of history) {
      messages.push({ role: "user", content: turn.question }, { role: "assistant", content: turn.answer });
    }
    messages.push({ role: "user", content: question });

    try {
      const response = await client.beta.messages.create({
        model,
        max_tokens: 4000,
        // الرد قصير وبسيط: مجهود تفكير قليل يكفي ويقلل التكلفة والوقت
        output_config: { effort: "low" },
        // لو الموديل رفض لأسباب أمان، السيرفر بيجرّب موديل بديل مناسب تلقائيًا
        ...(supportsServerFallback(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        system: [
          { type: "text", text: rules },
          { type: "text", text: lessonContext, cache_control: { type: "ephemeral" } },
        ],
        messages,
      });
      if (response.stop_reason === "refusal") return { text: "", refused: true };
      const text = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("\n")
        .trim();
      return { text, refused: false };
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.InternalServerError) {
        throw new TutorUnavailableError(error.message);
      }
      throw error;
    }
  };
}
