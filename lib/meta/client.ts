export const GRAPH_VERSION = "v21.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

export class MetaApiError extends Error {
  constructor(public status: number, public payload: unknown, message: string) {
    super(message);
  }
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return text;
  }
}

function extractMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const err = (payload as {
      error?: {
        message?: string;
        error_user_title?: string;
        error_user_msg?: string;
        error_subcode?: number;
        code?: number;
        fbtrace_id?: string;
      };
    }).error;
    if (err) {
      const parts: string[] = [];
      if (err.error_user_title) parts.push(err.error_user_title);
      if (err.error_user_msg) parts.push(err.error_user_msg);
      else if (err.message) parts.push(err.message);
      if (err.code) parts.push(`code=${err.code}`);
      if (err.error_subcode) parts.push(`subcode=${err.error_subcode}`);
      if (err.fbtrace_id) parts.push(`trace=${err.fbtrace_id}`);
      if (parts.length > 0) return parts.join(" — ");
    }
  }
  return fallback;
}

export async function graphGet<T>(
  path: string,
  params: Record<string, string>,
  token: string,
): Promise<T> {
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  const payload = await parse(res);
  if (!res.ok) throw new MetaApiError(res.status, payload, extractMessage(payload, `GET ${path} failed`));
  return payload as T;
}

export async function graphPost<T>(
  path: string,
  body: Record<string, unknown>,
  token: string,
): Promise<T> {
  const form = new URLSearchParams();
  form.set("access_token", token);
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || v === null) continue;
    form.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    method: "POST",
    body: form,
    cache: "no-store",
  });
  const payload = await parse(res);
  if (!res.ok) {
    console.error(`[Meta] ${res.status} POST ${path}`, JSON.stringify(payload, null, 2));
    throw new MetaApiError(res.status, payload, extractMessage(payload, `POST ${path} failed`));
  }
  return payload as T;
}

export async function graphPostMultipart<T>(
  path: string,
  fields: Record<string, string | Blob>,
  token: string,
): Promise<T> {
  const form = new FormData();
  form.set("access_token", token);
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  const res = await fetch(`${GRAPH_BASE}${path}`, { method: "POST", body: form, cache: "no-store" });
  const payload = await parse(res);
  if (!res.ok) {
    console.error(`[Meta] ${res.status} POST ${path}`, JSON.stringify(payload, null, 2));
    throw new MetaApiError(res.status, payload, extractMessage(payload, `POST ${path} failed`));
  }
  return payload as T;
}
