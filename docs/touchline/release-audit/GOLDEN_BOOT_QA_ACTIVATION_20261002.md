# Golden Boot — QA activation release

## Scope

This release retains the application source from `d84d19181606baa898d468510d8e4750a2525d4f` and enables only its existing Golden Boot capability on the canonical `qa` deployment. It does not include subsequent notification, reminder or Fixture-enforcement development.

Owner authorized one additional Git-native QA publication on 2 October 2026. Production, billing, account data and the independent Live scheduler are excluded. The stable QA alias remains the same; this is not a second online candidate.

## Prerequisites and activation sequence

1. Verify the exact QA project and branch-scoped configuration without exposing values. Use a dedicated refresh credential matching the QA Vault entry, never a Production credential.
2. Verify existing authority migration history `20261001233034` and paused Golden Boot job 6. Do not replay the source migration `20261001194607` or the scheduler installer.
3. Preserve the previously verified gate-OFF deployment as rollback. Validate the clean release source, independent review and one-build budget before dispatch.
4. Publish the activation configuration through one Git-native QA build; verify its immutable SHA and alias.
5. Invoke one controlled refresh. Verify original evidence expiry, canonical published player identities, all tied leaders and persisted quota/cooldown. Failure or unknown evidence must leave the award unavailable, never fabricate an artilheiro.
6. Inspect actual desktop and small-screen cards/zoom: a Boot alone occupies the Crown slot; both awards share the centered card head without overlap or clipping.
7. Enable only job 6 after controlled proof; verify scheduled renewal, expiry and recovery. Job 5 remains unchanged.

## Recovery and acceptance

On a blocking regression, pause job 6 and restore the previous gate-OFF QA deployment `dpl_8RMr8YNFUNUsGjSDkLXnhhxcUsZe`. Preserve authority tables, migration history, source data and diagnostic evidence. Do not extend stale award evidence or change goals/ratings to repair display.

This document is a release contract, not a completion receipt. Successful build, configuration provisioning or a single HTTP 200 does not establish visible award delivery. Record controlled refresh, browser inspection, renewal and exact deployment evidence in the execution ledger before calling the Bota complete. The `.com.br` site is not changed by this release.
