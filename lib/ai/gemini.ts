import { GoogleGenAI, type Content } from "@google/genai";
import { ASSISTANT_TOOL_DECLARATIONS } from "./tools";
import { SYSTEM_INSTRUCTION } from "./system-prompt";

export const ASSISTANT_MODEL = "gemini-2.5-pro";

function client(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY n'est pas configuré");
  return new GoogleGenAI({ apiKey });
}

export async function streamAssistant(contents: Content[]) {
  const ai = client();
  return ai.models.generateContentStream({
    model: ASSISTANT_MODEL,
    contents,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [
        { functionDeclarations: ASSISTANT_TOOL_DECLARATIONS },
        { googleSearch: {} },
      ],
      temperature: 0.6,
    },
  });
}

export async function generateTitle(firstUserMessage: string): Promise<string> {
  const ai = client();
  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
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
