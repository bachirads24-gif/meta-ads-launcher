# Meta Ads Launcher

Web app to batch-create Meta lead-gen campaigns from uploaded video creatives.
For each video: one campaign (CBO, bid cap), one adset (DZ broad, optimized for Pixel Lead), one ad — all created PAUSED with the `[REVIEW]` tag.

## Stack

- Next.js (App Router) + TypeScript + Tailwind v4
- Upstash Redis for the brand registry
- Vercel Blob for client-side video uploads (no 4.5MB function-body limit)
- Direct calls to the Meta Marketing API (Graph v21.0)

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in:
   - `SESSION_SECRET` — random 32-byte hex string for signing session cookies. Generate with `openssl rand -hex 32` or any random source. Pick once and keep stable.
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` — bootstrap admin credentials. Only used the first time the admin logs in; after that the admin record is persisted in Upstash and these env vars can be removed.
   - `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — populated automatically when you add Upstash Redis via Vercel Marketplace (Storage tab → Redis). Pull locally with `vercel env pull .env.local`.
   - `BLOB_READ_WRITE_TOKEN` — auto-injected when a Vercel Blob store is connected to the project.
2. `npm install`
3. `npm run dev`
4. Open <http://localhost:3000>, log in with the bootstrap admin credentials, then go to `/brands` to add brands and `/users` to add teammates with assigned brands.

## User roles

- **Admin** — can manage brands and users; sees all brands in the launcher.
- **User** — can only see and launch campaigns for the brands the admin assigned to them. `/brands` and `/users` redirect them to the launcher.

## Meta access tokens — per brand

Each brand record stores its own long-lived **System User access token** for that brand's Business Manager. The token is entered when the brand is added or edited at `/brands` and is never sent back to the browser.

To generate a token for a brand:

1. In that brand's Business Manager, add your central System User as a partner (or create a dedicated one).
2. Assign the System User access to the **Ad Account**, **Page**, and **Pixel** you'll use (Business Settings → System Users → Assign Assets).
3. Generate a token with scopes `ads_management`, `pages_read_engagement`, `business_management`.
4. Paste it into the `/brands` form alongside the IDs.

Tokens are stored encrypted at rest in Upstash and only loaded server-side by `/api/launch`.

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

Push to GitHub `main`; Vercel auto-deploys. Set `APP_PASSWORD` in Vercel project env vars, provision Upstash Redis and Vercel Blob under Storage — their env vars are injected automatically.
