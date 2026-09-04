# TouchLine social template implementation status

Status date: **4 September 2026 (Europe/Malta)**

This is the exact inventory of artwork content types saved in the application
registry. “Registered” means the code has a canonical module, placement,
dimensions and scope. It does **not** mean that remote database migrations or
Instagram/Facebook delivery are active.

## Registered templates: 12

| # | Content type | Module | Placement | Canvas | Runtime scope |
|---:|---|---:|---|---|---|
| 1 | `LINEUP` | 040 | Feed | 1080×1350 | team + fixture |
| 2 | `MATCH_PREVIEW` | 041 | Feed | 1080×1350 | fixture |
| 3 | `FULL_TIME` | 042 | Feed | 1080×1350 | fixture |
| 4 | `FINAL_SCORE` | 042 | Story | 1080×1920 | fixture |
| 5 | `GOAL_CONFIRMED` | 043 | Feed | 1080×1350 | fixture + event |
| 6 | `RED_CARD_CONFIRMED` | 043 | Story | 1080×1920 | fixture + event |
| 7 | `HAT_TRICK_HERO` | 043 | Feed | 1080×1350 | fixture + third verified goal event |
| 8 | `GAMEWEEK_RANKING_PREVIEW` | 044 | Feed | 1080×1350 | Gameweek |
| 9 | `GAMEWEEK_RANKING_FINAL` | 044 | Feed | 1080×1350 | Gameweek |
| 10 | `PLAYER_DUEL` | 044 | Feed | 1080×1350 | fixture |
| 11 | `GAMEWEEK_HERO` | 044 | Feed | 1080×1350 | Gameweek + player |
| 12 | `TOP_PERFORMER` | 044 | Feed | 1080×1350 | fixture + player |

Penalty and own-goal artwork are verified presentation variants of
`GOAL_CONFIRMED`; they are not duplicate template identities. Hat-trick uses
the same 043 goal-family composition but remains a separate content type
because it requires three exact accepted events and its own idempotency key.

## What is complete locally

- All 12 identities are registered in code and covered by the local template
  policy and regression suite.
- `MATCH_PREVIEW`, `FULL_TIME` and the active `GOAL_CONFIRMED` composition have
  explicit owner-approved visual records. The original Hat-trick composition
  is byte-locked as owner-approved evidence; its active one-line yellow,
  maximum-weight `HAT-TRICK` title revision is also owner-approved and
  byte-locked separately.
- The local 047 migration candidate moves Hat-trick generation, approval and
  event identity from ranking module 044 into goal-family module 043. It has a
  conservative rollback and is not applied remotely.
- Local visual QA is non-publishable, reads checked-in/canonical evidence and
  keeps outbound delivery disabled.
- The QA-only 048 candidate routes an owner-approved 041 revision into the
  internal Club Social Feed of the two fixture clubs. It references the same
  immutable artifact and keeps Instagram/Facebook delivery disabled.
- The QA-only 049 candidate exposes each approved canonical post once in the
  common ClubOwner Timeline and adds the native user Share action. It does not
  copy media bytes or create an external delivery path.
- The 041, 042, Goal and Hat-trick visual approvals now record both the runtime
  visual checksum and complete template identity checksum. The active
  Hat-trick revision 4 is owner-approved and byte-locked; revision 3 remains
  historical evidence.

## What is not honestly “100% live” yet

- Migration 047 has not been applied to shared QA or Production.
- Migrations 048 and 049 have not been applied to shared QA or Production.
- The remaining candidate artworks have not all received individual owner
  artwork and caption approvals.
- No Instagram/Facebook outbound adapter is enabled. Therefore the correct
  operational count today is **12 registered locally, 0 automatically posting
  externally**.

No template may be called production-ready solely because its local renderer
or test passes. Remote activation still requires the exact migration chain,
owner artwork and caption approvals, immutable generated media verification,
the release preflight and a separately authorised outbound connector.
