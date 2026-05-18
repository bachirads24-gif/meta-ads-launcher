import { Redis } from "@upstash/redis";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export interface ConversationMeta {
  id: string;
  title: string;
  brandId: string;
  createdAt: number;
  updatedAt: number;
}

export type StoredMessage = ChatCompletionMessageParam;

export interface Conversation {
  meta: ConversationMeta;
  history: StoredMessage[];
}

function redis(): Redis {
  return Redis.fromEnv();
}

function indexKey(userId: string) {
  return `assistant:convs:${userId}`;
}
function convKey(userId: string, convId: string) {
  return `assistant:conv:${userId}:${convId}`;
}

export async function listConversations(userId: string): Promise<ConversationMeta[]> {
  const arr = (await redis().get<ConversationMeta[]>(indexKey(userId))) ?? [];
  return [...arr].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getConversation(userId: string, convId: string): Promise<Conversation | null> {
  const [metaArr, history] = await Promise.all([
    redis().get<ConversationMeta[]>(indexKey(userId)),
    redis().get<StoredMessage[]>(convKey(userId, convId)),
  ]);
  const meta = (metaArr ?? []).find((m) => m.id === convId);
  if (!meta) return null;
  return { meta, history: history ?? [] };
}

export async function createConversation(userId: string, brandId: string): Promise<ConversationMeta> {
  const now = Date.now();
  const meta: ConversationMeta = {
    id: crypto.randomUUID(),
    title: "Nouvelle conversation",
    brandId,
    createdAt: now,
    updatedAt: now,
  };
  const existing = (await redis().get<ConversationMeta[]>(indexKey(userId))) ?? [];
  await Promise.all([
    redis().set(indexKey(userId), [meta, ...existing]),
    redis().set(convKey(userId, meta.id), []),
  ]);
  return meta;
}

export async function saveHistory(userId: string, convId: string, history: StoredMessage[]): Promise<void> {
  await redis().set(convKey(userId, convId), history);
}

export async function updateMeta(
  userId: string,
  convId: string,
  patch: Partial<Pick<ConversationMeta, "title" | "updatedAt">>,
): Promise<void> {
  const arr = (await redis().get<ConversationMeta[]>(indexKey(userId))) ?? [];
  const next = arr.map((m) => (m.id === convId ? { ...m, ...patch } : m));
  await redis().set(indexKey(userId), next);
}

export async function deleteConversation(userId: string, convId: string): Promise<void> {
  const arr = (await redis().get<ConversationMeta[]>(indexKey(userId))) ?? [];
  await Promise.all([
    redis().set(
      indexKey(userId),
      arr.filter((m) => m.id !== convId),
    ),
    redis().del(convKey(userId, convId)),
  ]);
}
