import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { getBrandWithToken, listBrandsPublic } from "@/lib/brands";
import type { User } from "@/lib/users";
import { listAdAccounts } from "@/lib/meta/accounts";
import {
  fetchInsightsForAccount,
  type CampaignInsightRow,
  type DatePreset,
  type InsightLevel,
} from "@/lib/meta/insights";
import { graphGet } from "@/lib/meta/client";

const DATE_PRESETS: DatePreset[] = [
  "today",
  "yesterday",
  "last_3d",
  "last_7d",
  "last_14d",
  "last_30d",
  "last_90d",
  "this_month",
  "last_month",
  "maximum",
];

const BRAND_ID_PROP = {
  brandId: {
    type: "string",
    description:
      "ID du brand. Obligatoire en mode multi-marques (admin) si la conversation n'est pas verrouillée sur une marque. Sinon, omet ce champ pour utiliser le brand de la conversation.",
  },
};

export const ASSISTANT_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_brands",
      description:
        "Liste tous les brands accessibles à l'utilisateur (admin = tous ; user = ses brands attribués). Retourne id, name et le profil niche (industrie, public, offres, voix, mots-clés). Utilise-le en mode multi-marques pour savoir quel brandId passer aux autres outils.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_ad_accounts",
      description:
        "Liste tous les comptes publicitaires Meta accessibles pour un brand (via le token du brand).",
      parameters: {
        type: "object",
        properties: { ...BRAND_ID_PROP },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_campaigns",
      description:
        "Liste les campagnes du brand. Param `status` : 'active' (défaut), 'inactive' (en pause), ou 'all'. Pour les campagnes en pause/inactives, passe status:'inactive'.",
      parameters: {
        type: "object",
        properties: {
          ...BRAND_ID_PROP,
          adAccountId: {
            type: "string",
            description: "ID du compte (sans préfixe act_). Si omis, fan-out sur tous les comptes du brand.",
          },
          status: {
            type: "string",
            enum: ["active", "inactive", "all"],
            description:
              "Filtre par statut effectif. 'active' = ACTIVE seulement (défaut). 'inactive' = PAUSED seulement. 'all' = ACTIVE + PAUSED.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_campaign_insights",
      description:
        "Récupère les KPIs (spend, CPA, leads, CTR, CPM, CPC) sur la période et au niveau demandés. Niveau campaign/adset/ad.",
      parameters: {
        type: "object",
        properties: {
          ...BRAND_ID_PROP,
          adAccountId: {
            type: "string",
            description: "ID du compte (sans préfixe act_). Si omis, fan-out sur tous les comptes du brand.",
          },
          level: {
            type: "string",
            enum: ["campaign", "adset", "ad"],
            description: "Niveau d'agrégation. Par défaut campaign.",
          },
          datePreset: {
            type: "string",
            enum: DATE_PRESETS,
            description: "Période. Par défaut today.",
          },
          activeOnly: {
            type: "boolean",
            description: "Filtrer aux campagnes ACTIVE seulement. Par défaut true.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ad_creative",
      description:
        "Récupère le contenu créatif d'une publicité : titre (headline), texte principal (primary text), URL de destination, nom de la vidéo.",
      parameters: {
        type: "object",
        properties: {
          ...BRAND_ID_PROP,
          adId: { type: "string", description: "ID de la publicité Meta." },
        },
        required: ["adId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_periods",
      description:
        "Compare deux périodes de performance (ex. last_7d vs previous 7d) pour repérer les tendances. Retourne le delta en % par campagne.",
      parameters: {
        type: "object",
        properties: {
          ...BRAND_ID_PROP,
          adAccountId: { type: "string" },
          periodA: { type: "string", enum: DATE_PRESETS, description: "Période A (généralement récente)." },
          periodB: { type: "string", enum: DATE_PRESETS, description: "Période B (généralement antérieure)." },
        },
        required: ["periodA", "periodB"],
      },
    },
  },
];

export interface ToolContext {
  user: User;
  /** Default brand for the conversation. null in admin "all brands" mode. */
  defaultBrandId: string | null;
}

function resolveBrandId(args: Record<string, unknown>, ctx: ToolContext): string {
  const fromArg = typeof args.brandId === "string" ? args.brandId.trim() : "";
  const resolved = fromArg || ctx.defaultBrandId || "";
  if (!resolved) {
    throw new Error(
      "brandId requis : la conversation est en mode multi-marques. Appelle list_brands puis passe brandId à chaque outil.",
    );
  }
  return resolved;
}

async function loadBrandAndToken(brandId: string, user: User) {
  if (!user.isAdmin && !user.brandIds.includes(brandId)) {
    throw new Error("Brand non autorisé pour cet utilisateur");
  }
  const brand = await getBrandWithToken(brandId);
  if (!brand) throw new Error("Brand introuvable");
  if (!brand.accessToken) throw new Error("Token Meta non configuré pour ce brand");
  return brand;
}

interface CampaignRaw {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  start_time?: string;
}

type CampaignStatusFilter = "active" | "inactive" | "all";

async function listCampaignsForAccount(
  adAccountId: string,
  token: string,
  status: CampaignStatusFilter,
) {
  const params: Record<string, string> = {
    fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time",
    limit: "500",
  };
  if (status === "active") {
    params.filtering = JSON.stringify([
      { field: "effective_status", operator: "IN", value: ["ACTIVE"] },
    ]);
  } else if (status === "inactive") {
    params.filtering = JSON.stringify([
      { field: "effective_status", operator: "IN", value: ["PAUSED"] },
    ]);
  } else {
    params.filtering = JSON.stringify([
      { field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] },
    ]);
  }
  const res = await graphGet<{ data?: CampaignRaw[] }>(
    `/act_${adAccountId}/campaigns`,
    params,
    token,
  );
  return res.data ?? [];
}

function summarizeRow(r: CampaignInsightRow) {
  return {
    campaignId: r.campaignId,
    campaignName: r.name,
    adAccountId: r.adAccountId,
    adAccountName: r.adAccountName,
    adsetId: r.adsetId,
    adsetName: r.adsetName,
    adId: r.adId,
    adName: r.adName,
    spend: r.spend,
    leads: r.leads,
    cpa: r.cpa,
    ctr: r.ctr,
    cpm: r.cpm,
    cpc: r.cpc,
  };
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  if (name === "list_brands") {
    const all = await listBrandsPublic();
    const visible = ctx.user.isAdmin ? all : all.filter((b) => ctx.user.brandIds.includes(b.id));
    return {
      brands: visible.map((b) => ({
        id: b.id,
        name: b.name,
        industry: b.industry ?? null,
        audience: b.audience ?? null,
        offers: b.offers ?? null,
        voice: b.voice ?? null,
        keywords: b.keywords ?? null,
        hasToken: b.hasToken,
      })),
    };
  }

  const brandId = resolveBrandId(args, ctx);
  const brand = await loadBrandAndToken(brandId, ctx.user);
  const token = brand.accessToken;

  if (name === "list_ad_accounts") {
    const accounts = await listAdAccounts(token);
    return {
      adAccounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        active: a.accountStatus === 1,
      })),
    };
  }

  if (name === "list_campaigns") {
    const rawStatus = typeof args.status === "string" ? args.status : "active";
    const status: CampaignStatusFilter =
      rawStatus === "inactive" || rawStatus === "all" ? rawStatus : "active";
    const adAccountId = (args.adAccountId as string | undefined)?.replace(/^act_/, "");
    let targets: { id: string; name: string }[];
    if (adAccountId) {
      targets = [{ id: adAccountId, name: adAccountId }];
    } else {
      const accs = (await listAdAccounts(token)).filter((a) => a.accountStatus === 1);
      targets = accs.map((a) => ({ id: a.id, name: a.name }));
    }
    const results = await Promise.allSettled(
      targets.map(async (t) => {
        const camps = await listCampaignsForAccount(t.id, token, status);
        return { adAccountId: t.id, adAccountName: t.name, campaigns: camps };
      }),
    );
    const ok = results
      .filter((r): r is PromiseFulfilledResult<{ adAccountId: string; adAccountName: string; campaigns: CampaignRaw[] }> => r.status === "fulfilled")
      .map((r) => r.value);
    const errors = results
      .map((r, i) => (r.status === "rejected" ? { adAccountId: targets[i].id, error: r.reason instanceof Error ? r.reason.message : String(r.reason) } : null))
      .filter((x): x is { adAccountId: string; error: string } => x !== null);
    return { accounts: ok, errors };
  }

  if (name === "get_campaign_insights") {
    const level = (args.level as InsightLevel | undefined) ?? "campaign";
    const datePreset = (args.datePreset as DatePreset | undefined) ?? "today";
    const activeOnly = (args.activeOnly as boolean | undefined) ?? true;
    const adAccountId = (args.adAccountId as string | undefined)?.replace(/^act_/, "");

    let targets: { id: string; name: string }[];
    if (adAccountId) {
      targets = [{ id: adAccountId, name: adAccountId }];
    } else {
      const accs = (await listAdAccounts(token)).filter((a) => a.accountStatus === 1);
      targets = accs.map((a) => ({ id: a.id, name: a.name }));
    }

    const settled = await Promise.allSettled(
      targets.map((t) =>
        fetchInsightsForAccount(t.id, t.name, token, { level, datePreset, activeOnly }),
      ),
    );

    const rows: ReturnType<typeof summarizeRow>[] = [];
    const errors: { adAccountId: string; error: string }[] = [];
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") {
        rows.push(...r.value.map(summarizeRow));
      } else {
        errors.push({
          adAccountId: targets[i].id,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    });

    return { level, datePreset, rows, errors };
  }

  if (name === "get_ad_creative") {
    const adId = String(args.adId ?? "").trim();
    if (!adId) throw new Error("adId requis");
    const res = await graphGet<{
      id: string;
      name?: string;
      creative?: {
        id?: string;
        title?: string;
        body?: string;
        object_story_spec?: {
          video_data?: {
            video_id?: string;
            title?: string;
            message?: string;
            call_to_action?: { type?: string; value?: { link?: string } };
          };
        };
      };
    }>(
      `/${adId}`,
      { fields: "name,creative{id,title,body,object_story_spec}" },
      token,
    );
    const vd = res.creative?.object_story_spec?.video_data;
    return {
      adId: res.id,
      adName: res.name,
      headline: res.creative?.title ?? vd?.title ?? null,
      primaryText: res.creative?.body ?? vd?.message ?? null,
      landingUrl: vd?.call_to_action?.value?.link ?? null,
      videoId: vd?.video_id ?? null,
    };
  }

  if (name === "compare_periods") {
    const periodA = args.periodA as DatePreset;
    const periodB = args.periodB as DatePreset;
    const adAccountId = (args.adAccountId as string | undefined)?.replace(/^act_/, "");

    let targets: { id: string; name: string }[];
    if (adAccountId) {
      targets = [{ id: adAccountId, name: adAccountId }];
    } else {
      const accs = (await listAdAccounts(token)).filter((a) => a.accountStatus === 1);
      targets = accs.map((a) => ({ id: a.id, name: a.name }));
    }

    const fetchAll = async (preset: DatePreset) => {
      const settled = await Promise.allSettled(
        targets.map((t) => fetchInsightsForAccount(t.id, t.name, token, { datePreset: preset, activeOnly: false })),
      );
      const out: CampaignInsightRow[] = [];
      settled.forEach((r) => {
        if (r.status === "fulfilled") out.push(...r.value);
      });
      return out;
    };

    const [a, b] = await Promise.all([fetchAll(periodA), fetchAll(periodB)]);
    const indexB = new Map(b.map((r) => [r.campaignId, r]));
    const diffs = a.map((ra) => {
      const rb = indexB.get(ra.campaignId);
      const pct = (x: number, y: number) => (y === 0 ? null : ((x - y) / y) * 100);
      return {
        campaignId: ra.campaignId,
        campaignName: ra.name,
        adAccountName: ra.adAccountName,
        a: { spend: ra.spend, cpa: ra.cpa, leads: ra.leads, ctr: ra.ctr },
        b: rb ? { spend: rb.spend, cpa: rb.cpa, leads: rb.leads, ctr: rb.ctr } : null,
        deltaPct: rb
          ? {
              spend: pct(ra.spend, rb.spend),
              cpa: ra.cpa !== null && rb.cpa !== null ? pct(ra.cpa, rb.cpa) : null,
              leads: pct(ra.leads, rb.leads),
              ctr: pct(ra.ctr, rb.ctr),
            }
          : null,
      };
    });
    return { periodA, periodB, comparisons: diffs };
  }

  throw new Error(`Outil inconnu: ${name}`);
}
