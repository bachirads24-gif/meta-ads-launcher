import type { FunctionDeclaration } from "@google/genai";
import { getBrandWithToken } from "@/lib/brands";
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

export const ASSISTANT_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "list_ad_accounts",
    description:
      "Liste tous les comptes publicitaires Meta accessibles pour le brand sélectionné (via le token du brand).",
    parametersJsonSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "list_campaigns",
    description:
      "Liste les campagnes (actives par défaut) sur un ou tous les comptes publicitaires du brand. Retourne campaignId, name, status, dailyBudget, lifetimeBudget, objective.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        adAccountId: {
          type: "string",
          description: "ID du compte (sans préfixe act_). Si omis, fan-out sur tous les comptes.",
        },
        includeAll: {
          type: "boolean",
          description:
            "Si true, inclure les campagnes inactives/paused. Par défaut false (ACTIVE seulement).",
        },
      },
      required: [],
    },
  },
  {
    name: "get_campaign_insights",
    description:
      "Récupère les KPIs (spend, CPA, leads, CTR, CPM, CPC) sur la période et au niveau demandés. Niveau campaign/adset/ad.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        adAccountId: {
          type: "string",
          description: "ID du compte (sans préfixe act_). Si omis, fan-out sur tous les comptes.",
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
  {
    name: "get_ad_creative",
    description:
      "Récupère le contenu créatif d'une publicité : titre (headline), texte principal (primary text), URL de destination, nom de la vidéo.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        adId: { type: "string", description: "ID de la publicité Meta." },
      },
      required: ["adId"],
    },
  },
  {
    name: "compare_periods",
    description:
      "Compare deux périodes de performance (ex. last_7d vs previous 7d) pour repérer les tendances. Retourne le delta en % par campagne.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        adAccountId: { type: "string" },
        periodA: { type: "string", enum: DATE_PRESETS, description: "Période A (généralement récente)." },
        periodB: { type: "string", enum: DATE_PRESETS, description: "Période B (généralement antérieure)." },
      },
      required: ["periodA", "periodB"],
    },
  },
];

export interface ToolContext {
  user: User;
  brandId: string;
}

async function loadBrandAndToken(ctx: ToolContext) {
  if (!ctx.user.isAdmin && !ctx.user.brandIds.includes(ctx.brandId)) {
    throw new Error("Brand non autorisé pour cet utilisateur");
  }
  const brand = await getBrandWithToken(ctx.brandId);
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

async function listCampaignsForAccount(adAccountId: string, token: string, includeAll: boolean) {
  const params: Record<string, string> = {
    fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time",
    limit: "500",
  };
  if (!includeAll) {
    params.filtering = JSON.stringify([
      { field: "effective_status", operator: "IN", value: ["ACTIVE"] },
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
  const brand = await loadBrandAndToken(ctx);
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
    const includeAll = Boolean(args.includeAll ?? false);
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
        const camps = await listCampaignsForAccount(t.id, token, includeAll);
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
