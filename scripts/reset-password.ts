import { readFileSync } from "node:fs";
import { Redis } from "@upstash/redis";
import { hashPassword, type User } from "../lib/users";

function loadEnvLocal(): void {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    console.warn("[reset-password] .env.local not found, relying on shell env");
  }
}

async function main() {
  loadEnvLocal();

  const [, , username, newPassword] = process.argv;
  if (!username || !newPassword) {
    console.error("Usage: npx tsx scripts/reset-password.ts <username> <newPassword>");
    process.exit(1);
  }

  const redis = Redis.fromEnv();
  const users = (await redis.get<User[]>("users")) ?? [];
  const target = users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  if (!target) {
    console.error(`User "${username}" not found. Existing users:`, users.map((u) => u.username));
    process.exit(1);
  }

  const { hash, salt } = hashPassword(newPassword);
  target.passwordHash = hash;
  target.passwordSalt = salt;
  await redis.set("users", users);

  console.log(`Password reset for "${target.username}" (isAdmin=${target.isAdmin}).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
