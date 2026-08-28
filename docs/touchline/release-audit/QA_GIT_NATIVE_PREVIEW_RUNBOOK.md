# TouchLine QA Git-native Preview runbook

Status: CURRENT

Use this path only for the functional QA application. It is not the inert
isolated Preview contract and it never authorizes Production changes.

## Fixed boundary

- Git branch: `qa`.
- Vercel environment: `Preview` with the branch scope `qa`.
- Deployment source: Git integration (`source=git`, `githubCommitRef=qa`).
- Server and public deployment mode: `qa-preview`.
- QA Supabase project ref: `xgxbwqxjssxxuihuwmgy`.
- Stable QA alias: `touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app`.
- Never use `vercel deploy` or a locally built CLI artifact for this flow:
  branch-scoped variables are selected by the Git integration contract.

## Names-only configuration check

Before pushing, inspect metadata only: variable name, `Preview` environment,
`qa` branch scope and presence. Never print or export values. The functional
contract requires these names:

- `NEXT_PUBLIC_TOUCHLINE_DEPLOYMENT_MODE`
- `TOUCHLINE_DEPLOYMENT_MODE`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_TOUCHLINE_AUTH_ORIGIN`
- `TOUCHLINE_QA_SUPABASE_PROJECT_REF`
- `TOUCHLINE_CARD_PUBLICATION_GATE`

`SPORTMONKS_API_TOKEN` and `TOUCHLINE_LIVE_SYNC_SECRET` are permitted only for
the existing functional QA provider/scheduler features. They remain
server-side secrets and branch-scoped to Preview/`qa`. Do not add provider,
payment or Production variables to make a build pass.

The two deployment-mode values must both be `qa-preview`; the public and
server Supabase URLs must resolve to the QA project ref above. The repository
enforces these relationships in `lib/touchlinePreview/isolation.ts` and fails
closed on missing, mismatched or extra application configuration.

## Git-native release

1. Record the current stable QA deployment ID, exact Git SHA, aliases and
   `READY` state as the rollback target. Do not record environment values.
2. Fetch `origin/qa` and prove the candidate is a fast-forward. Stop on any
   concurrent advance or conflict; never force-push.
3. Run focused tests, the complete local suite, TypeScript, ESLint,
   `git diff --check`, mission governance and release readiness. Exclude
   generated files, local `.env*` files and secrets from the commit.
4. Push the reviewed commits to `origin/qa` normally.
5. Wait for the Git-triggered Preview. Before opening it, prove `READY`,
   `source=git`, `githubCommitRef=qa` and the expected exact SHA. Build logs
   must show governance/build success and no configuration diagnostic.
6. Validate the exact deployment URL first. Confirm the stable QA alias points
   to that same deployment only after the exact deployment passes.
7. Run browser, responsive, accessibility, console/network and affected-flow
   regressions. Scope runtime-log review to the exact deployment.

## Failure and rollback

On a failed build, wrong source/ref/SHA, configuration diagnostic, `5xx` or
P0 regression, stop further mutation and preserve the deployment evidence.
Do not alter variables as a workaround. When the stable QA alias moved and
the failure is user-visible, restore the previously recorded `READY` QA
deployment through the approved Vercel rollback/alias workflow, then verify
the alias and affected routes. Production, `main`, DNS, billing and Supabase
remain untouched.
