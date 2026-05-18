import { getCurrentUser } from "@/lib/auth";
import { getConversation, saveHistory, updateMeta } from "@/lib/assistant/store";
import { streamAssistant, generateTitle, type AssistantBrandContext } from "@/lib/ai/gemini";
import { executeTool, type ToolContext } from "@/lib/ai/tools";
import { getBrandWithToken, listBrandsPublic, type Brand } from "@/lib/brands";
import type { Content, Part } from "@google/genai";

const ALL_BRANDS_SENTINEL = "*";

export const runtime = "nodejs";
export const maxDuration = 300;

interface ChatRequest {
  conversationId: string;
  message: string;
}

type Event =
  | { type: "text"; delta: string }
  | { type: "tool"; name: string; args: Record<string, unknown>; status: "running" | "done" | "error"; error?: string }
  | { type: "grounding"; sources: { uri?: string; title?: string }[] }
  | { type: "title"; title: string }
  | { type: "done" }
  | { type: "error"; error: string };

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Non authentifié", { status: 401 });

  const { conversationId, message } = (await req.json()) as ChatRequest;
  if (!conversationId || !message?.trim()) {
    return new Response("conversationId et message requis", { status: 400 });
  }

  const conv = await getConversation(user.id, conversationId);
  if (!conv) return new Response("Conversation introuvable", { status: 404 });

  const isAllBrandsMode = conv.meta.brandId === ALL_BRANDS_SENTINEL;
  if (isAllBrandsMode && !user.isAdmin) {
    return new Response("Mode multi-marques réservé aux admins", { status: 403 });
  }
  if (!isAllBrandsMode && !user.isAdmin && !user.brandIds.includes(conv.meta.brandId)) {
    return new Response("Brand non autorisé", { status: 403 });
  }

  let brandCtx: AssistantBrandContext;
  if (isAllBrandsMode) {
    const publicBrands = await listBrandsPublic();
    const loaded = await Promise.all(
      publicBrands.map(async (pb) => (await getBrandWithToken(pb.id)) as Brand | null),
    );
    const brands = loaded.filter((b): b is Brand => b !== null);
    brandCtx = { mode: "all", brands };
  } else {
    const brand = await getBrandWithToken(conv.meta.brandId);
    if (!brand) return new Response("Marque introuvable", { status: 404 });
    brandCtx = { mode: "single", brand };
  }

  const ctx: ToolContext = {
    user,
    defaultBrandId: isAllBrandsMode ? null : conv.meta.brandId,
  };
  const isFirstMessage = conv.history.length === 0;

  const history: Content[] = [
    ...conv.history,
    { role: "user", parts: [{ text: message }] },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: Event) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));

      try {
        if (isFirstMessage) {
          const title = await generateTitle(message);
          await updateMeta(user.id, conversationId, { title, updatedAt: Date.now() });
          send({ type: "title", title });
        }

        let safetyHops = 0;
        while (safetyHops++ < 8) {
          const iter = await streamAssistant(history, brandCtx);
          const assistantParts: Part[] = [];
          const pendingFnCalls: { name: string; args: Record<string, unknown>; id?: string }[] = [];
          let groundingSent = false;

          for await (const chunk of iter) {
            const cand = chunk.candidates?.[0];
            const parts = cand?.content?.parts ?? [];
            for (const p of parts) {
              // Preserve the full part (including any thoughtSignature on
              // thought, text, or functionCall parts) — Gemini 3 requires it.
              assistantParts.push(p);
              if (p.text && !p.thought) {
                send({ type: "text", delta: p.text });
              }
              if (p.functionCall) {
                const name = p.functionCall.name ?? "";
                const args = (p.functionCall.args ?? {}) as Record<string, unknown>;
                pendingFnCalls.push({ name, args, id: p.functionCall.id });
                send({ type: "tool", name, args, status: "running" });
              }
            }
            if (!groundingSent && cand?.groundingMetadata?.groundingChunks) {
              const sources = cand.groundingMetadata.groundingChunks
                .map((g) => ({ uri: g.web?.uri, title: g.web?.title }))
                .filter((s) => s.uri);
              if (sources.length > 0) {
                send({ type: "grounding", sources });
                groundingSent = true;
              }
            }
          }

          if (assistantParts.length > 0) {
            history.push({ role: "model", parts: assistantParts });
          }

          if (pendingFnCalls.length === 0) break;

          const toolResponseParts: Part[] = [];
          for (const call of pendingFnCalls) {
            try {
              const result = await executeTool(call.name, call.args, ctx);
              send({ type: "tool", name: call.name, args: call.args, status: "done" });
              toolResponseParts.push({
                functionResponse: {
                  id: call.id,
                  name: call.name,
                  response: { result },
                },
              });
            } catch (e) {
              const errorMsg = e instanceof Error ? e.message : String(e);
              send({
                type: "tool",
                name: call.name,
                args: call.args,
                status: "error",
                error: errorMsg,
              });
              toolResponseParts.push({
                functionResponse: {
                  id: call.id,
                  name: call.name,
                  response: { error: errorMsg },
                },
              });
            }
          }
          history.push({ role: "user", parts: toolResponseParts });
        }

        await saveHistory(user.id, conversationId, history);
        await updateMeta(user.id, conversationId, { updatedAt: Date.now() });
        send({ type: "done" });
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
