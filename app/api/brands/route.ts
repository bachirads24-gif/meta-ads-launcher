import { NextResponse } from "next/server";
import {
  listBrandsPublic,
  getBrandWithToken,
  saveBrand,
  deleteBrand,
  newBrandId,
  type Brand,
} from "@/lib/brands";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const all = await listBrandsPublic();
  const brands = user.isAdmin ? all : all.filter((b) => user.brandIds.includes(b.id));
  return NextResponse.json({ brands });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Admin requis" }, { status: 403 });

  const body = (await req.json()) as Partial<Brand>;
  const id = body.id || newBrandId();
  const existing = body.id ? await getBrandWithToken(body.id) : null;

  const incomingToken = (body.accessToken ?? "").trim();
  const accessToken = incomingToken || existing?.accessToken || "";

  const brand: Brand = {
    id,
    name: (body.name ?? "").trim(),
    pageId: (body.pageId ?? "").trim(),
    accessToken,
  };

  if (!brand.name || !brand.pageId) {
    return NextResponse.json({ error: "Tous les champs sont requis" }, { status: 400 });
  }
  if (!brand.accessToken) {
    return NextResponse.json({ error: "Token d'accès Meta requis" }, { status: 400 });
  }
  await saveBrand(brand);
  const { accessToken: _t, ...safe } = brand;
  return NextResponse.json({ brand: { ...safe, hasToken: true } });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Admin requis" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id manquant" }, { status: 400 });
  await deleteBrand(id);
  return NextResponse.json({ ok: true });
}
