# Recovery operator: configuration is not hosted credential presence

This standalone operator is intentionally separate from the website. It must
not inherit a content database, silently map a service-role API key to a SQL
password, or gain access to private recovery functions through a public RPC.

## Safe offline checks

Run `node tools/quota-recovery/measure.mjs --diagnose` to inspect the current
process only. Output includes fixed variable names and presence booleans, never
values. It does not inspect Vercel, connect to PostgreSQL, or call Sportmonks.
Exit 1 means this operator configuration is incomplete/rejected; it does **not**
mean hosted QA credentials are absent or invalid.

`--check` validates the explicit configuration without a connection. Neither
command proves database authentication, native concurrency, quota recovery,
data freshness, or deployment readiness.

## Known integration boundary

There is currently no implemented secret-injection bridge from Vercel, Vault,
or Keychain. A protected operator environment must supply the explicit
`TOUCHLINE_RECOVERY_*` variables accepted by `config.mjs`. The Sportmonks token
must belong to the approved shared account; database credentials must bind to
the approved QA authority and privileged operator identity. They must never be
printed, sent in chat, placed in process arguments, committed, or installed in
the website deployment. Existing hosted credentials must not be recreated just
because a standalone process cannot see them.

The existing `check-qa-connection.mjs` accepts a transient database password and
performs read-only identity/TLS checks; it does not obtain credentials. A
successful administrative MCP query is evidence about that MCP connection, not
about the standalone operator's connection.

## Gates before any measurement

1. Supply configuration through an explicitly approved private mechanism.
2. Validate isolated native PostgreSQL concurrency and the exact candidate.
3. Verify QA target, all consumers drained, scope/workers OFF, preimages, and
   an approved recovery case/entity. A dashboard login is not a drain proof.
4. Admit and durably observe one lease before one provider request. Persist the
   real receipt; no automatic retry or fabricated reset metadata.
5. Review that receipt before authorizing another entity. Finalization does not
   automatically enable consumers; gradual resumption is a separate gate.

Do not bypass these gates with a flag reset or a management-API mutation.
