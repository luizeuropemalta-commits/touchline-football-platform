# QA canonical persona consolidation

Date: 2026-08-16
Environment: TouchLine Development QA
Production changed: **NO**

## Canonical authenticated QA identity

New authenticated QA journeys are fail-closed to one identity and deployment:

- Supabase QA project: `xgxbwqxjssxxuihuwmgy`;
- email: `jl_nenelopes10@hotmail.com`;
- TouchLine UUID: `072900f3-27fc-41a5-9881-6913a486754e`;
- stable branch alias:
  `https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app`.

The executable preflight validates the project before the Auth Admin read, then
requires the exact alias, confirmed Auth email, matching public profile and
Arena access. It emits no credentials or tokens.

## Historical technical identity

The former technical account is retained as a **HISTORICAL QA ACTOR** only. It
cannot be selected for new tests. Its 58 immutable card-publication history
references must remain accurate; deletion, reassignment, or anonymization are
not part of this operational change and require a separately reviewed forward
migration.

## Scope and next checkpoint

No Production environment, credential, account, card, contract, score or
database record was changed. This change establishes a reproducible QA target;
the next permitted work is the existing authenticated visual checkpoint using
only the canonical owner.
