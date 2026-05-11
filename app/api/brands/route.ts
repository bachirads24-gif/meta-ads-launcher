import { NextResponse } from "next/server";
import { listBrands, saveBrand, deleteBrand, newBrandId, type Brand } from "@/lib/brands";

export async function GET() {
  const brands = await listBrands();
  return NextResponse.json({ brands });
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Brand>;
  const brand: Brand = {
    id: body.id || newBrandId(),
    name: (body.name ?? "").trim(),
    adAccountId: (body.adAccountId ?? "").trim().replace(/^act_/, ""),
    pageId: (body.pageId ?? "").trim(),
    pixelId: (body.pixelId ?? "").trim(),
  };
  if (!brand.name || !brand.adAccountId || !brand.pageId || !brand.pixelId) {
    return NextResponse.json({ error: "Tous les champs sont requis" }, { status: 400 });
  }
  await saveBrand(brand);
  return NextResponse.json({ brand });
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id manquant" }, { status: 400 });
  await deleteBrand(id);
  return NextResponse.json({ ok: true });
}
