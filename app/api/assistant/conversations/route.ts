import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  createConversation,
  deleteConversation,
  listConversations,
} from "@/lib/assistant/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const conversations = await listConversations(user.id);
  return NextResponse.json({ conversations });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { brandId } = (await req.json()) as { brandId?: string };
  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });
  if (brandId === "*") {
    if (!user.isAdmin) {
      return NextResponse.json({ error: "Mode multi-marques réservé aux admins" }, { status: 403 });
    }
  } else if (!user.isAdmin && !user.brandIds.includes(brandId)) {
    return NextResponse.json({ error: "Brand non autorisé" }, { status: 403 });
  }
  const meta = await createConversation(user.id, brandId);
  return NextResponse.json({ conversation: meta });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });
  await deleteConversation(user.id, id);
  return NextResponse.json({ ok: true });
}
