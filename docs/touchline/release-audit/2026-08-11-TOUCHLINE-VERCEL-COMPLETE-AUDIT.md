# TouchLine — Vercel audit (read-only)

**Observed:** 2026-08-11T13:05:29Z
**Scope:** dashboard observation only. No setting, environment variable, domain, deployment, Git integration, billing state, database or production route was changed.

## Project identity

| Item | Observed value |
|---|---|
| Team | `Fifa Agent Plataform` |
| Plan | Pro |
| Project | `touchline-arena-official` |
| Project ID | `prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM` |
| Repository | `luizeuropemalta-commits/touchline-football-platform` |
| Production branch | `main` |
| Current production deployment | Ready, commit `304d5bb` (`test(arena): cover scheduled premium rail state`) |
| Production alias | `touchline.com.br`, `www.touchline.com.br` |
| Runtime | Node.js 24.x |
| Build machine | Standard, 4 vCPU / 8 GB |

The dashboard overview reported an error rate of **0%** for the currently displayed six-hour observability window (809 edge requests and 227 function invocations). This is an observation, not a substitute for release validation.

## Deployment and Git gate

- Git is connected and Vercel states that a push to `main` updates production.
- No deploy hooks are configured.
- Deployment Checks are **not configured**.
- The current dashboard lists six active branches out of seven; this is a cleanup-review item, not evidence that a branch or deployment is safe to delete.
- The repository now contains `vercel-build`, which runs the local `verify:release` gate before `next build`. That command must be confirmed as the effective dashboard build command before a promotion; the dashboard showed the Build Command field but not its resolved value in the accessible view.

## Plan, billing and observed usage

The project is on Vercel **Pro**. The dashboard's Aug 4–Sep 4 billing-period
view showed an infrastructure subtotal of **$5.24** (data may be up to one
hour old):

| Product | Observed usage | Observed charge |
|---|---:|---:|
| Fast Data Transfer | 14 GB / 1 TB | $0.00 |
| Edge Requests | 89.87K / 10M | $0.00 |
| Function Invocations | 79.96K | $0.05 |
| Fluid Active CPU | 37 minutes | $0.09 |
| Fluid Provisioned Memory | 7.72 GB hours | $0.09 |
| Fast Origin Transfer | 451 MB | $0.03 |
| Observability Events | 330.11K | $0.40 |
| Build CPU Minutes | 24 hours | $4.59 |

No spend limit, billing setting or plan was changed. The highest observed
charge is build CPU time; this is a monitoring item, not evidence of an
overage or of a production fault.

## Domains

| Domain | Dashboard status | Gate |
|---|---|---|
| `touchline.com.br` | Production; **DNS Change Recommended** | P1 — inspect the supplied DNS recommendation before changing records. |
| `www.touchline.com.br` | Production; **DNS Change Recommended** | P1 — inspect the supplied DNS recommendation before changing records. |
| `touchline-arena-official.vercel.app` | Production; Valid Configuration | Keep as technical alias; no change made. |

No DNS, alias or redirect was changed. The canonical site route must be smoke-tested after the DNS recommendation is understood; this audit does not authorize a DNS edit.

The dashboard's exact read-only recommendation is:

- apex `touchline.com.br`: `A @ → 216.150.1.1`;
- `www.touchline.com.br`: `CNAME www → 057a678f07fe227c.vercel-dns-017.com.`

Vercel states that the existing legacy records continue to work while it
expands the IP range. This is therefore a planned DNS-maintenance action, not
evidence of an outage. It still requires confirmation of the authoritative DNS
provider and explicit approval before any record change.

At 2026-08-11T13:24:09Z, a read-only HTTPS header check confirmed
`https://touchline.com.br` responds `200` from Vercel with HSTS, and
`https://www.touchline.com.br` responds `308` to the canonical host. This
confirms the currently deployed alias/redirect path; it does not supersede the
dashboard's DNS recommendation or validate the unpublished local candidate.

## Environment-variable names and scopes

Values were deliberately not opened or recorded. The accessible page showed these relevant names/scopes:

- Production: `TOUCHLINE_OWNER_EMAILS`, `NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `TOUCHLINE_SITE_OFFLINE`.
- Preview: `NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `TOUCHLINE_CURRENT_SEASON`, `TOUCHLINE_SITE_OFFLINE`, `FOOTBALL_DATA_SYNC_SECRET`, `FOOTBALL_DATA_VALIDATION_SECRET`, `FOOTBALL_DATA_PROVIDER`, `SPORTMONKS_STARTER_CLUB_ID`, `SPORTMONKS_STARTER_LEAGUE_ID`, `SPORTMONKS_BASE_URL`, `SPORTMONKS_API_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

Gates:

1. Do not infer effective configuration from names alone.
2. Confirm production has exactly the required runtime configuration during an authorized release check, without printing secrets.
3. Keep provider and service-role variables out of any public client bundle.
4. Do not use Preview as a substitute for the protected production/card-publication gate.

## Logs and observability

The Vercel Logs page showed zero warnings, errors and fatal events for its visible timeline. One observed request was `GET /wp-admin/install.php` to `touchline.com.br`; that is ordinary hostile/background web traffic, not an application route or an error. No runtime card, ClubHub, Arena, Match Centre, authentication or image failure was visible in the observed window.

## Health result

**Health:** no unexplained Vercel P0 was observed.
**P1 gates:** DNS recommendations for both public domains; no deployment checks configured; effective build command and production environment still require a release-time verification.
**Commercial suitability:** Pro plan is provisioned. Billing/usage limits were not changed and require a separate owner review in the team billing/usage surface if the warning emails concern spend or limits.

## Release conclusion

This completes a read-only Vercel checkpoint and permits continued **local** card-publication work. It does **not** authorize a deployment, migration, environment change, DNS change, production write, Stripe change or data import.
