# Live: remaining 60 image inspection — 2026-10-07

## Result

FAIL for captured tablet clipping and Arabic directional presentation; PARTIAL for whole Live acceptance. This is completed image inspection, not a proposed plan. Code-verification evidence separation applied. No source/test edit, browser, server, test or build launched. CSS repair belongs to suite_failure_triage; these are pre-repair images and cannot approve a later patch.

Read `remaining-site-localization-review-20261007.md`, including owner scope supersessions. Administration excluded. Previous EN/PT responsive 20 images were assigned to the visual reviewer and were not redundantly counted here. Previous desktop 40 linguistic inspection is separately recorded.

## Exact images actually opened

Directory: `/private/tmp/touchline-test-runtime-20261007.1UPtcv/visual/live-2026-10-07T10-07-12.738Z`.

Every PNG in the Cartesian product `{es-ES,it-IT,fr-FR,ar-SA,tr-TR,de-DE}-{phone,tablet}-{empty,selected,stale,loading,error}.png` was opened with image viewing and inspected individually: 6 × 2 × 5 = 60. No visual PASS inferred from JSON. Phone capture is landscape 844×390, tablet 1024×768, full-page screenshots; not portrait or physical-device evidence.

## Concrete findings

1. **P2 tablet selected pitch clips status:** all six `*-tablet-selected.png` visibly clip the bottom status line immediately below date/time at the lower pitch border. Spanish EN DIRECTO, Italian IN DIRETTA, French EN DIRECT, Arabic مباشر, Turkish CANLI and German LIVE are reduced to top slivers. The live pill at the upper pitch border also sits against/clips into that border. Both team names wrap into two lines in this narrower two-column layout. Stale/loading/error pitch differs and its freshness line remains visible; empty has no pitch. Fix must provide room for all visible pitch children at this breakpoint, not hide status or shorten translated text. Recheck selected with long names, retaining time and scores.

2. **P2 Arabic directional layout:** all ten Arabic images retain left-aligned notice/rail and information text. Selected/stale/loading/error stadium copy around Latin TouchLine is visibly ordered as separate Arabic fragments around the Latin run under LTR; pending-data paragraphs similarly split the TouchLine sentence awkwardly, especially tablet wrapping. This confirms the earlier desktop direction concern. Correct Arabic text direction should be applied deliberately to text surfaces while preserving brand/score/team identity ordering; indiscriminate mirroring is not requested. Recheck mixed Latin brand, sentence-final punctuation, localized date, numerical score and asymmetric team data after repair.

3. **P2 German rail crowding:** `de-DE-tablet-{stale,loading,error}.png` has ZULETZT VERIFIZIERT extending into the adjacent SY crest initials; this agrees with desktop evidence. German landscape-phone versions do not reproduce it because time/status occupy a horizontal row above teams. Allow status wrapping/space rather than changing correct wording or obscuring team identifiers.

## Remaining observations and limited positives

- All six phone empty states show complete centered empty message and schedule rail beneath it. At landscape width, selected/degraded snapshots show full pitch/date/score/status and stacked information panels; no equivalent pitch clipping observed there.
- ES/IT/FR/TR/DE notice text, card text and navigation fit these captured widths. Tablet card text wraps within panels; the archive wrapping is visible but not lost. No new unequivocal mistranslation found.
- In each locale, stale/loading/error images show the same retained degraded-schedule state; this is not proof of distinct detail-fetch or alert-dialog error UI.
- Synthetic Home/Away and Synthetic 1 remain fixture identity values. Brand and protected names retained. Arabic's smaller visual glyph size is not by itself a proven sizing defect without font/device calibration; direction is the concrete finding.
- The small Next development indicator is a harness/dev artifact, not product copy or approval evidence.

## Acceptance boundary

All assigned 60 images are reviewed. The captured transport-state slice is not visually clean until the three findings are repaired and shown in fresh targeted captures. Detail/events/ratings/lineup, fixture-alert dialogs and consent, authenticated data, public locale gates, account persistence, portrait, keyboard/zoom and actual device behavior are outside this set. No deploy or full-page localization approval.
