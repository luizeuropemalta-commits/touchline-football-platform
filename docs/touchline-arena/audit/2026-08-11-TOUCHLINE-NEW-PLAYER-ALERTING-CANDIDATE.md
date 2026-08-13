# TouchLine New Player Alerting Candidate — 2026-08-11

## Status

**LOCAL CORE COMPLETE / NO POLL, EMAIL, DATABASE WRITE OR DEPLOYMENT**

`lib/touchlineArena/new-player-card-alerts.ts` turns a strict canonical
Premier League roster read into a protected human review queue. The owner
page links each alert to the exact existing player in the manual editor; it
does not create or infer a football identity.

An alert contains the canonical player, club/membership, position and
detection timestamp. Provider identity remains protected and is never placed
on a public card surface. The workflow status is:

```text
MARKET_VALUE_REQUIRED
```

It never assigns a value, tier, border, neon or card price. It is not an
importer and it cannot publish a card.

## Safety rules proven

- partial/duplicate roster responses block alert creation completely;
- reviewed or published editorial player IDs do not generate alerts;
- a deep link selects the exact canonical player in the protected editor;
- optional position, timestamp and internal provider identity are normalised
  to `null`, never guessed, when absent or malformed;
- transfers and unmatched canonical additions remain human review cases;
- the planner is pure: no provider request, database client, email, cron,
  payment or deployment capability.

## Next activation gate

Before any scheduled poll, durable notification center event, email digest or
mobile push is connected, review and explicitly authorize the corresponding
server-owned queue table, delivery channel, frequency, retention policy and
mobile subscription keys. This candidate deliberately does not send email or
request browser notification permission merely because a roster was read.

## Validation

```text
node --test --experimental-strip-types \
  tests/touchline-new-player-card-alerts.test.mts \
  tests/touchline-manual-card-editorial-admin-boundary.test.mts
# 10 passed, 0 failed

git diff --check
# passed for the alert/editor scope
```

The full TypeScript gate remains a release gate; it was not re-recorded here
because the local filesystem had previously stalled during broad reads.
