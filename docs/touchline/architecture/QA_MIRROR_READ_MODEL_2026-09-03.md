# TouchLine QA Mirror Read Model

> **Regra global de produto:** o espelhamento pertence ao site TouchLine
> inteiro. ClubHub é apenas a primeira fatia implementada e não representa a
> conclusão do espelhamento. Cada página deve migrar por contrato público,
> versionado, somente leitura e fail-closed antes de ser considerada coberta.

## Status and purpose

This architecture lets a local TouchLine checkout render approved, real,
public QA read models without copying QA credentials, provider tokens, live
sync secrets or service-role access onto a developer machine.

The first implemented vertical slice is the ClubHub official league table,
next fixture, both verified fixture teams, the approved home/fixture venue
presentation and the bounded official club feed. It proves the transport and
security boundary; it is not the final scope of the mirror.

## Non-negotiable boundary

- QA owns the canonical database/provider reads and returns an explicit public
  projection.
- Localhost performs HTTPS `GET` requests only to the exact stable QA origin.
- Localhost sends no cookie, `Authorization` header or request-controlled host.
- Every response has a versioned, strict allowlist schema, a freshness window
  and a maximum size.
- Redirects, invalid schemas, stale envelopes, unavailable QA and unexpected
  hosts fail closed.
- Mirror mode never falls back to a local database, SportMonks, demonstration
  content or a second network source.
- The global runtime resolver treats malformed mirror configuration as
  fail-closed and suppresses the browser Supabase/analytics tracker whenever
  mirror mode is requested. This control prevents a second local data path; it
  does not claim that pages beyond the documented ClubHub slice are mirrored.
- No owner identity, private media locator, storage bucket/key, email, token,
  service-role material or internal database UUID may enter a mirror DTO.
- Mirror endpoints are hidden outside a fully valid `qa-preview` deployment.
- This is a read model only. It creates no database or social-media write path.

## Local activation

Only these non-secret local settings are required:

```text
TOUCHLINE_DATA_SOURCE=qa-mirror
TOUCHLINE_QA_READ_ORIGIN=https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
```

`TOUCHLINE_DATA_SOURCE=qa-mirror` is rejected in Production or any Vercel
runtime. The QA origin must match the exact HTTPS allowlist and must not contain
credentials, a port, path, query or fragment.

## Implemented slice — schema v1

`GET /api/touchline-qa/read/clubhub/[teamId]`

`GET /api/touchline-qa/read/clubhub/[teamId]/feed-art/[publicId]`

The v1 DTO contains only:

- public club identity needed to bind the response to the request;
- approved public home-stadium presentation (without provider lookup keys or
  photo-storage internals);
- response generation time;
- the credible live/upcoming fixture selected from persisted QA reads, its two
  public team identities, round/status/score facts and resolved home venue;
- public season label/provider season identity;
- public table coverage and integrity state;
- the 20 public table rows and explicitly stale live-score indicator.
- at most six published feed items, with public copy, content type, timestamp,
  approved dimensions and a non-reversible public artwork identifier.

The artwork route resolves that identifier back to one currently published
post on the QA server. It returns only an allowlisted image media type, rejects
redirects and oversized bodies, and never sends the signed storage URL to the
browser.

The QA endpoint projects fields one by one. It never spreads a database record
or returns the internal season UUID. Allowed public strings are also rejected
when they contain email addresses, URLs, credential/token markers or UUIDs;
checking field names alone is not considered sufficient.

The consumer accepts a fixture only with a recent, calendar-valid verification
timestamp and a table only with recent source evidence. It also rechecks
football invariants such as `P = W + D + L`, `GD = GF - GA`, exact points,
aggregate wins/losses/draws/goals, fixture coverage, season presence, the
complete ordered rank/position projection and home-venue ownership. A fresh
transport envelope cannot make stale or inconsistent source facts acceptable.

When local mirror mode is active, ClubHub does not call local Supabase,
SportMonks, ranking, squad, formation or authentication readers. The official
feed, fixture and table come only from the QA mirror; other not-yet-mirrored
sections use their normal honest unavailable state. There is no fallback to
demonstration content. The owner-approved ClubHub hero remains a stable local
visual shell, so a remote read failure cannot remove its stadium, crest,
honours or neon treatment.

## Whole-site expansion map

Este mapa é requisito de produto, não uma melhoria opcional. A implementação
continua página por página para manter isolamento, rastreabilidade e impedir
que dados privados atravessem o limite QA → localhost.

Each following slice must keep the same rules and receive its own versioned
contract and focused leakage/fail-closed tests before it can be enabled:

1. ClubHub hero and navigation: extend the implemented public club identity,
   crest and approved stadium presentation with honours and canonical shared
   navigation state.
2. ClubHub Matchday: extend the implemented next fixture, venue and verified
   team identities with line-up and formation geometry.
3. ClubHub squad and cards: published public card projection, verified shirt
   number, public ranking/points and public profile link; never editorial or
   commercial control-plane fields.
4. ClubHub feed expansion: pagination and later public post types may extend
   the implemented six-item projection; never storage bucket/key or raw
   signing inputs.
5. Rankings and public player/coach profiles: published snapshots only, with
   canonical TouchLine identity and explicit unavailable states.
6. Arena/Market public catalogues: published inventory/read models only; owner
   wallet, contracts, cart and purchases remain outside the public mirror.
7. ClubOwner: public presentation may reuse the mirror, but authenticated owner
   state stays on QA and requires its own role-matched QA session. It must not
   be mirrored into an unauthenticated local DTO.
8. Remaining public site routes: add route-by-route contracts after a data
   classification review; never create one unrestricted database dump.

The preferred shape is one bounded composite read per page/surface to prevent
N+1 requests and cross-request drift. A schema is immutable after approval;
adding or changing fields requires the next schema version.

## Release condition

Localhost cannot consume this first slice until an authorized QA deployment
contains the endpoint. That later release must use the TouchLine release
preflight, one exact Git-native QA build and remote smoke evidence. This
document does not authorize a deployment, commit, push, database change or
Production action.
