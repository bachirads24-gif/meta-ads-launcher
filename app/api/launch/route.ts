import { del } from "@vercel/blob";
import { getBrandWithToken } from "@/lib/brands";
import { getCurrentUser } from "@/lib/auth";
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
  ageMin: number;
  ageMax: number;
  genders: number[];
  startTime?: string; // ISO 8601
  video: VideoInput;
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
  const user = await getCurrentUser();
  if (!user) return new Response("Non authentifié", { status: 401 });

  const params = (await req.json()) as RunParams;
  if (!params.video) return new Response("No video provided", { status: 400 });

  if (!user.isAdmin && !user.brandIds.includes(params.brandId)) {
    return new Response("Marque non autorisée", { status: 403 });
  }

  const brand = await getBrandWithToken(params.brandId);
  if (!brand) return new Response("Marque introuvable", { status: 400 });

  const v = params.video;
  const videoName = stripExt(v.filename);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: Event) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));

      if (!brand.accessToken) {
        send({
          type: "video-error",
          videoName,
          error: "Token Meta non configuré pour cette marque",
        });
        del(v.blobUrl).catch(() => {});
        send({ type: "done" });
        controller.close();
        return;
      }

      const token = brand.accessToken;

      try {
        send({ type: "video", videoName, step: "Récupération de la vidéo…" });
        const blobRes = await fetch(v.blobUrl);
        if (!blobRes.ok) throw new Error(`Blob fetch failed: ${blobRes.status}`);
        const fileBlob = await blobRes.blob();

        send({ type: "video", videoName, step: "Téléversement vers Meta…" });
        const videoId = await uploadVideo(brand.adAccountId, fileBlob, v.filename, token);

        send({ type: "video", videoName, step: "Traitement par Meta…" });
        await waitForVideoReady(videoId, token);

        send({ type: "video", videoName, step: "Création de la campagne…" });
        const campaignId = await createCampaign({
          adAccountId: brand.adAccountId,
          accessToken: token,
          name: `[REVIEW] ${videoName}`,
          dailyBudgetCents: params.dailyBudgetCents,
        });

        send({ type: "video", videoName, step: "Création de l'ensemble de publicités…" });
        const adsetId = await createAdSet({
          adAccountId: brand.adAccountId,
          accessToken: token,
          campaignId,
          pixelId: brand.pixelId,
          name: videoName,
          countries: ["DZ"],
          ageMin: params.ageMin,
          ageMax: params.ageMax,
          genders: params.genders,
          bidAmountCents: params.bidCapCents,
          startTime: params.startTime,
        });

        send({ type: "video", videoName, step: "Récupération de la miniature…" });
        const thumbnailUrl = await getVideoThumbnailUrl(videoId, token);

        send({ type: "video", videoName, step: "Création du visuel publicitaire…" });
        const perVideoUrl = params.urlMap?.[videoName] ?? params.landingUrl ?? "";
        const creativeId = await createVideoCreative({
          adAccountId: brand.adAccountId,
          accessToken: token,
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
          accessToken: token,
          adsetId,
          creativeId,
          name: videoName,
        });

        send({ type: "video-done", videoName, campaignId, adAccountId: brand.adAccountId });
      } catch (e) {
        send({ type: "video-error", videoName, error: errMsg(e) });
      } finally {
        del(v.blobUrl).catch(() => {});
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
