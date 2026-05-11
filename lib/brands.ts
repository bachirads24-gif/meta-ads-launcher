import { Redis } from "@upstash/redis";

export interface Brand {
  id: string;
  name: string;
  adAccountId: string;
  pageId: string;
  pixelId: string;
}

const KEY = "brands";

function redis(): Redis {
  return Redis.fromEnv();
}

export async function listBrands(): Promise<Brand[]> {
  const brands = await redis().get<Brand[]>(KEY);
  return brands ?? [];
}

export async function getBrand(id: string): Promise<Brand | null> {
  const brands = await listBrands();
  return brands.find((b) => b.id === id) ?? null;
}

export async function saveBrand(brand: Brand): Promise<void> {
  const brands = await listBrands();
  const next = brands.filter((b) => b.id !== brand.id);
  next.push(brand);
  await redis().set(KEY, next);
}

export async function deleteBrand(id: string): Promise<void> {
  const brands = await listBrands();
  await redis().set(
    KEY,
    brands.filter((b) => b.id !== id),
  );
}

export function newBrandId(): string {
  return crypto.randomUUID();
}
