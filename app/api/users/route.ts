import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  listUsersPublic,
  saveUser,
  deleteUser,
  newUserId,
  getUserById,
  findUserByUsername,
  hashPassword,
  countAdmins,
  type User,
} from "@/lib/users";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: NextResponse.json({ error: "Non authentifié" }, { status: 401 }) };
  if (!user.isAdmin) return { user, response: NextResponse.json({ error: "Admin requis" }, { status: 403 }) };
  return { user, response: null };
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;
  const users = await listUsersPublic();
  return NextResponse.json({ users });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;
  const me = guard.user!;

  const body = (await req.json()) as Partial<{
    id: string;
    username: string;
    password: string;
    brandIds: string[];
    isAdmin: boolean;
    telegramChatId: string;
  }>;

  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  const brandIds = Array.isArray(body.brandIds) ? body.brandIds : [];
  const isAdmin = !!body.isAdmin;
  const telegramChatId = (body.telegramChatId ?? "").trim();

  if (!username) return NextResponse.json({ error: "Nom d'utilisateur requis" }, { status: 400 });

  const existing = body.id ? await getUserById(body.id) : null;

  // Prevent removing admin from the last admin (which would lock out admin access).
  if (existing && existing.isAdmin && !isAdmin) {
    const admins = await countAdmins();
    if (admins <= 1) {
      return NextResponse.json({ error: "Impossible de retirer le dernier administrateur" }, { status: 400 });
    }
    if (existing.id === me.id) {
      return NextResponse.json({ error: "Vous ne pouvez pas retirer votre propre droit admin" }, { status: 400 });
    }
  }

  // Unique-username check (case-insensitive), allowing the same record to keep its username.
  const dup = await findUserByUsername(username);
  if (dup && dup.id !== existing?.id) {
    return NextResponse.json({ error: "Nom d'utilisateur déjà pris" }, { status: 400 });
  }

  let passwordHash = existing?.passwordHash ?? "";
  let passwordSalt = existing?.passwordSalt ?? "";
  if (password) {
    const h = hashPassword(password);
    passwordHash = h.hash;
    passwordSalt = h.salt;
  }
  if (!passwordHash) {
    return NextResponse.json({ error: "Mot de passe requis" }, { status: 400 });
  }

  const user: User = {
    id: existing?.id ?? newUserId(),
    username,
    passwordHash,
    passwordSalt,
    brandIds: isAdmin ? [] : brandIds,
    isAdmin,
    telegramChatId: telegramChatId || undefined,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  await saveUser(user);
  const { passwordHash: _h, passwordSalt: _s, ...safe } = user;
  return NextResponse.json({ user: safe });
}

export async function DELETE(req: Request) {
  const guard = await requireAdmin();
  if (guard.response) return guard.response;
  const me = guard.user!;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id manquant" }, { status: 400 });

  if (id === me.id) {
    return NextResponse.json({ error: "Vous ne pouvez pas vous supprimer vous-même" }, { status: 400 });
  }

  const target = await getUserById(id);
  if (target?.isAdmin) {
    const admins = await countAdmins();
    if (admins <= 1) {
      return NextResponse.json({ error: "Impossible de supprimer le dernier administrateur" }, { status: 400 });
    }
  }

  await deleteUser(id);
  return NextResponse.json({ ok: true });
}
