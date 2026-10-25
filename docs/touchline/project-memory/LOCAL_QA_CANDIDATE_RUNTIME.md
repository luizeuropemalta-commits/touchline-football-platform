# Local QA candidate runtime

The repository-owned launcher replaces the missing `/private/tmp/touchline-local-qa-runtime.mjs`. Real QA startup and ClubOwner rendering with the saved roster were observed on 2026-10-24. Focused tests remain synthetic and do not prove full product acceptance or long-term stability.

## Explicit commands

Use the already-authorized existing QA environment file as input; do not create/copy credentials or pull Production configuration. First inspect current capacity and competing work. The launcher resolves this checkout from its own location and checks the Git root.

```sh
node --experimental-strip-types scripts/local/qa-candidate-runtime.mts --check --env-file /absolute/path/to/existing/QA.env
```

`--check` reads configuration locally and checks the canonical contract. It does not start Next, query Supabase, open Safari, or validate the current account. Output never prints the configuration or secrets. Invalid arguments/configuration fail closed.

After the capacity gate and known OOM cause are addressed, the explicit start command is:

```sh
node --experimental-strip-types scripts/local/qa-candidate-runtime.mts --start --env-file /absolute/path/to/existing/QA.env
```

SUPERSEDED on 2026-10-24 by explicit owner approval: the candidate Node old-space limit is now 4096 MiB (4 GiB), replacing the briefly configured 3072 MiB (3 GiB) and original 1024 MiB. The lightweight persona preflight retains 1024 MiB. These are per-process old-space limits, not total RAM limits or reserved allocations. The recorded 1024 MiB compilation OOM remains historical evidence; the new limit requires a monitored real candidate run before claiming recovery. Memory-pressure and disk shutdown guards remain unchanged. This change does not lower compiler demand.

The optional final argument `--qa-market-context` restores the previously owner-authorized local QA market context. It adds only the QA branch metadata needed by the existing guarded RPC reader; it does not open a market in the database or bypass budget/roster/auth rules. Omit it when the scenario does not require that context. No Git branch is changed.

## Boundaries

- Owner explicitly approved a local preview disk cutoff of **1 GiB** on 2026-10-24, superseding the former 5 GiB cutoff below. Stop at or below 1 GiB; keep the 4096 MiB Node heap and critical-pressure stop. This reduces disk headroom and does not guarantee stability or change full-build gates.

- `--club-collection` explicitly enables the existing QA collection reader locally so saved contracts appear. It does not enable player/coach release or bypass authorization. Without this argument, source configuration is preserved.
- `--club-release` is a separate owner-authorized local player-release test opt-in (2026-10-24). Requires both `--club-collection` and `--qa-market-context`; only development, non-Vercel runtime with the canonical QA project admits it. Hosted QA and inert Preview still reject the release flag. Source/host flags are never inherited. This enables real QA contract mutations after the customer confirms; it does not activate coach release, bypass ownership/market/round locks or prove end-to-end settlement. Restart without this flag to disable. Do not submit the customer's confirmation on their behalf.

- Local Next receives `NEXT_WEBPACK_PARALLELISM=1`, supported by the installed Next webpack config. This serializes module compilation within each compiler to reduce concurrent work; it does not cap total RAM or guarantee compilation success, and may compile more slowly. Host overrides are not inherited. No change to published build configuration.
- Opens no browser. When separately authorized and ready, review `http://localhost:3100`, not `127.0.0.1`. Next binds to `localhost` as well: its server-side request URL must agree with the cookie exception.
- Both QA deployment modes, canonical project/URL aliases and Preview metadata satisfy the existing isolation guard. `VERCEL=1` is not set. These are local runtime metadata, not evidence of a hosted QA deployment.
- Only existing source collection, locale, publication and season configuration is preserved; none is enabled by default. No provider/push/release credentials or flags are copied.
- `TOUCHLINE_QA_BASE_URL` belongs only to the persona subprocess, never the Next child. The preflight reads the canonical QA persona and has a 30-second deadline; it does not authenticate Safari.
- No application configuration is inherited from the shell. Only PATH/HOME/TMPDIR/LANG pass through. No credential file is written.
- Refuses the four repository dotenv files Next development can load. Checks before starting and every five seconds while running. Next itself watches dotenv changes: the periodic guard is **not atomic** and is not a read-only/network sandbox. Do not add dotenv files during a run.
- Checks macOS memory pressure and available disk before each stage and every five seconds. Startup requires normal pressure. By explicit owner request on 2026-10-24, runtime WARN (2) no longer shuts down the candidate, even after 60 seconds. Critical/unknown pressure or disk at/below 5 GiB still stops the owned process. Capacity shutdowns log only numeric pressure/disk readings, never configuration secrets. This supersedes both prior WARN shutdown rules and does not relax full-build gates.
- Sends signals only to its own detached subprocess group. TERM escalates after five seconds; failed signals report that shutdown is unconfirmed. A still-live process can keep the launcher waiting. No unrelated browser, Codex process or work is closed.
- Unexpected Next exit, including zero/null, reports failure. A `Ready` message or successful preflight never counts as browser validation. No automatic retry occurs.

## Still required

Validate compilation with the owner-approved 4 GiB limit; verify current source flags without changing them; run persona preflight and actual candidate; review existing customer Safari session, login cookies, lineup navigation, locale/roster loading and coach review. Do not confirm financial transactions or send notifications. Full product acceptance and all release gates remain pending.
