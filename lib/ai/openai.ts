import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionChunk,
} from "openai/resources/chat/completions";
import { ASSISTANT_TOOLS } from "./tools";
import { buildAdminAllBrandsInstruction, buildSystemInstruction } from "./system-prompt";
import type { Brand } from "@/lib/brands";

export const ASSISTANT_MODEL = "gpt-5.5";
export const ASSISTANT_TITLE_MODEL = "chat-latest";

function client(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY n'est pas configuré");
  return new OpenAI({ apiKey });
}

export type AssistantBrandContext =
  | { mode: "single"; brand: Brand }
  | { mode: "all"; brands: Brand[] };

export type AssistantMessage = ChatCompletionMessageParam;

export async function streamAssistant(
  history: AssistantMessage[],
  ctx: AssistantBrandContext,
): Promise<AsyncIterable<ChatCompletionChunk>> {
  const systemInstruction =
    ctx.mode === "single"
      ? buildSystemInstruction(ctx.brand)
      : buildAdminAllBrandsInstruction(ctx.brands);

  return client().chat.completions.create({
    model: ASSISTANT_MODEL,
    stream: true,
    temperature: 0.6,
    messages: [
      { role: "system", content: systemInstruction },
      ...history,
    ],
    tools: ASSISTANT_TOOLS,
  });
}

export async function generateTitle(firstUserMessage: string): Promise<string> {
  try {
    const res = await client().chat.completions.create({
      model: ASSISTANT_TITLE_MODEL,
      temperature: 0.2,
      max_tokens: 30,
      messages: [
        {
          role: "user",
          content: `Résume en 3 à 6 mots ce sujet de conversation (en français, sans guillemets, sans ponctuation finale) : ${firstUserMessage}`,
        },
      ],
    });
    const text = (res.choices[0]?.message?.content ?? "").trim().replace(/^["'«»]+|["'«»]+$/g, "");
    if (text.length > 0 && text.length <= 80) return text;
  } catch {
    // fall through
  }
  return firstUserMessage.slice(0, 60);
}
