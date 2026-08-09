# Dedicated roster-exporter local role contract

Recorded: 2026-08-10

Status: `LOCAL_COMPLETE / REMOTE_NOT_PROVISIONED / EXPORT_BLOCKED`

## Purpose

Narrow the local canonical 20-club roster exporter to exactly one future JWT
claim: `role=touchline_roster_exporter`. This is a code-contract change only.
It does not create, configure, verify, or issue any remote role, token,
environment variable, database object, RLS policy, grant, migration, Vercel
configuration, or export.

## Local allow-list

`scripts/export-touchline-canonical-roster-readonly.mjs` now accepts an access
JWT only when all of these hold:

- `TOUCHLINE_ROSTER_EXPORT_MODE` equals `read-only`;
- URL is HTTPS and the token issuer matches that exact project's `/auth/v1`;
- anon key has `role=anon`;
- access JWT has exactly `role=touchline_roster_exporter` and
  `aud=authenticated`.

Generic `authenticated`, `service_role`, `anon`, missing, malformed and
arbitrary roles fail with
`TL_ROSTER_EXPORT_DEDICATED_EXPORTER_TOKEN_REQUIRED`. Missing configuration
still fails before a client is created with
`TL_ROSTER_EXPORT_READ_ONLY_CONFIGURATION_REQUIRED`.

The exporter retains its select-only query surface, two-pass revision fence,
fresh-path `wx` archive write, and incomplete/duplicate/partial fail-closed
state. It does not print any configuration value or token.

## Local validation

```text
node --test --experimental-strip-types tests/touchline-canonical-roster-export-readonly.test.mts
node scripts/clean-next-type-duplicates.mjs && tsc --noEmit
eslint .
git diff --check
```

The focused test includes a child-process `--check` invocation with only
`TOUCHLINE_ROSTER_EXPORT_MODE=read-only`; it exits before client creation,
prints no stdout, and returns only the stable missing-configuration code.

Recorded result: focused exporter tests **6/6 passed**; TypeScript, focused
ESLint and `git diff --check` passed. An independent direct `--check` using
only the `read-only` mode returned exit `1` and exactly
`TL_ROSTER_EXPORT_READ_ONLY_CONFIGURATION_REQUIRED`; it had no URL, key or
access-token environment value to read, print or use.

## Remote gate remains unchanged

`touchline_roster_exporter` is an expected local JWT claim, not evidence that
any such remote principal exists. The controlling remote validation still
records `NO_GO`: a new role would inherit `PUBLIC` function execution and
other broad privileges unless separate project-wide hardening, restrictive
five-table/20-club RLS, narrow grants, token issuance and negative permission
tests are approved and completed.

Do not use a generic authenticated user, service-role key, Vercel deployment
environment, browser session or SQL Editor to bypass this gate. The 533 EUR
values remain local-only; the five owner missing values remain `PENDING`, the
23 provider-only records remain `PENDING`, and 20 owner-only records remain
`REVIEW`.

## Related artifacts

- `scripts/export-touchline-canonical-roster-readonly.mjs`
- `tests/touchline-canonical-roster-export-readonly.test.mts`
- `docs/touchline-arena/audit/2026-08-09-ROSTER-EXPORTER-REMOTE-SCOPE-VALIDATION.md`
- `docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/README.md`

Persistent implementation checkpoint: `43974feb`
(`feat(roster): require dedicated exporter JWT role`).
