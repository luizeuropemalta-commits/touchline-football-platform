# QA canonical test persona

Status: active
Environment: TouchLine Development QA only (`xgxbwqxjssxxuihuwmgy`)

## Single allowed authenticated persona

- Email: `jl_nenelopes10@hotmail.com`
- TouchLine UUID: `072900f3-27fc-41a5-9881-6913a486754e`
- Stable QA alias: `https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app`
- Required evidence before every new authenticated QA run:
  - exact QA project reference;
  - exact stable QA alias;
  - confirmed Auth email;
  - matching public `users` profile;
  - TouchLine Arena access in Auth app metadata.

Run the executable QA persona preflight only with the QA environment loaded.
It refuses every other Supabase project, alias, and user ID before it reads
Auth or profile data.

For a local QA command with the QA environment available, run:

`pnpm run preflight:qa-persona:qa`

## Historical QA actor

The former technical QA identity is a **HISTORICAL QA ACTOR**. It is never an
allowed new-test persona and must not be recreated, selected, or authenticated
by a new QA flow. Its UUID is retained only by immutable card-publication audit
history: 58 historic actor records reference it, and the history guard rejects
the foreign-key nulling path.

Do not reassign those records to the canonical owner and do not weaken the
immutable-history guard. Retention-safe anonymization, if ever required, is a
separate reviewed forward migration.

## Boundaries

- This rule applies to QA only; it does not modify Production Auth or customer
  identities.
- Never put a password, session, recovery token, service-role key, or browser
  credential in source, logs, tests, or documentation.
- Browser sign-out uses the normal visible UI; do not inspect browser storage
  or password-manager data.
