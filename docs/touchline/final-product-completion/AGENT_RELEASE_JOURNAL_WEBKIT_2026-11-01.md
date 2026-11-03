# Release journal — WebKit evidence, 2026-11-01

Scope: only the two previously pending removal cases, using actual headless WebKit and real IndexedDB in isolated synthetic origins. No real account, financial command, remote mutation, product or test edit.

## Result

| Case | Status | Evidence |
|---|---|---|
| Two pages: exact-reference removal, account/season isolation, reopen persistence | **PASS, WebKit** | `artifacts/avatar-notifications-20261031/release-journal-webkit-removal.log` |
| Single page: transaction commit, conflict and abort rollback | **BLOCKED by resource guard; not approved** | First attempt reached all behavior assertions then failed final capacity guard at test line 210. Isolated retry failed initial guard line 88 before any browser. |

First run: 1 PASS / 1 FAIL / 0 SKIP. Retry only unresolved case: 0 PASS / 1 FAIL / 0 SKIP. These are overlapping attempts and must not be added as distinct coverage. Passing behavior before a failed resource guard is useful diagnostic evidence, not a complete PASS.

Preflight before first run recorded memory-pressure level 1, 41% free, approximately 2.37 GiB disk. After that run, a read-only snapshot returned level 1 and 44% free; the other agent confirmed PGlite, TypeScript and lint had finished. This justified exactly one retry. The retry still failed the normal-pressure guard. The guard does not print the non-normal level, so this report does not invent a level of 2 or 4. Pressure fluctuates; no third retry with unchanged conditions.

## Commands and boundaries

Both attempts set:

```sh
TOUCHLINE_RUN_RELEASE_JOURNAL_BROWSER=1
TOUCHLINE_RELEASE_JOURNAL_ENGINE=webkit
TOUCHLINE_RELEASE_JOURNAL_CASE=removal
TOUCHLINE_LOCAL_BROWSER_DISK_RESERVE_MIB=500
```

Both explicitly removed inherited `TOUCHLINE_LOCAL_IGNORE_MEMORY_GATE` and `TOUCHLINE_LOCAL_MODERATE_MEMORY`. The existing local disk reserve remained 500 MiB. Normal pressure and >=25% free memory remained required. Neither guards nor their source were changed.

First run:

```sh
node --test --test-concurrency=1 \
  '--test-name-pattern=^(real IndexedDB removal|two actual pages remove only)' \
  --experimental-strip-types \
  tests/touchline-release-journal-browser.test.mts \
  tests/touchline-release-journal-tabs-browser.test.mts
```

Unresolved-only retry:

```sh
node --test --test-concurrency=1 \
  '--test-name-pattern=^real IndexedDB removal' \
  --experimental-strip-types tests/touchline-release-journal-browser.test.mts
```

Exact UTC times, exit codes and environment maps are preserved in the two `*-command.json` files. Before/after hashes match for all 13 source/test/helper/lock files and the complete assembled JavaScript bundle, including installed runtime library definitions:

`3d35e61b529c3e7d405fd490ad975272532244cafa151e6323b993bb440df957`

Machine receipt with artifact SHA-256 values: `artifacts/avatar-notifications-20261031/release-journal-webkit-receipt.json`.

## Next action

Run only the unresolved single-page case when the Mac has sustained normal pressure, or on a healthy WebKit runner with equivalent resource protections and matching source/dependency fingerprint. Do not weaken the guard, close user apps or delete user files to force a green result. A new run with changed sources must receive a new fingerprint.

This does not establish Safari/iPhone visual behavior, a physical-device pass, QA release execution or a real balance update. The prior Chromium evidence remains separate. Shared coverage/current-state ledgers were not changed by this agent.
