import { Redis } from "@upstash/redis";

export interface Brand {
  id: string;
  name: string;
  pageId: string;
  accessToken: string;
}

export type PublicBrand = Omit<Brand, "accessToken"> & { hasToken: boolean };

const KEY = "brands";

function redis(): Redis {
  return Redis.fromEnv();
}

async function readAll(): Promise<Brand[]> {
  const brands = await redis().get<Brand[]>(KEY);
  return (brands ?? []).map((b) => ({ ...b, accessToken: b.accessToken ?? "" }));
}

function toPublic(b: Brand): PublicBrand {
  return {
    id: b.id,
    name: b.name,
    pageId: b.pageId,
    hasToken: !!b.accessToken,
  };
}

export async function listBrandsPublic(): Promise<PublicBrand[]> {
  const brands = await readAll();
  return brands.map(toPublic);
}

export async function getBrandWithToken(id: string): Promise<Brand | null> {
  const brands = await readAll();
  return brands.find((b) => b.id === id) ?? null;
}

export async function saveBrand(brand: Brand): Promise<void> {
  const brands = await readAll();
  const next = brands.filter((b) => b.id !== brand.id);
  next.push(brand);
  await redis().set(KEY, next);
}

export async function deleteBrand(id: string): Promise<void> {
  const brands = await readAll();
  await redis().set(
    KEY,
    brands.filter((b) => b.id !== id),
  );
}

export function newBrandId(): string {
  return crypto.randomUUID();
}
