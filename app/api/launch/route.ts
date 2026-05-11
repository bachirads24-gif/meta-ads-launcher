import { del } from "@vercel/blob";
import { getBrand } from "@/lib/brands";
import { uploadVideo, waitForVideoReady, getVideoThumbnailUrl } from "@/lib/meta/videos";
import { createCampaign } from "@/lib/meta/campaigns";
import { createAdSet } from "@/lib/meta/adsets";
import { createVideoCreative } from "@/lib/meta/creatives";
import { createAd } from "@/lib/meta/ads";
import { MetaApiError } from "@/lib/meta/client";

export const runtime = "nodejs";
export const maxDuration = 300;

type Event =
  | { type: "video"; videoName: string; step: string }
  | { type: "video-done"; videoName: string; campaignId: string; adAccountId: string }
  | { type: "video-error"; videoName: string; error: string }
  | { type: "done" };

interface VideoInput {
  filename: string;
  blobUrl: string;
}

interface RunParams {
  brandId: string;
  headline: string;
  primaryText: string;
  landingUrl: string;
  urlMap?: Record<string, string>;
  dailyBudgetCents: number;
  bidCapCents: number;
  countries: string[];
  ageMin: number;
  ageMax: number;
  genders: number[];
  videos: VideoInput[];
}

function stripExt(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx > 0 ? filename.slice(0, idx) : filename;
}

function errMsg(e: unknown): string {
  if (e instanceof MetaApiError) return `${e.message} (HTTP ${e.status})`;
  if (e instanceof Error) return e.message;
  return String(e);
}

export async function POST(req: Request) {
  const params = (await req.json()) as RunParams;
  if (!params.videos || params.videos.length === 0) {
    return new Response("No videos provided", { status: 400 });
  }
  const brand = await getBrand(params.brandId);
  if (!brand) return new Response("Marque introuvable", { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: Event) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));

      for (const v of params.videos) {
        const videoName = stripExt(v.filename);
        try {
          send({ type: "video", videoName, step: "Récupération de la vidéo…" });
          const blobRes = await fetch(v.blobUrl);
          if (!blobRes.ok) throw new Error(`Blob fetch failed: ${blobRes.status}`);
          const fileBlob = await blobRes.blob();

          send({ type: "video", videoName, step: "Téléversement vers Meta…" });
          const videoId = await uploadVideo(brand.adAccountId, fileBlob, v.filename);

          send({ type: "video", videoName, step: "Traitement par Meta…" });
          await waitForVideoReady(videoId);

          send({ type: "video", videoName, step: "Création de la campagne…" });
          const campaignId = await createCampaign({
            adAccountId: brand.adAccountId,
            name: `[REVIEW] ${videoName}`,
            dailyBudgetCents: params.dailyBudgetCents,
          });

          send({ type: "video", videoName, step: "Création de l'ensemble de publicités…" });
          const adsetId = await createAdSet({
            adAccountId: brand.adAccountId,
            campaignId,
            pixelId: brand.pixelId,
            name: videoName,
            countries: params.countries,
            ageMin: params.ageMin,
            ageMax: params.ageMax,
            genders: params.genders,
            bidAmountCents: params.bidCapCents,
          });

          send({ type: "video", videoName, step: "Récupération de la miniature…" });
          const thumbnailUrl = await getVideoThumbnailUrl(videoId);

          send({ type: "video", videoName, step: "Création du visuel publicitaire…" });
          const perVideoUrl = params.urlMap?.[videoName] ?? params.landingUrl ?? "";
          const creativeId = await createVideoCreative({
            adAccountId: brand.adAccountId,
            pageId: brand.pageId,
            videoId,
            thumbnailUrl,
            headline: params.headline,
            primaryText: params.primaryText,
            landingUrl: perVideoUrl,
            name: videoName,
          });

          send({ type: "video", videoName, step: "Création de la publicité…" });
          await createAd({
            adAccountId: brand.adAccountId,
            adsetId,
            creativeId,
            name: videoName,
          });

          send({ type: "video-done", videoName, campaignId, adAccountId: brand.adAccountId });
        } catch (e) {
          send({ type: "video-error", videoName, error: errMsg(e) });
        } finally {
          // Clean up the blob whether the campaign creation succeeded or failed.
          del(v.blobUrl).catch(() => {});
        }
      }

      send({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
