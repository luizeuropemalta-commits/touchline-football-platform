# Social automation candidate readiness — 039 to 046

Status: **local candidate catalogue complete; remote activation disabled**

There is no registered social module `038` in this repository. The numbered
social automation family begins at `039`; assigning a purpose to `038` without
an approved contract would create a second, unaudited authority.

## Registered range

| Module | Candidate responsibility | Local readiness | Activation boundary |
|---|---|---|---|
| 039 | Immutable artwork/caption review, content-addressed media and fenced Instagram outbox | Implemented and tested | Shared-QA migration, account connection and outbound adapter remain disabled |
| 040 | Exact official line-up discovery, queue and Feed draft | Implemented and tested | Requires verified official 11+9 source and approved template |
| 041 | Match Preview and approved fixture/card duel visual standard | Implemented and tested | Requires unique future fixture, current table/ranking and approved template |
| 042 | Full Time Feed and Final Score Story | Implemented; Full Time artwork owner-approved | Requires canonical `FINISHED`, reconciled score/events and final V3 settlements |
| 043 | Goal/penalty/own-goal, hat-trick and red-card confirmed events | Goal and Hat-trick visuals owner-approved; the additive 047 local candidate moves Hat-trick generation, event identity and approval routing into 043 | Each goal must be confirmed; Hat-trick requires three checksum-matching accepted goals by the same player; pending, VAR, rescinded and ambiguous states fail closed |
| 044 | Ranking preview/final, duel, Gameweek hero and top performer | Five ranking candidates implemented; new Hat-trick generation is explicitly rejected here | Each ranking type keeps its own ranking, fixture and settlement eligibility gate |
| 045 | One canonical first-party post fanned out by club reference to ClubHub/ClubOwner Timeline | Implemented and locally shadow-validated | Independent RLS/privacy/performance review and shared-QA activation remain pending |
| 046 | Template approval, auto-delivery eligibility, kill switches, quota and idempotency policy | All twelve registered template identities implemented and tested | Policy can become internally `READY`; no external adapter exists or is authorised |
| 047 | Hat-trick event-family correction | Implemented and locally contract-validated | Shared-QA migration remains pending; no outbound destination is enabled |
| 048 | Match Preview fan-out to the two fixture ClubHubs | Implemented and locally contract-validated | Shared-QA migration remains pending |
| 049 | One canonical official timeline shared with every ClubOwner | Implemented and locally contract-validated | Shared-QA migration remains pending; immutable media is referenced, never copied |

## Automatic data path

1. SportMonks facts are persisted and reconciled into canonical TouchLine
   fixture, event, line-up, settlement and ranking revisions.
2. The matching numbered reader either returns one exact verified source or
   fails closed. It never fills a missing player, card, score, minute or rating.
3. One immutable media/copy draft is generated with a semantic source checksum.
4. Module 045 associates the approved post with the relevant ClubHubs; module
   049 exposes that same post in the common ClubOwner Timeline without
   duplicating media bytes or factual copy.
5. Module 046 evaluates the exact approved template and dynamic revision. Any
   source/template/checksum change invalidates the prior eligibility.
6. Instagram/Facebook delivery requires a separately reviewed destination
   adapter, connection credentials, Meta permissions and operational approval.

## Candidate visual catalogue

- `/visual-qa/social-next-three`: red card, Gameweek ranking preview and final;
- `/visual-qa/social-confirmed-event?design=own-goal`: the approved 043 goal
  composition with the own-goal author and opposing-club score semantics;
- `/visual-qa/social-ranking-catalogue`: player duel, Gameweek hero and top
  performer, plus the byte-locked original Hat-trick approval evidence;
- `/visual-qa/social-confirmed-event?design=hat-trick`: the same Hat-trick
  editorial composition replayed through the new 043 renderer with the shared
  letter animation and scorer-club neon colour. The replay is frozen,
  explicitly non-publishable evidence; live generation uses only the verified
  043 event reader.

## Additive migration 047

Migration candidate `047_touchline_qa_goal_family_043.sql` changes no external
destination. It moves only `HAT_TRICK_HERO` generation/approval authority from
044 to the exact fixture-event identity owned by 043. The 044 queue rejects new
Hat-trick jobs. The 043 reader independently validates the checksum and stable
confirmation state of all three goals before it can return a source. Shared-QA
application remains a separate release decision.

## Current hard stop

The registered 039 outbox destination is currently
`TOUCHLINE_OFFICIAL_INSTAGRAM`. Facebook is not silently treated as the same
destination, and neither Meta destination has a callable outbound adapter in
this candidate. This prevents local samples, unapproved templates or incomplete
football data from reaching a real social account.
