# TouchLine Codex Engineering Environment

Status: CURRENT ENVIRONMENT AUTHORITY
Last verified: 2026-08-14

This document is the single current authority for the TouchLine Codex engineering environment. It records tooling and integration state without replacing the product architecture, release ledger, or security boundaries.

## Canonical repository

- Repository root: `/Users/luizlopez/Documents/Codex/2026-08-02/continuar-a-touchline-a-partir-do/work/touchline-continuation-20260810`
- GitHub repository: `luizeuropemalta-commits/touchline-football-platform`
- Branch at verification: `work/continuation-20260810`
- `HEAD` and `origin/main` at verification: `7e61df57b4050cb9f47ba17ca704fc9ed0d02e52`
- Git is source authority. Cache folders, generated `.next` output, temporary build clones, and iCloud replicas are never authority.

## Project-local Codex profile

The supported project-local `.codex/config.toml` contains no credentials:

| Setting | Value | Purpose |
| --- | --- | --- |
| `model_reasoning_effort` | `high` | Strong DAILY default without forcing maximum effort on trivial work. |
| `approval_policy` | `on-request` | Material external writes retain an explicit authorization boundary. |
| `sandbox_mode` | `workspace-write` | Normal work is limited to the trusted repository. |
| `sandbox_workspace_write.network_access` | `false` | Network is disabled inside the normal sandbox unless a separately authorized tool/workflow provides it. |
| `exclude_slash_tmp` | `true` | `/tmp` is not silently trusted as source authority or a workspace root. |
| `exclude_tmpdir_env_var` | `true` | The process temporary directory is also excluded from trusted write roots. |

The installed Codex CLI accepts these fields with strict configuration validation. No token, secret, DSN, database URL, or Production credential is stored in this file.

## Audit lifecycle

| Item | Initial state | Final state |
| --- | --- | --- |
| Permanent `AGENTS.md` | ALREADY_COMPLETE, reviewed | VALIDATED |
| Project Codex profile | ALREADY_COMPLETE, reviewed | VALIDATED |
| GitHub plugin | INSTALLED_NOT_CONNECTED | CONNECTED / AUTHENTICATED / VALIDATED through the official connector |
| Vercel plugin | INSTALLED_NOT_CONNECTED | Plugin installed; official CLI CONNECTED / AUTHENTICATED / VALIDATED read-only |
| Supabase plugin | INSTALLED_NOT_CONNECTED | Plugin installed; official CLI CONNECTED / AUTHENTICATED / project identity VALIDATED |
| Sentry plugin | INSTALLED_NOT_CONNECTED | CLI CONNECTED / AUTHENTICATED / project VALIDATED; plugin installation requires a fresh Codex session before connector validation |
| Codex Security | INSTALLED_NOT_VALIDATED | MCP registered and workflow skills VALIDATED as available |
| Browser automation | MISSING | Playwright + Chromium/WebKit/Firefox VALIDATED |
| Independent CI | MISSING | Versioned candidate CREATED / LOCALLY VALIDATED / NOT ACTIVATED |
| iCloud migration | MISSING | Exact migration plan RECORDED / NOT EXECUTED |
| Reusable release workflow | MISSING | `touchline-release-preflight` skill CREATED / VALIDATED |

## Plugin and connector inventory

| Integration | Available / installed | Connection and harmless validation | Effective governance |
| --- | --- | --- | --- |
| GitHub | Official plugin enabled, build `11c74d6b`; `gh` CLI installed | Official connector authenticated. It resolved repository identity, `main` SHA, latest commit, and read `package.json`. The CLI itself is not logged in. | `READ_WITH_APPROVAL_FOR_WRITES`; connector reports repository write-capable permissions, so all writes remain release-gated. |
| Vercel | Official plugin enabled, build `11c74d6b`; Vercel CLI installed | CLI authenticated to `luizeuropemalta-commits`; project `fifa-agent-plataform/touchline-arena-official` inspected; deployments, environment names/scopes and domains listed without values. | `READ_WITH_APPROVAL_FOR_WRITES`; no deployment, alias, environment, DNS, plan or billing mutation occurred. |
| Supabase | Official plugin enabled, build `11c74d6b`; Supabase CLI installed | CLI authenticated and listed `TouchLine Arena`, project ref `vxireiswggllwhbsmdcj`. No service-role credential, database password or data value was read. | `READ_WITH_APPROVAL_FOR_WRITES`; project identity validated, while schema/migration/RLS live inspection remains `CONNECTED_NOT_VALIDATED` until an approved least-privilege database session exists. |
| Sentry | Official plugin enabled; `sentry-cli` installed | A least-privilege internal integration authenticated the CLI and resolved organization `touchline-rn`, project `touchline-arena` (project ID `4511905124188240`). One controlled `engineering-validation` event was received with release SHA `7e61df57b405...` and then resolved in the Sentry UI. | `READ_WITH_APPROVAL_FOR_WRITES`; Project Read, Organization Read and CI capabilities only. No Issue/Event write permission, webhook, Production DSN or Vercel secret was granted. |
| Codex Security | Official plugin enabled, build `11c74d6b`; local MCP registered | Security scan, diff scan, deep scan, threat model, validation, fix and hardening skills are discoverable. | `READ_WITH_APPROVAL_FOR_WRITES`; broad scans/remediation are separate missions. |

Installation never implies connection. Connection never implies permission for Production, database, main-branch, DNS, billing, authentication or payment writes.

## MCP audit

| MCP | Source | Purpose | State | Classification |
| --- | --- | --- | --- | --- |
| `codex-security` | Official OpenAI Codex Security plugin | Repository security analysis and validation workflows | Enabled, registered | TRUSTED / REQUIRED |
| `github` | Official GitHub/OpenAI connector | Repository, commits, files, PRs, issues and CI context | Enabled, authenticated | TRUSTED / REQUIRED |
| `node_repl` | OpenAI bundled | Browser/visual orchestration runtime | Enabled | TRUSTED / REQUIRED |
| `computer-use` | OpenAI bundled | General UI automation fallback | Disabled | TRUSTED / NOT_REQUIRED while browser-specific control suffices |

No unknown or untrusted community MCP server was installed. No redundant management plugin was added.

## Local development tools

| Tool | Version | Source / path | Validation |
| --- | --- | --- | --- |
| Git | `2.50.1 (Apple Git-155)` | Apple `/usr/bin/git` | repository/branch/SHA operations passed |
| GitHub CLI | `2.97.0` | Official GitHub release, checksum verified, `~/.local/bin/gh` | binary passed; CLI authentication absent, official connector used instead |
| Node.js | `v24.19.0` | Official Node release, checksum verified, `~/.local/bin/node` | matches project Node 24 contract |
| pnpm | `11.9.0` | Official Corepack, `~/.local/bin/pnpm` | matches `packageManager`; frozen install passed |
| Vercel CLI | `58.11.0` | Official npm package, `~/.local/bin/vercel` | authenticated project inspection passed |
| Supabase CLI | `2.114.0` | Official Supabase release, checksum verified, `~/.local/bin/supabase` | authenticated project listing passed |
| Sentry CLI | `3.6.2` | Official Sentry release, digest verified, `~/.local/bin/sentry-cli` | authenticated project listing and controlled event delivery passed; local credential file is user-only (`0600`) |
| Playwright | `1.62.1` | Project-local official package | seven-project smoke matrix passed |
| Chromium | Playwright `v1234` | Official Playwright browser package | 390/768/1280/1440 + reduced-motion passed |
| WebKit | Playwright `v2336` | Official Playwright browser package | desktop smoke passed; not native iOS Safari |
| Firefox | Playwright `v1538` | Official Playwright browser package | desktop smoke passed |
| ripgrep | `15.2.0` | Codex-bundled binary | source/file search passed |
| jq | `1.7.1-apple` | Apple `/usr/bin/jq` | JSON parse passed |
| curl | `8.7.1` | Apple `/usr/bin/curl` | version/TLS capability passed |
| actionlint | `1.7.12` | Official release, checksum verified, `~/.local/bin/actionlint` | CI workflow validation passed |

All added binaries are user-level or project-local. No Homebrew dependency, random installer, Gatekeeper/SIP/firewall change, or system-wide package-manager duplication was introduced.

## Browser and visual QA

`playwright.config.ts` defines deterministic projects for 390px phone, 768px tablet, 1280px desktop, 1440px desktop, WebKit desktop, Firefox desktop, and reduced motion. The smoke fixture proves:

- viewport sizing and screenshots;
- keyboard activation;
- touch-capable configuration;
- reduced-motion preference;
- console-error collection;
- observable network-failure handling.

Product visual PASS still requires rendered inspection of the actual affected pages. Playwright WebKit is useful desktop evidence but does not equal native iOS Safari; native iOS/Android remain separate gates.

## CI candidate

`.github/workflows/touchline-ci.yml` is a read-only candidate with `contents: read` and no Production secrets. It performs:

1. checkout;
2. Node 24 and pnpm 11.9.0 setup;
3. frozen install;
4. release readiness;
5. TypeScript without incremental cache;
6. ESLint;
7. complete test suite;
8. diff/generated-artifact safety;
9. Production build.

The workflow passed `actionlint` and a repository source-contract test. It is intentionally **not activated** because activation requires a reviewed commit/push to GitHub. It complements Vercel and does not deploy or replace it.

## Security gate before real payments

Before Stripe Live, real payments, or commercial payment launch, run one dedicated mission containing:

1. TouchLine threat model;
2. repository security scan;
3. deep auth/payment/Admin scan;
4. Supabase RLS audit;
5. Admin authorization audit;
6. IDOR audit;
7. privilege-escalation audit;
8. webhook signature/replay audit;
9. secrets audit;
10. remediation and independent revalidation.

## Sentry tooling and application design

Tooling and application activation remain separate. The official CLI is authenticated through a least-privilege internal integration. Local Next.js instrumentation is now present and verified for client, server, edge and global React errors using `@sentry/nextjs` `10.70.0`.

The implementation:

- stays inactive when no DSN is supplied;
- sets `sendDefaultPii: false` and zero trace sampling by default;
- scrubs passwords, cookies, Authorization headers, Supabase/session/service-role credentials, Stripe/provider tokens, request bodies, URL query strings and unnecessary user fields;
- correlates events with environment and Git release SHA;
- removes debug logging and uploads/deletes source maps only when a build-only auth token is explicitly present;
- contains no DSN, token or credential literal in source or example files.

Validation used one controlled event in `engineering-validation`, event ID `143a3eef94e541bca4522f23db7c8a68`. The event arrived under the expected release and was resolved in the Sentry UI. The CLI integration deliberately cannot list/modify Issues or Events through the API; cleanup used the already-authenticated owner UI.

Production application capture remains **inactive**. No Sentry variable was added to Vercel, no Production deployment occurred, and no source map was uploaded. A later activation must establish separate Staging/Production environment values, re-run privacy and release gates, deploy with rollback ready, and smoke client/server/edge reporting without exposing the build token.

## Project-specific skills

The user-level skill `touchline-release-preflight` was created at `~/.codex/skills/touchline-release-preflight`. It encodes the repeated release evidence sequence without credentials or product history. It was schema-validated successfully. Additional skills are deferred until repetition proves a real need.

## Repository-location migration plan

The active clone remains inside Documents/iCloud and has recorded I/O stalls. Do not move it during an active P0/release.

After explicit Luiz approval:

1. resolve the canonical GitHub SHA;
2. clone cleanly to `~/Developer/touchline-football-platform`;
3. verify the exact SHA/tree against GitHub;
4. run `pnpm install --frozen-lockfile`;
5. run release readiness, TypeScript, ESLint, full tests, diff safety and Production build;
6. compare SHA/tree again;
7. designate the new clone canonical;
8. preserve the old iCloud clone until the new checkout is fully proven;
9. delete the old clone only under a separate explicit authorization.

Finder drag-and-drop is not an authority-preserving migration.

## Working modes and critical-mission rule

| Mode | Reasoning | Use |
| --- | --- | --- |
| DAILY | High | focused features, small bugs and UI changes |
| CRITICAL ENGINEERING | Max | database, migrations, security, scoring and critical architecture |
| RELEASE | Max | explicit manifest, clean worktree, full gates, rollback and smoke |
| AUDIT | Max | read-only discovery first; mutate only after evidence |

One critical write-authorized mission may be active at a time. Every critical mission declares OBJECTIVE, SCOPE, NON-GOALS, AFFECTED DOMAINS, ACCEPTANCE, ROLLBACK and FINAL REPORT. P0/P1 work follows implementation → focused tests → full tests → independent review → clean-worktree proof → release gate.

## Mission stop condition

The permanent environment is sufficiently established when governance, core plugins/CLIs, browser tooling, CI candidate, security workflows and the iCloud migration plan are verified. Further environment optimization is not a product substitute.

The next product P0 remains Production authentication / missing `NEXT_PUBLIC_SUPABASE_URL`. This environment mission does not change that variable or any Production configuration.

## Consolidated readiness

- Engineering environment maturity: **8.5 / 10**.
- Permanent TouchLine Codex environment: **YES, with external activation gates**.
- Environment P0: none.
- Environment P1: move the authoritative checkout out of iCloud after explicit approval; reload Codex and validate newly installed connectors; authenticate the GitHub CLI if CLI parity is required; obtain a dedicated least-privilege Supabase schema/RLS audit channel.
- Production changed: **NO**.
- Secrets exposed or committed: **NO**.
- Unsafe macOS protection changes: **NO**.
