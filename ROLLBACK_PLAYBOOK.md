# TouchLine Rollback Playbook

Status: CURRENT
Last reviewed: 2026-08-13

## Trigger

Rollback first for any P0: unavailable critical route, authentication outage caused by the candidate, corrupt/incorrect public data, destructive write, payment/security regression, or unrecoverable visual interaction.

## Release rollback

1. Stop further mutation and preserve logs/deployment IDs.
2. Disable the affected feature gate without changing unrelated environment values.
3. Redeploy/promote the last verified exact SHA through the official project; never force-push.
4. Smoke the canonical domain and affected routes.
5. Record the incident, action, resulting SHA/deployment, and remaining blocker in `CURRENT_STATE.md` and the execution ledger.

## Database rollback

1. Use only the pre-reviewed rollback/revert command for the exact batch/fingerprint.
2. Verify affected-row counts, immutable history, identities, memberships, contracts, inventory, and publication state.
3. Never repair presentation by changing football values, tiers, prices, or identity.
4. If rollback proof is incomplete, stop writes and escalate with the preserved evidence.

Rollback authority never implies permission to rotate credentials, modify DNS/billing, or alter Stripe Live.
