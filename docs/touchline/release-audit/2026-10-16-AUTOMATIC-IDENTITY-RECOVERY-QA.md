# Automatic identity recovery — QA candidate

Owner explicitly authorized resolving points and automatic synchronization in this conversation. QA only; no Production, prices, billing, credentials or plan change. Budget: at most one new Git-native QA build for the consolidated corrected candidate. No remote build consumed for this candidate yet.

Base QA:509b9efe84a2dd319b153c8b5babc70848449f11. Candidate SHA not yet frozen.

Recovery is integrated before the existing identity barrier in player-season-statistics-store. Missing provider IDs are resolved only from persisted lineup evidence. Central guarded Player lookup obtains the exact official identity. SQL serializes claims by provider ID, enforces15minute cooldown, closes stale running claims and atomically records insert/audit. Completion never overwrites an existing identity or infers current club/market value/shirt/card publication. Canonical identity is re-read before the unchanged score barrier opens. Maximum3 acquired claims per run, with deduplication separate from quota; cooldown items cannot starve subsequent players.

Local checks:155scoring/integration tests PASS;7helper runtime tests and1real in-memory SQL test PASS, including interrupted claim, double claim, mismatched identity, unauthorized SQL caller and preservation of current club. Independent review found2P2 (starvation and orphaned running records), both fixed and re-reviewed without newP0/P1/P2. Updated verify:release exit0:5327total,5313PASS,0FAIL/0cancel,14SKIP. Log /tmp/touchline-auto-identity-release-gate-20261016.log. Updated isolated build in progress at this checkpoint; no release claim.

Migration source:20261016110913_touchline_guarded_player_identity_recovery.sql. Applied once through the migration service only to QA; remote history generated version20261016111752/name touchline_guarded_player_identity_recovery. Preserve both this explicit mapping and source file, do not reapply. Postflight: both functions exist, SECURITY DEFINER; anon/authenticated EXECUTE=false, service_role=true. Historical37761771still absent immediately after DDL, as expected: no identity claim was executed by the migration. No Production change.

Final local product build exit0: /tmp/touchline-auto-recovery-build-20261016.log, compilation15.3s, TypeScript12.3s. Source-equivalent isolated checkout; all nine product files and migration copied from canonical source. Full gate5327total/5313PASS/0FAIL/14SKIP. Candidate commit/remote execution remain pending.

Rollback strategy: restore the previously verified QA app deployment and revoke service_role EXECUTE on the two new recovery functions if the recovery path is implicated. Preserve all identities, facts, audit runs and migrations. Never delete a recovered athlete or undo scores by editing numeric values. Any data correction must be separately evidence-backed and forward-only. No rollback executed here.

Remote acceptance: migration identity/history+ACLs; exact candidate Ready and alias; owner/unauthorized route behavior; automatic claim/provider receipt/identity insertion; subsequent completed scoring run; round6all10fixtures reconciled; player and coach rankings/ClubHub/ClubOwner/profile totals match persisted V4 facts; no fabricated values for unrated appearances; error logs and next automatic cycles. Native device and whole-mission gaps must remain explicit.
