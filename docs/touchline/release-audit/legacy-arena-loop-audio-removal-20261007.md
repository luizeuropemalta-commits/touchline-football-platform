# Authorized legacy Arena loop audio retirement — 2026-10-07

Owner authorization relayed by root explicitly removes the old loop audio from public pages, Live, ClubOwner, MyClub and retired Arena, preserving authentication entry audio and current intro. No deploy authorization is inferred.

## Exact recovery manifest

Exact dirty source preimages were copied before edits to `/Users/luizlopez/.Trash/touchline-legacy-arena-audio-20261007-EYSxtd`, with relative paths preserved. Recovery means copying the chosen archived path back to the canonical repository, after checking for newer edits. Do not empty Trash.

| Path | SHA256 before changes |
| --- | --- |
| components/auth-ambient-audio.tsx | 67868c6d4ebdfd0e0690112ed0ee1951521d7e7ceddb067b0323b2cde5a2ae06 |
| lib/touchlineArena/ambient-audio-policy.ts | 0ab36401ab49f0aa5146e3ef463843b848daad247f59eb07aff2280729e95bcb |
| lib/touchlineArena/arena-intro.ts | 2983d9f53de1517c4d773b59d18a1840237f0ea5eb4b8aaad7cd818d32c44084 |
| tests/touchline-ambient-audio-policy.test.mts | 39d7f5e7c9afa44a9c315ae4a57e1b0afa5e0fc2f7507e838e074505380d3dd5 |
| tests/touchline-arena-intro.test.mts | 66dd83f80e04cac2205aa414e4dcd8c9e5bf8a600f39f0abf23a19f134287cc1 |
| public/touchlineArena/arena/touchline-arena-loop-20260716.mp4 | 74c24fc132e5cecbc280dd60da12542db7a7188a48156541eb396eabb599be02 |

Media size: 19,788,552 bytes. Moved to the same relative path beneath the archive above after immediate source-consumer recheck; destination SHA256 matches the table and original path is absent. No permanent deletion; no Trash emptying. Preimage hashes were independently reread after edits and matched the table.

## Change boundary and historical authority

- Provider removes LOOP import and selects only ENTRY; no unrelated provider lifecycle bytes changed.
- Real policy permits only exact login/register/forgot-password/reset-password paths; public roots and descendants, intro, legacy Arena, administrative/unknown routes are silent.
- Intro removes only obsolete LOOP export. Entry video, poster, intro timeline and active intro component are unchanged.
- Provider historical digest `6d368e51123fb213979c6a554f395674441b9773d3c912538249eb0e979a8f46` remains asserted after reversing exactly the authorized single source-selection statement. This protects all original consent/claim/suspension/cleanup/quiet-audio code without rehashing changed behavior.
- Former copy-only policy digest `438e7b8fb9ea30962450d64d4f7b3bead0101d469379490779419de17b462cfc` is retained here as historical evidence, not claimed valid for the new authorized route contract. Replaced by real policy behavior checks across all retired/public roots and auth boundary negatives. Existing locale/control checks retained.
- Intro asset existence tests retain all current assets and now assert retired LOOP source and asset absence.

## Verification

Immediate all-consumer search over app/components/lib/scripts/public/tests showed only retirement assertions and the explicit historical reverse-transform in tests after the edits. A repository-wide text search excluding historical docs/artifacts/logs and media likewise returned only the two updated test files. No active runtime reference remained before moving media.

Exact dirty-preimage comparison proved provider changes are exclusively the import and source-selection replacements, and arena-intro changes are exclusively LOOP export removal.

Executed under root-granted serial lightweight slot:

`node --experimental-strip-types --test tests/touchline-ambient-audio-policy.test.mts tests/touchline-arena-intro.test.mts tests/touchline-arena-audio.test.mts tests/touchline-quiet-audio.test.mts`

Result: exit 0; 34 tests, 34 pass, 0 fail, 0 cancelled, 0 skipped, 0 todo; 380.624125 ms. Tests cover route policy, localized explicit controls, intro media/lifecycle, quiet attenuation, pending playback cancellation and stale promise safety. No tests removed or skipped; source identity checks supplement these local tests, not browser playback certification. Serial slot released to root.

No browser, build, full suite, server or remote writes by this agent. Remaining gate: root independent review/integrated validation; this is not deploy approval.
