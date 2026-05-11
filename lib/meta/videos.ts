import { graphGet, graphPostMultipart } from "./client";

export async function uploadVideo(adAccountId: string, file: Blob, filename: string): Promise<string> {
  const res = await graphPostMultipart<{ id: string }>(`/act_${adAccountId}/advideos`, {
    source: new File([file], filename, { type: file.type || "video/mp4" }),
    name: filename,
  });
  return res.id;
}

export async function waitForVideoReady(videoId: string, timeoutMs = 5 * 60_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const res = await graphGet<{ status?: { video_status?: string } }>(`/${videoId}`, {
      fields: "status",
    });
    const status = res.status?.video_status;
    if (status === "ready") return;
    if (status === "error") throw new Error(`Video ${videoId} failed processing`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`Video ${videoId} did not become ready within ${timeoutMs / 1000}s`);
}

interface Thumbnail {
  id: string;
  uri: string;
  is_preferred?: boolean;
}

export async function getVideoThumbnailUrl(videoId: string, retries = 6): Promise<string> {
  for (let i = 0; i < retries; i++) {
    const res = await graphGet<{ data?: Thumbnail[] }>(`/${videoId}/thumbnails`, {});
    const thumbs = res.data ?? [];
    if (thumbs.length > 0) {
      const preferred = thumbs.find((t) => t.is_preferred);
      return (preferred ?? thumbs[0]).uri;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`No thumbnails available for video ${videoId}`);
}
