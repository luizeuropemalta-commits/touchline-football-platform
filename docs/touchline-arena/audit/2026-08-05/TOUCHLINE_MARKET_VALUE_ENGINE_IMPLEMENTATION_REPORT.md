# TouchLine Market Value Engine — implementation report

Date: 2026-08-05

## Implemented locally

- Canonical TouchLine-owned current market-value table.
- Immutable player/season history table.
- Import runs, row-level audit items, pending and mapping queues.
- Server-only CSV parsing and an adapter boundary for XLSX/XLS.
- A disabled-by-default licensed-source adapter boundary; gameplay has no
  external source request path.
- Protected Admin route: `/admin/market-values`, plus owner-only import and
  queue-action APIs.
- Annual refresh (30 days), final delta validation (7 days), daily
  transfer-window roster detection, and one-player emergency import
  definitions/audit runs.
- Public profile and authoritative ClubOwner roster read only verified
  TouchLine canonical records. Missing/unapproved data is `Market Value
  Pending`; it is never zero or invented.
- Card economy separation: migration 050 disables the previous generic
  player-value triggers, so a value import cannot automatically change an
  active-season card tier, border, nominal price, or contract.

## Required before values are published

1. Review and apply migration 050 using the safety report and a backup.
2. Provide an approved licensed data export/API under a documented agreement.
3. Load a controlled England CSV template, resolve pending mappings and
   approve records in the owner workflow.
4. Run the full England audit against real imported rows.
5. Validate the Preview before any production promotion.

## Current data counts

No values were imported or fabricated by this implementation. Therefore the
current implementation report cannot truthfully state player-value counts;
they are produced only after the protected import audit runs against the
applied canonical table.

## Validation

- TypeScript: pass.
- ESLint: full repository pass (existing large-file generator notices only).
- Tests: 646 passed, 0 failed.
- Production build: pass (`next build --webpack`).
- Local visual validation: current production build checked at 1280px, 768px
  and 390px. The public Player Profile presents a pending value rather than a
  fabricated amount, has no alert/error state and no horizontal overflow. The
  protected owner route correctly redirects an unauthenticated visitor to the
  Arena login. Local screenshot evidence is retained under `evidence/`.
