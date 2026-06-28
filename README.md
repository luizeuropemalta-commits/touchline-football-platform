# Touchline

Phase 1 of a premium SaaS operating system for football agencies.

## Included

- Email/password registration and login
- Google OAuth and password reset
- Supabase SSR session handling and protected routes
- Multi-tenant PostgreSQL schema with row-level security
- Executive dashboard
- Player Vault roster, search, profiles, stats, documents, videos and notes
- Global club recruitment network with shortlists and player requests
- Agent reputation, rankings, objectives and achievements
- Academy talent distribution and scouting interest workflows
- Qualified investment opportunities and private commitment rooms
- Professional connections and an authenticated football social feed
- Auditable AI conversations for contracts, valuation, scouting and regulation
- Stripe subscriptions with monthly/yearly plans, secure checkout, customer portal, invoice history, payment alerts and tier-based access control
- Responsive desktop/mobile application shell

## Local setup

1. Copy `.env.example` to `.env.local` and add Supabase credentials.
2. Run the migrations in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_global_ecosystem.sql`
   - `supabase/migrations/003_stripe_billing.sql`
3. Enable Google in Supabase Authentication providers and add `/auth/callback` to redirect URLs.
4. Create Stripe products/prices for each plan and add the price IDs to `.env.local`.
5. Enable the Stripe Customer Portal so customers can switch plans, update payment methods, cancel and download invoices.
6. Add a Stripe webhook endpoint at `/api/stripe/webhook` with these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.trial_will_end`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `invoice.payment_action_required`
7. Run `pnpm dev`.

For local Stripe webhook testing:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Without Supabase environment variables the app starts in preview mode: authentication actions route into the seeded interface.

## Billing architecture

- Stripe Checkout creates new subscriptions.
- Stripe webhooks are the source of truth for subscription, invoice and payment-alert state.
- Stripe Customer Portal handles plan switching, upgrades, downgrades, cancellation and payment method updates.
- Supabase row-level security lets users read their own billing state while service-role webhooks perform authoritative writes.

## Optional football data sync

Touchline is prepared for daily player-data sync through Sportmonks, the only active football data API provider.

1. Create a Sportmonks account with football data access.
2. Copy your server-side API token.
3. Add these variables in Vercel:

   ```bash
   FOOTBALL_DATA_PROVIDER=sportmonks
   SPORTMONKS_API_TOKEN=
   SPORTMONKS_BASE_URL=https://api.sportmonks.com/v3/football
   MARKET_SYNC_SECRET=
   CRON_SECRET=
   ```

4. In Supabase, apply:

   ```text
   supabase/migrations/004_external_market_sync.sql
   ```

5. Vercel Cron calls the football data sync routes daily.

Transfermarkt IDs and links may remain as identity/reference fields, but football data enrichment must flow through the Sportmonks-backed provider layer.

## Production launch guide

This section is the step-by-step checklist for launching Touchline online without rebuilding the app from scratch.

## Temporary Vercel preview deployment

Use this path when you want to test Touchline online before buying a custom domain. The app will run on a temporary Vercel URL such as:

```text
https://your-project-name.vercel.app
```

For this preview, use:

- Vercel temporary domain
- Supabase production or staging project
- Stripe test mode
- Test price IDs
- Test webhook secret

### 1. Create the GitHub repository

1. Go to GitHub and create a new private repository.
2. Name it something like `touchline-platform`.
3. Do not initialize the repository with a README, license or `.gitignore` if this project already has files locally.
4. From the project folder, run:

   ```bash
   git init
   git add .
   git commit -m "Prepare Touchline preview deployment"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/touchline-platform.git
   git push -u origin main
   ```

5. Confirm the files appear in GitHub.

Important: never commit `.env.local`, Stripe secret keys, Supabase service-role keys or private data.

### 2. Connect the repository to Vercel

1. Go to Vercel.
2. Click `Add New` → `Project`.
3. Import the GitHub repository.
4. Use these settings:
   - Framework preset: `Next.js`
   - Install command: `pnpm install`
   - Build command: `pnpm build`
   - Output directory: default
5. Do not add a custom domain yet.
6. Add the environment variables listed below.
7. Deploy.
8. After deployment, copy the Vercel URL. It will look like:

   ```text
   https://touchline-platform.vercel.app
   ```

Use this URL anywhere the app needs a public callback, return URL or webhook URL.

### 3. Create and connect Supabase

1. Create a Supabase project for preview testing.
2. Copy:
   - Project URL
   - anon public key
   - service-role key
3. In Supabase SQL Editor, run migrations in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_global_ecosystem.sql`
   - `supabase/migrations/003_stripe_billing.sql`
4. In Supabase Authentication settings:
   - Enable email/password auth.
   - Enable Google OAuth only if you want to test Google login.
   - Set Site URL to your Vercel URL:

     ```text
     https://touchline-platform.vercel.app
     ```

   - Add redirect URL:

     ```text
     https://touchline-platform.vercel.app/auth/callback
     ```

5. Add Supabase values to Vercel environment variables:

   ```bash
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=false
   SUPABASE_SERVICE_ROLE_KEY=
   ```

6. Redeploy Vercel after adding or changing Supabase variables.

The app is a Next.js app and reads Supabase from `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Do not use `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` for this project.

Set `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=false` unless Google is enabled inside Supabase Auth Providers. When Google is ready, switch it to `true` and redeploy.

### 4. Connect Stripe test mode

Use Stripe test mode first. Do not use live keys for preview testing.

1. Open Stripe Dashboard.
2. Switch to `Test mode`.
3. Create test products and recurring prices for:

   | Plan | Monthly | Yearly |
   | --- | ---: | ---: |
   | Starter Agent | €29/month | €290/year |
   | Pro Agent | €79/month | €790/year |
   | Elite Agency | €199/month | €1,990/year |
   | Club Basic | €299/month | €2,990/year |
   | Club Pro | €699/month | €6,990/year |
   | Club Elite | €1,499/month | €14,990/year |
   | Academy | €99/month | €990/year |
   | Founder Plan | — | €199/year |

4. Copy each test `price_` ID into Vercel.
5. Add your test secret key:

   ```bash
   STRIPE_SECRET_KEY=sk_test_...
   ```

6. Create a test webhook endpoint in Stripe:

   ```text
   https://touchline-platform.vercel.app/api/stripe/webhook
   ```

7. Select these webhook events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.trial_will_end`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `invoice.payment_action_required`
8. Copy the test webhook signing secret:

   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

9. Enable the Stripe Customer Portal in test mode and allow:
   - Plan switching
   - Payment method updates
   - Subscription cancellation
   - Invoice history
10. Redeploy Vercel after adding Stripe variables.

### 5. Vercel preview environment variables

Use these values in Vercel for the temporary preview deployment:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=false
SUPABASE_SERVICE_ROLE_KEY=

NEXT_PUBLIC_APP_URL=https://touchline-platform.vercel.app

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_TRIAL_DAYS=14
STRIPE_AUTOMATIC_TAX=false

STRIPE_PRICE_STARTER_AGENT_MONTHLY=price_...
STRIPE_PRICE_STARTER_AGENT_YEARLY=price_...
STRIPE_PRICE_PRO_AGENT_MONTHLY=price_...
STRIPE_PRICE_PRO_AGENT_YEARLY=price_...
STRIPE_PRICE_ELITE_AGENCY_MONTHLY=price_...
STRIPE_PRICE_ELITE_AGENCY_YEARLY=price_...

STRIPE_PRICE_CLUB_BASIC_MONTHLY=price_...
STRIPE_PRICE_CLUB_BASIC_YEARLY=price_...
STRIPE_PRICE_CLUB_PRO_MONTHLY=price_...
STRIPE_PRICE_CLUB_PRO_YEARLY=price_...
STRIPE_PRICE_CLUB_ELITE_MONTHLY=price_...
STRIPE_PRICE_CLUB_ELITE_YEARLY=price_...

STRIPE_PRICE_ACADEMY_MONTHLY=price_...
STRIPE_PRICE_ACADEMY_YEARLY=price_...
STRIPE_PRICE_FOUNDER_YEARLY=price_...
```

### 6. Test the preview online

After deployment, open:

```text
https://touchline-platform.vercel.app
```

Test this flow:

1. Open `/pricing`.
2. Register a test user.
3. Log in.
4. Open `/dashboard`.
5. Try a locked route like `/ai`, `/deals` or `/investors`.
6. Confirm the app redirects to pricing or upgrade when subscription access is missing.
7. Go back to `/pricing`.
8. Select `Pro Agent`.
9. Complete checkout using a Stripe test card:

   ```text
   4242 4242 4242 4242
   ```

   Use any future expiry date, any CVC and any valid postal code.

10. Return to `/subscription`.
11. Open `/billing`.
12. Confirm the plan, invoice and subscription status appear after Stripe webhook delivery.
13. Test Stripe Customer Portal from `/billing`.
14. Upgrade, downgrade or cancel in test mode.
15. Confirm protected routes update based on the subscription tier.

### 7. Preview troubleshooting

- If checkout says billing is not configured, check `STRIPE_SECRET_KEY` and all Stripe price IDs in Vercel.
- If checkout succeeds but the app does not unlock, check Stripe webhook delivery logs.
- If auth redirects fail, check Supabase Site URL and redirect URLs.
- If `/billing` has no invoices, wait a few seconds and check whether `invoice.paid` reached the webhook.
- If Google login fails, confirm the Google OAuth callback is configured in both Google Cloud and Supabase.
- If environment variables were changed, redeploy Vercel.

### 8. Moving from preview URL to custom domain later

When you buy a domain later, update only these areas:

1. Add the custom domain in Vercel.
2. Change `NEXT_PUBLIC_APP_URL` to the custom domain.
3. Update Supabase Site URL and redirect URLs.
4. Update Stripe webhook endpoint to the custom domain.
5. Add live Stripe keys and live price IDs when ready for real payments.
6. Redeploy Vercel.

### 1. GitHub setup

1. Create a new private GitHub repository.
2. From the project folder, initialize Git if it is not already initialized:

   ```bash
   git init
   git add .
   git commit -m "Initial Touchline production build"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPOSITORY.git
   git push -u origin main
   ```

3. Protect the `main` branch in GitHub:
   - Require pull requests before merging.
   - Require status checks before merging once Vercel checks are connected.
   - Restrict force pushes.
4. Do not commit `.env.local`, Stripe secrets, Supabase service-role keys, production database dumps or private customer data.

### 2. Vercel deployment setup

1. Create a Vercel account or open your existing Vercel dashboard.
2. Import the GitHub repository.
3. Use these project settings:
   - Framework preset: `Next.js`
   - Build command: `pnpm build`
   - Install command: `pnpm install`
   - Output directory: leave default
   - Node.js version: latest Vercel-supported LTS
4. Add all production environment variables listed in the environment checklist below.
5. Deploy once with production Stripe keys only after Supabase migrations are complete.
6. After the first successful deployment, copy the production URL. You will use it in Supabase, Stripe and domain settings.

### 3. Supabase production setup

1. Create a new production Supabase project.
2. Save these values:
   - Project URL
   - anon public key
   - service-role key
3. In Supabase SQL Editor, run migrations in this exact order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_global_ecosystem.sql`
   - `supabase/migrations/003_stripe_billing.sql`
4. Confirm Row Level Security is enabled on production tables.
5. In Authentication settings:
   - Enable email/password login.
   - Enable Google OAuth if you want Google login in production.
   - Set Site URL to your production domain, for example `https://yourdomain.com`.
   - Add redirect URLs:
     - `https://yourdomain.com/auth/callback`
     - `https://your-vercel-project.vercel.app/auth/callback`
6. Configure email templates for:
   - Confirm signup
   - Password reset
   - Magic/auth recovery links if enabled later
7. Turn on backups and point-in-time recovery if available on your Supabase plan.

### 4. Stripe production setup

1. Complete Stripe business verification.
2. Create products and recurring prices for every plan:

   | Plan | Monthly | Yearly |
   | --- | ---: | ---: |
   | Starter Agent | €29/month | €290/year |
   | Pro Agent | €79/month | €790/year |
   | Elite Agency | €199/month | €1,990/year |
   | Club Basic | €299/month | €2,990/year |
   | Club Pro | €699/month | €6,990/year |
   | Club Elite | €1,499/month | €14,990/year |
   | Academy | €99/month | €990/year |
   | Founder Plan | — | €199/year |

3. Copy every live `price_` ID into Vercel environment variables.
4. Enable Stripe Customer Portal and allow:
   - Plan switching
   - Upgrade and downgrade
   - Payment method updates
   - Subscription cancellation
   - Invoice downloads
5. Create a live webhook endpoint:

   ```text
   https://yourdomain.com/api/stripe/webhook
   ```

6. Subscribe the webhook to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.trial_will_end`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `invoice.payment_action_required`
7. Copy the live webhook signing secret into `STRIPE_WEBHOOK_SECRET`.
8. Keep test-mode keys and live-mode keys separate. Production Vercel must use live keys.

### 5. Environment variables checklist

Add these in Vercel Project Settings → Environment Variables.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=false
SUPABASE_SERVICE_ROLE_KEY=

NEXT_PUBLIC_APP_URL=https://yourdomain.com

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_TRIAL_DAYS=14
STRIPE_AUTOMATIC_TAX=false

STRIPE_PRICE_STARTER_AGENT_MONTHLY=
STRIPE_PRICE_STARTER_AGENT_YEARLY=
STRIPE_PRICE_PRO_AGENT_MONTHLY=
STRIPE_PRICE_PRO_AGENT_YEARLY=
STRIPE_PRICE_ELITE_AGENCY_MONTHLY=
STRIPE_PRICE_ELITE_AGENCY_YEARLY=

STRIPE_PRICE_CLUB_BASIC_MONTHLY=
STRIPE_PRICE_CLUB_BASIC_YEARLY=
STRIPE_PRICE_CLUB_PRO_MONTHLY=
STRIPE_PRICE_CLUB_PRO_YEARLY=
STRIPE_PRICE_CLUB_ELITE_MONTHLY=
STRIPE_PRICE_CLUB_ELITE_YEARLY=

STRIPE_PRICE_ACADEMY_MONTHLY=
STRIPE_PRICE_ACADEMY_YEARLY=
STRIPE_PRICE_FOUNDER_YEARLY=
```

Important rules:

- `NEXT_PUBLIC_APP_URL` must be the final production domain.
- `STRIPE_SECRET_KEY` must be a live secret key for production.
- `SUPABASE_SERVICE_ROLE_KEY` must never be exposed in client-side code.
- Rotate keys immediately if they are ever shared publicly.

### 6. Domain connection guide

1. Buy or choose the production domain.
2. In Vercel, open Project Settings → Domains.
3. Add your domain, for example:
   - `yourdomain.com`
   - `www.yourdomain.com`
4. Follow Vercel DNS instructions:
   - Add the required `A` record for the apex domain.
   - Add the required `CNAME` record for `www`.
5. Wait for SSL to become active in Vercel.
6. Update:
   - `NEXT_PUBLIC_APP_URL=https://yourdomain.com`
   - Supabase Site URL
   - Supabase redirect URLs
   - Stripe webhook endpoint
   - Stripe Customer Portal return URL settings if configured
7. Redeploy Vercel after environment changes.

### 7. Security checklist

- Keep Supabase service-role key server-only.
- Keep Stripe secret key and webhook secret server-only.
- Verify Supabase Row Level Security policies are active.
- Verify protected app routes redirect logged-out users to `/login`.
- Verify billing-only data is readable only by the owning user.
- Use HTTPS only in production.
- Enable GitHub branch protection.
- Use strong passwords and 2FA for GitHub, Vercel, Supabase and Stripe.
- Restrict Supabase dashboard access to trusted admins.
- Review Stripe webhook logs after first checkout.
- Never manually grant paid access without a matching Stripe subscription record unless you intentionally create an internal admin flow later.
- Add privacy policy, terms of service and refund policy before taking real customers.

### 8. Database migration checklist

Run migrations once against the production Supabase project:

```text
001_initial_schema.sql
002_global_ecosystem.sql
003_stripe_billing.sql
```

After running migrations, verify:

- `users`, `agencies`, `players`, `clubs`, `deals`, `contracts`, `invoices` exist.
- Ecosystem tables from migration `002` exist.
- Billing tables exist:
  - `billing_customers`
  - `billing_subscriptions`
  - `billing_invoices`
  - `billing_alerts`
  - `stripe_webhook_events`
  - `founder_plan_slots`
- RPC functions exist:
  - `reserve_founder_plan_slot`
  - `founder_plan_remaining`
- RLS policies are enabled.
- No production migration was run against the wrong project.

### 9. Route verification checklist

Public and auth routes:

- `/`
- `/pricing`
- `/login`
- `/register`
- `/forgot-password`
- `/auth/callback`

Protected platform routes:

- `/dashboard`
- `/players`
- `/players/marcus-rashford`
- `/deals`
- `/scouting`
- `/inbox`
- `/clubs`
- `/competition`
- `/investors`
- `/academies`
- `/feed`
- `/ai`
- `/objectives`
- `/achievements`
- `/contracts`
- `/invoices`
- `/settings`
- `/billing`
- `/subscription`
- `/upgrade`

Stripe API routes:

- `/api/stripe/checkout`
- `/api/stripe/portal`
- `/api/stripe/webhook`

Expected behavior:

- Logged-out users can view `/pricing`.
- Logged-out users are redirected from protected app routes to `/login`.
- Logged-in users without a paid subscription are sent to `/pricing` when opening locked subscription features.
- Logged-in users on Starter Agent are blocked from Pro/Elite systems and sent to `/upgrade`.
- Logged-in Pro Agent users can access AI, transfer market, club network, contracts and invoices.
- Logged-in Elite Agency users can access investor hub, agent league and premium systems.
- Billing portal opens from `/billing` only when a Stripe customer exists.

### 10. Launch checklist

Before going live:

- Production build passes locally.
- Vercel deployment succeeds.
- Supabase production migrations are complete.
- Stripe live products and prices are connected.
- Stripe webhook returns successful events.
- Google OAuth callback works on the production domain.
- Test signup works.
- Test login works.
- Test password reset works.
- Test checkout works with a real or Stripe-approved live test flow.
- Test subscription record appears in Supabase after checkout.
- Test invoice appears in `/billing`.
- Test locked feature redirects work.
- Test upgrade/downgrade through Stripe Customer Portal.
- Test cancellation through Stripe Customer Portal.
- Add legal pages before public launch:
  - Terms of service
  - Privacy policy
  - Cookie policy if needed
  - Refund/cancellation policy
- Prepare support email and customer onboarding flow.

### 11. Beta testing checklist

Run a controlled beta before public launch:

1. Invite 5 to 10 trusted football agents first.
2. Give each tester a clear task list:
   - Register
   - Log in
   - Explore Command Center
   - Open Player Vault
   - Review pricing
   - Try checkout in test mode or with a controlled live coupon
   - Open Billing Center
   - Try a locked feature
   - Report confusing screens
3. Track feedback in categories:
   - Login/auth issues
   - Payment issues
   - Subscription access issues
   - Mobile layout issues
   - UI clarity
   - Missing agent workflow
4. Watch logs:
   - Vercel Function logs
   - Supabase Auth logs
   - Stripe webhook delivery logs
5. Fix all critical onboarding and billing issues before inviting more users.
6. Expand to clubs, academies and scouts only after the agent billing flow is stable.

### 12. Production verification commands

Run these before every production release:

```bash
pnpm lint
pnpm build
```

If your local environment uses a sandbox where Turbopack cannot bind to internal ports, validate with:

```bash
next build --webpack
```

The current application has been validated with lint and a production build.
