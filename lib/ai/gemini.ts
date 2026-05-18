import { GoogleGenAI, type Content } from "@google/genai";
import { ASSISTANT_TOOL_DECLARATIONS } from "./tools";
import { buildAdminAllBrandsInstruction, buildSystemInstruction } from "./system-prompt";
import type { Brand } from "@/lib/brands";

export const ASSISTANT_MODEL = "gemini-3-pro-preview";
export const ASSISTANT_TITLE_MODEL = "gemini-2.5-flash";

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY n'est pas configuré");
  return new GoogleGenAI({ apiKey });
}

export type AssistantBrandContext =
  | { mode: "single"; brand: Brand }
  | { mode: "all"; brands: Brand[] };

export async function streamAssistant(contents: Content[], ctx: AssistantBrandContext) {
  const ai = client();
  const systemInstruction =
    ctx.mode === "single"
      ? buildSystemInstruction(ctx.brand)
      : buildAdminAllBrandsInstruction(ctx.brands);

  return ai.models.generateContentStream({
    model: ASSISTANT_MODEL,
    contents,
    config: {
      systemInstruction,
      tools: [
        { functionDeclarations: ASSISTANT_TOOL_DECLARATIONS },
        { googleSearch: {} },
      ],
      toolConfig: { includeServerSideToolInvocations: true },
      temperature: 0.6,
      thinkingConfig: { thinkingBudget: -1 },
    },
  });
}

export async function generateTitle(firstUserMessage: string): Promise<string> {
  const ai = client();
  try {
    const res = await ai.models.generateContent({
      model: ASSISTANT_TITLE_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Résume en 3 à 6 mots ce sujet de conversation (en français, sans guillemets, sans ponctuation finale) : ${firstUserMessage}`,
            },
          ],
        },
      ],
      config: { temperature: 0.2 },
    });
    const text = (res.text ?? "").trim().replace(/^["'«»]+|["'«»]+$/g, "");
    if (text.length > 0 && text.length <= 80) return text;
  } catch {
    // fall through
  }
  return firstUserMessage.slice(0, 60);
}
