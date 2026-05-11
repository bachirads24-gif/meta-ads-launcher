import { NextResponse } from "next/server";
import {
  listBrandsPublic,
  getBrandWithToken,
  saveBrand,
  deleteBrand,
  newBrandId,
  type Brand,
} from "@/lib/brands";

export async function GET() {
  const brands = await listBrandsPublic();
  return NextResponse.json({ brands });
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Brand>;
  const id = body.id || newBrandId();
  const existing = body.id ? await getBrandWithToken(body.id) : null;

  const incomingToken = (body.accessToken ?? "").trim();
  const accessToken = incomingToken || existing?.accessToken || "";

  const brand: Brand = {
    id,
    name: (body.name ?? "").trim(),
    adAccountId: (body.adAccountId ?? "").trim().replace(/^act_/, ""),
    pageId: (body.pageId ?? "").trim(),
    pixelId: (body.pixelId ?? "").trim(),
    accessToken,
  };

  if (!brand.name || !brand.adAccountId || !brand.pageId || !brand.pixelId) {
    return NextResponse.json({ error: "Tous les champs sont requis" }, { status: 400 });
  }
  if (!brand.accessToken) {
    return NextResponse.json({ error: "Token d'accès Meta requis" }, { status: 400 });
  }
  await saveBrand(brand);
  // Don't echo the token back to the browser.
  const { accessToken: _t, ...safe } = brand;
  return NextResponse.json({ brand: { ...safe, hasToken: true } });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id manquant" }, { status: 400 });
  await deleteBrand(id);
  return NextResponse.json({ ok: true });
}
