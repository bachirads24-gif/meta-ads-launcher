import { Redis } from "@upstash/redis";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  brandIds: string[];
  isAdmin: boolean;
  telegramChatId?: string;
  createdAt: number;
}

export type PublicUser = Omit<User, "passwordHash" | "passwordSalt">;

const KEY = "users";

function redis(): Redis {
  return Redis.fromEnv();
}

async function readAll(): Promise<User[]> {
  const users = await redis().get<User[]>(KEY);
  return users ?? [];
}

async function writeAll(users: User[]): Promise<void> {
  await redis().set(KEY, users);
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = scryptSync(password, s, 64).toString("hex");
  return { hash, salt: s };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const computed = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, "hex");
  if (computed.length !== stored.length) return false;
  return timingSafeEqual(computed, stored);
}

export function toPublic(u: User): PublicUser {
  const { passwordHash: _h, passwordSalt: _s, ...rest } = u;
  return rest;
}

export async function listUsers(): Promise<User[]> {
  return readAll();
}

export async function listUsersPublic(): Promise<PublicUser[]> {
  return (await readAll()).map(toPublic);
}

export async function getUserById(id: string): Promise<User | null> {
  const users = await readAll();
  return users.find((u) => u.id === id) ?? null;
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const users = await readAll();
  const target = username.trim().toLowerCase();
  return users.find((u) => u.username.toLowerCase() === target) ?? null;
}

export async function saveUser(user: User): Promise<void> {
  const users = await readAll();
  const next = users.filter((u) => u.id !== user.id);
  next.push(user);
  await writeAll(next);
}

export async function deleteUser(id: string): Promise<void> {
  const users = await readAll();
  await writeAll(users.filter((u) => u.id !== id));
}

export function newUserId(): string {
  return crypto.randomUUID();
}

/**
 * If no users exist and the submitted credentials match ADMIN_USERNAME/ADMIN_PASSWORD,
 * create the admin user. Returns the created user, or null if no bootstrap was performed.
 */
export async function bootstrapAdminIfNeeded(
  username: string,
  password: string,
): Promise<User | null> {
  const envUser = process.env.ADMIN_USERNAME;
  const envPw = process.env.ADMIN_PASSWORD;
  if (!envUser || !envPw) return null;

  const users = await readAll();
  if (users.length > 0) return null;

  if (username.trim().toLowerCase() !== envUser.trim().toLowerCase()) return null;
  if (password !== envPw) return null;

  const { hash, salt } = hashPassword(password);
  const admin: User = {
    id: newUserId(),
    username: envUser.trim(),
    passwordHash: hash,
    passwordSalt: salt,
    brandIds: [],
    isAdmin: true,
    createdAt: Date.now(),
  };
  await writeAll([admin]);
  return admin;
}

export async function countAdmins(): Promise<number> {
  const users = await readAll();
  return users.filter((u) => u.isAdmin).length;
}
