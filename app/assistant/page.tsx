"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

interface PublicBrand {
  id: string;
  name: string;
  hasToken: boolean;
  industry?: string;
  audience?: string;
  offers?: string;
  voice?: string;
  keywords?: string;
}

interface ConversationMeta {
  id: string;
  title: string;
  brandId: string;
  createdAt: number;
  updatedAt: number;
}

interface ToolCall {
  name: string;
  args: Record<string, unknown>;
  status: "running" | "done" | "error";
  error?: string;
}

interface GroundingSource {
  uri?: string;
  title?: string;
}

interface UiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  toolCalls: ToolCall[];
  sources: GroundingSource[];
  streaming?: boolean;
}

// Convert stored Content[] history → UI messages
interface StoredPart {
  text?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
  functionResponse?: { name?: string; response?: Record<string, unknown> };
}
interface StoredContent {
  role: string;
  parts?: StoredPart[];
}

function historyToMessages(history: StoredContent[]): UiMessage[] {
  const msgs: UiMessage[] = [];
  let assistantBuffer: UiMessage | null = null;

  const flush = () => {
    if (assistantBuffer && (assistantBuffer.text || assistantBuffer.toolCalls.length > 0)) {
      msgs.push(assistantBuffer);
    }
    assistantBuffer = null;
  };

  for (const c of history) {
    const parts = c.parts ?? [];
    if (c.role === "user") {
      const hasFnResp = parts.some((p) => p.functionResponse);
      if (hasFnResp) continue; // tool results are folded into the prior assistant message
      flush();
      const text = parts
        .map((p) => p.text ?? "")
        .filter(Boolean)
        .join("");
      if (text) {
        msgs.push({
          id: crypto.randomUUID(),
          role: "user",
          text,
          toolCalls: [],
          sources: [],
        });
      }
    } else if (c.role === "model") {
      if (!assistantBuffer) {
        assistantBuffer = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "",
          toolCalls: [],
          sources: [],
        };
      }
      for (const p of parts) {
        if (p.text) assistantBuffer.text += p.text;
        if (p.functionCall) {
          assistantBuffer.toolCalls.push({
            name: p.functionCall.name ?? "tool",
            args: p.functionCall.args ?? {},
            status: "done",
          });
        }
      }
    }
  }
  flush();
  return msgs;
}

export default function AssistantPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<PublicBrand[]>([]);
  const [brandId, setBrandId] = useState<string>("");
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<{ username: string; isAdmin: boolean } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetch("/api/me").then((r) => r.json()).then((d) => setMe({ username: d.username, isAdmin: !!d.isAdmin }));
    fetch("/api/brands")
      .then((r) => r.json())
      .then((d) => {
        setBrands(d.brands || []);
        if (d.brands?.[0]) setBrandId(d.brands[0].id);
      });
    loadConversations();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function loadConversations() {
    const r = await fetch("/api/assistant/conversations", { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json();
    setConversations(d.conversations || []);
  }

  async function openConversation(id: string) {
    setActiveId(id);
    setMessages([]);
    setError(null);
    const r = await fetch(`/api/assistant/conversations/${id}`, { cache: "no-store" });
    if (!r.ok) {
      setError("Conversation introuvable");
      return;
    }
    const d = await r.json();
    const conv = d.conversation as { meta: ConversationMeta; history: StoredContent[] };
    setBrandId(conv.meta.brandId);
    setMessages(historyToMessages(conv.history));
  }

  async function newConversation() {
    if (!brandId) return;
    setError(null);
    const r = await fetch("/api/assistant/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setError(d.error || "Erreur");
      return;
    }
    const d = await r.json();
    setActiveId(d.conversation.id);
    setMessages([]);
    setConversations((prev) => [d.conversation, ...prev]);
  }

  async function deleteConversation(id: string) {
    if (!confirm("Supprimer cette conversation ?")) return;
    await fetch(`/api/assistant/conversations?id=${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    let convId = activeId;
    if (!convId) {
      if (!brandId) {
        setError("Sélectionnez une marque");
        return;
      }
      const r = await fetch("/api/assistant/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      if (!r.ok) {
        setError("Impossible de créer une conversation");
        return;
      }
      const d = await r.json();
      convId = d.conversation.id as string;
      setActiveId(convId);
      setConversations((prev) => [d.conversation, ...prev]);
    }

    const userMsg: UiMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      toolCalls: [],
      sources: [],
    };
    const assistantMsg: UiMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "",
      toolCalls: [],
      sources: [],
      streaming: true,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, message: text }),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "Erreur réseau");
        setError(errText);
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsg.id ? { ...m, streaming: false } : m)),
        );
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split("\n\n");
        buf = blocks.pop() || "";
        for (const block of blocks) {
          const line = block.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const evt = JSON.parse(line.slice(6));
          applyEvent(assistantMsg.id, evt, convId!);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSending(false);
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsg.id ? { ...m, streaming: false } : m)),
      );
      loadConversations();
    }
  }

  function applyEvent(
    msgId: string,
    evt:
      | { type: "text"; delta: string }
      | { type: "tool"; name: string; args: Record<string, unknown>; status: "running" | "done" | "error"; error?: string }
      | { type: "grounding"; sources: GroundingSource[] }
      | { type: "title"; title: string }
      | { type: "done" }
      | { type: "error"; error: string },
    convId: string,
  ) {
    if (evt.type === "title") {
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title: evt.title } : c)),
      );
      return;
    }
    if (evt.type === "error") {
      setError(evt.error);
      return;
    }
    if (evt.type === "done") return;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;
        if (evt.type === "text") return { ...m, text: m.text + evt.delta };
        if (evt.type === "tool") {
          const existingIdx = m.toolCalls.findIndex(
            (t) => t.name === evt.name && JSON.stringify(t.args) === JSON.stringify(evt.args),
          );
          if (existingIdx >= 0) {
            const next = [...m.toolCalls];
            next[existingIdx] = { name: evt.name, args: evt.args, status: evt.status, error: evt.error };
            return { ...m, toolCalls: next };
          }
          return {
            ...m,
            toolCalls: [...m.toolCalls, { name: evt.name, args: evt.args, status: evt.status, error: evt.error }],
          };
        }
        if (evt.type === "grounding") return { ...m, sources: [...m.sources, ...evt.sources] };
        return m;
      }),
    );
  }

  const activeBrand = useMemo(
    () => brands.find((b) => b.id === brandId),
    [brands, brandId],
  );
  const activeBrandName = activeBrand?.name ?? "—";
  const hasNiche = Boolean(
    activeBrand?.industry || activeBrand?.audience || activeBrand?.offers || activeBrand?.voice || activeBrand?.keywords,
  );
  const showNicheHint = activeBrand && !hasNiche && me?.isAdmin;

  return (
    <div className="min-h-screen relative text-ink-50 font-sans selection:bg-accent-500/30 overflow-hidden bg-background">
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <img src="/dashboard_bg.png" alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-accent-400/20 blur-[100px] animate-blob mix-blend-overlay"></div>
        <div className="absolute bottom-[-20%] right-[20%] w-[45vw] h-[45vw] rounded-full bg-accent-500/10 blur-[120px] animate-blob animation-delay-4000 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-background/20 backdrop-blur-[2px]"></div>
      </div>

      <div className="relative z-10 grid grid-cols-12 gap-0 h-screen">
        {/* Left rail */}
        <aside className="col-span-12 lg:col-span-3 xl:col-span-2 border-r border-surface-border bg-white/60 backdrop-blur-2xl p-4 flex flex-col gap-4 overflow-hidden">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-sm font-bold text-accent-500 hover:text-accent-600">
              ← Lanceur
            </Link>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-ink-400 mb-1.5">Marque</label>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-white px-3 py-2 text-sm font-semibold focus:outline-none focus:border-accent-500"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={newConversation}
            disabled={!brandId}
            className="rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-black text-sm py-2.5 shadow-lg shadow-accent-500/30 hover:shadow-accent-500/50 transition-shadow disabled:opacity-50"
          >
            + Nouvelle conversation
          </button>

          <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-1">
            {conversations.length === 0 && (
              <p className="text-xs text-ink-400 italic px-2 mt-2">Aucune conversation. Commence ci-dessous.</p>
            )}
            {conversations.map((c) => {
              const brandName = brands.find((b) => b.id === c.brandId)?.name;
              return (
                <div
                  key={c.id}
                  className={`group flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition-colors ${
                    activeId === c.id ? "bg-accent-500/10 border border-accent-500/30" : "hover:bg-surface-hover"
                  }`}
                  onClick={() => openConversation(c.id)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink-50 truncate">{c.title}</p>
                    <p className="text-[10px] font-semibold text-ink-400 truncate">{brandName ?? c.brandId}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(c.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-err-500 transition-opacity p-1"
                    aria-label="Supprimer"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>

          {me && (
            <div className="text-[11px] font-semibold text-ink-400 px-2 pt-2 border-t border-surface-border">
              Connecté : {me.username}
            </div>
          )}
        </aside>

        {/* Main chat */}
        <main className="col-span-12 lg:col-span-9 xl:col-span-10 flex flex-col h-screen overflow-hidden">
          <header className="px-6 py-4 border-b border-surface-border bg-white/40 backdrop-blur-2xl flex items-center justify-between">
            <div>
              <h1 className="text-xl font-black text-ink-50">Assistant IA</h1>
              <p className="text-xs text-ink-500 font-semibold">
                Marché algérien · Gemini 2.5 Pro · {activeBrandName}
              </p>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 space-y-6">
            {showNicheHint && (
              <div className="rounded-2xl border border-warn-500/30 bg-warn-500/10 px-4 py-3 text-sm text-warn-600 flex items-start gap-3">
                <span className="text-base">💡</span>
                <div className="flex-1">
                  <span className="font-bold">Astuce :</span> remplis le profil de cette marque dans{" "}
                  <Link href="/brands" className="underline font-semibold hover:text-warn-500">
                    /brands
                  </Link>{" "}
                  (industrie, public, offres, voix, mots-clés) pour des recherches Google et des suggestions ciblées sur ton industrie.
                </div>
              </div>
            )}
            {messages.length === 0 && (
              <div className="max-w-2xl mx-auto text-center py-12">
                <div className="inline-flex p-4 bg-accent-500/10 rounded-3xl mb-4">
                  <svg className="w-10 h-10 text-accent-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-black text-ink-50 mb-2">Comment puis-je t&apos;aider aujourd&apos;hui ?</h2>
                <p className="text-ink-500 text-sm font-semibold max-w-md mx-auto mb-6">
                  Analyse de tes campagnes, suggestions d&apos;accroches, stratégies vidéo, tout optimisé pour le marché algérien.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                  {[
                    "Quelles campagnes dépassent le seuil CPA aujourd'hui ?",
                    "Compare mes performances des 7 derniers jours vs les 7 d'avant",
                    "Propose 5 accroches pour une offre de coaching",
                    "Quelles tendances Reels marchent en Algérie en ce moment ?",
                  ].map((sug) => (
                    <button
                      key={sug}
                      onClick={() => setInput(sug)}
                      className="text-left rounded-2xl bg-white/70 hover:bg-white border border-surface-border p-4 text-sm font-semibold text-ink-100 hover:shadow-md transition-all"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-3xl rounded-3xl px-5 py-4 shadow-md ${
                      m.role === "user"
                        ? "bg-gradient-to-r from-accent-500 to-accent-600 text-white"
                        : "bg-white/80 backdrop-blur-xl border border-white text-ink-50"
                    }`}
                  >
                    {m.toolCalls.length > 0 && (
                      <div className="mb-3 space-y-1.5">
                        {m.toolCalls.map((t, i) => (
                          <div
                            key={i}
                            className={`inline-flex items-center gap-2 text-[11px] font-bold px-2.5 py-1 rounded-lg mr-1.5 ${
                              t.status === "error"
                                ? "bg-err-500/10 text-err-600 border border-err-500/30"
                                : t.status === "running"
                                  ? "bg-accent-500/10 text-accent-600 border border-accent-500/30"
                                  : "bg-surface border border-surface-border text-ink-500"
                            }`}
                            title={JSON.stringify(t.args)}
                          >
                            {t.status === "running" ? (
                              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
                              </svg>
                            ) : t.status === "error" ? (
                              <span>✕</span>
                            ) : (
                              <span>✓</span>
                            )}
                            <code>{t.name}</code>
                            {t.error && <span className="ml-1 italic">— {t.error}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {m.text && (
                      <div className="whitespace-pre-wrap leading-relaxed text-[15px]">{m.text}</div>
                    )}

                    {m.streaming && !m.text && (
                      <div className="flex gap-1 py-1">
                        <span className="w-2 h-2 rounded-full bg-accent-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 rounded-full bg-accent-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 rounded-full bg-accent-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    )}

                    {m.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-surface-border">
                        <p className="text-[10px] font-black uppercase tracking-wider text-ink-400 mb-1.5">Sources</p>
                        <div className="flex flex-wrap gap-1.5">
                          {m.sources.map((s, i) =>
                            s.uri ? (
                              <a
                                key={i}
                                href={s.uri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] font-semibold text-accent-500 hover:text-accent-600 underline truncate max-w-[260px]"
                              >
                                {s.title || s.uri}
                              </a>
                            ) : null,
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {error && (
            <div className="mx-6 mb-2 rounded-xl border border-err-500/30 bg-err-500/10 p-3 text-sm text-err-600">
              {error}
            </div>
          )}

          <div className="border-t border-surface-border bg-white/40 backdrop-blur-2xl p-4">
            <div className="max-w-4xl mx-auto flex gap-3 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder={brandId ? "Pose ta question…" : "Sélectionne une marque pour commencer"}
                disabled={!brandId || sending}
                className="flex-1 rounded-2xl border border-surface-border bg-white px-4 py-3 text-sm focus:outline-none focus:border-accent-500 resize-none max-h-40 disabled:opacity-50"
                style={{ minHeight: "48px" }}
              />
              <button
                onClick={send}
                disabled={!input.trim() || sending || !brandId}
                className="rounded-2xl bg-gradient-to-r from-accent-500 to-accent-600 text-white font-black px-5 py-3 shadow-lg shadow-accent-500/30 hover:shadow-accent-500/50 transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? "…" : "Envoyer"}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
