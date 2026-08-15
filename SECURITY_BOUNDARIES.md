# TouchLine Security Boundaries — Canonical Entry Point

Status: CURRENT AUTHORITATIVE INDEX
Last reviewed: 2026-08-13

The canonical security constitution is [Security Bible](touchline-hq/10_Security/01_Security_Bible.md), supported by [Secure Transfer Policy](touchline-hq/10_Security/02_Secure_Transfer_Policy.md).

Enforced engineering boundaries:

- secrets never enter source, prompts, logs, screenshots, artifacts, or public DTOs;
- Production service-role credentials never enter Preview;
- preserve RLS, least privilege, server-only modules, and explicit authorization;
- database writes require preflight, atomic/idempotent execution, immutable evidence, and rollback;
- Production, DNS, billing, payment, Stripe Live, and credential changes require explicit owner authorization;
- before Stripe Live, run a dedicated security mission for RLS, auth, Admin endpoints, service-role boundaries, webhooks, secrets, XSS/CSRF, IDOR, privilege escalation, rate limits, and validation.

Codex Security is the preferred dedicated scanner; findings must be validated before remediation.

## Sentry observability boundary

- Sentry application capture is fail-closed when `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN` is absent.
- `sendDefaultPii` stays disabled and traces sampling defaults to zero.
- passwords, cookies, Authorization headers, Supabase/session/service-role credentials, provider/Stripe tokens, request bodies and query strings must be scrubbed before transmission.
- client, server and edge events use the same privacy allowlist; internal notes and unnecessary ClubOwner personal data never enter events.
- source-map upload credentials are build-only secrets and never public runtime variables.
- Production activation, DSN/environment changes and source-map upload remain a separate release-authorized mission.
