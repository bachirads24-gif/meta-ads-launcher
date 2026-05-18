import { getCurrentUser } from "@/lib/auth";
import { getConversation, saveHistory, updateMeta, type StoredMessage } from "@/lib/assistant/store";
import { streamAssistant, generateTitle, type AssistantBrandContext } from "@/lib/ai/openai";
import { executeTool, type ToolContext } from "@/lib/ai/tools";
import { getBrandWithToken, listBrandsPublic, type Brand } from "@/lib/brands";
import type {
  ChatCompletionAssistantMessageParam,
} from "openai/resources/chat/completions";

type FunctionToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

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

  const history: StoredMessage[] = [
    ...conv.history,
    { role: "user", content: message },
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

          let assistantText = "";
          const toolCallBuf: Record<number, { id: string; name: string; args: string }> = {};

          for await (const chunk of iter) {
            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;
            if (typeof delta.content === "string" && delta.content.length > 0) {
              assistantText += delta.content;
              send({ type: "text", delta: delta.content });
            }
            for (const tc of delta.tool_calls ?? []) {
              const idx = tc.index ?? 0;
              const slot = toolCallBuf[idx] ?? { id: "", name: "", args: "" };
              if (tc.id) slot.id = tc.id;
              if (tc.function?.name) slot.name = tc.function.name;
              if (tc.function?.arguments) slot.args += tc.function.arguments;
              toolCallBuf[idx] = slot;
            }
          }

          const toolCalls: FunctionToolCall[] = Object.values(toolCallBuf)
            .filter((s) => s.id && s.name)
            .map((s) => ({
              id: s.id,
              type: "function" as const,
              function: { name: s.name, arguments: s.args || "{}" },
            }));

          const assistantMsg: ChatCompletionAssistantMessageParam = {
            role: "assistant",
            content: assistantText || null,
          };
          if (toolCalls.length > 0) assistantMsg.tool_calls = toolCalls;
          history.push(assistantMsg);

          if (toolCalls.length === 0) break;

          for (const call of toolCalls) {
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs = JSON.parse(call.function.arguments || "{}");
            } catch {
              parsedArgs = {};
            }
            send({ type: "tool", name: call.function.name, args: parsedArgs, status: "running" });
            try {
              const result = await executeTool(call.function.name, parsedArgs, ctx);
              send({ type: "tool", name: call.function.name, args: parsedArgs, status: "done" });
              history.push({
                role: "tool",
                tool_call_id: call.id,
                content: JSON.stringify(result),
              });
            } catch (e) {
              const errorMsg = e instanceof Error ? e.message : String(e);
              send({
                type: "tool",
                name: call.function.name,
                args: parsedArgs,
                status: "error",
                error: errorMsg,
              });
              history.push({
                role: "tool",
                tool_call_id: call.id,
                content: JSON.stringify({ error: errorMsg }),
              });
            }
          }
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
