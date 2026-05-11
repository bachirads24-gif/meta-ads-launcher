# Meta Ads Launcher

Web app to batch-create Meta lead-gen campaigns from uploaded video creatives.
For each video: one campaign (CBO, bid cap), one adset (DZ broad, optimized for Pixel Lead), one ad — all created PAUSED with the `[REVIEW]` tag.

## Stack

- Next.js (App Router) + TypeScript + Tailwind v4
- Upstash Redis (via Vercel Marketplace) for the brand registry
- Direct calls to the Meta Marketing API (Graph v21.0)

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in:
   - `META_ACCESS_TOKEN` — long-lived System User token from Meta Business Manager, with `ads_management`, `pages_read_engagement`, `business_management` scopes, and access to every ad account / page / pixel you plan to use.
   - `APP_PASSWORD` — shared password for the team.
   - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — populated automatically when you add Upstash Redis via Vercel Marketplace (Storage tab → Redis). Pull locally with `vercel env pull .env.local`.
2. `npm install`
3. `npm run dev`
4. Open <http://localhost:3000>, log in, go to `/brands` and add at least one brand.

## Defaults (overridable per run)

| Setting | Value |
|---|---|
| Objective | `OUTCOME_LEADS` |
| Budget level | Campaign (CBO), $350/day |
| Bid strategy | `LOWEST_COST_WITH_BID_CAP`, $3.50 |
| Conversion location | Website (Pixel `Lead` event) |
| Targeting | Algeria, 18–65, all genders, broad |
| CTA | `ORDER_NOW` |
| Status | PAUSED |
| Naming | Campaign `[REVIEW] {videoName}`, adset/ad `{videoName}` |

## Deploy

Push to GitHub `main`; Vercel auto-deploys. Set `META_ACCESS_TOKEN` and `APP_PASSWORD` in the Vercel project's env vars, and provision Upstash Redis under Storage — the Upstash env vars are injected automatically.
