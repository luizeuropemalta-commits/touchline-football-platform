# Live linguistic and coverage review — 2026-10-07

Independent code-verification review, source-only phase. Scope public Live and its rendered Match Centre/fixture-alert copy; Admin excluded. No source edits, tests, browser/server/build or external calls launched. Image inspection pending delivery from root; this receipt does not approve unviewed screenshots.

## Current verdict: PARTIAL, concrete plural defect found

**P2 — plural composition bypasses catalogue:** `components/touchline/match-centre/TouchlineMatchCentre.tsx:599` pointsSummary renders rating count plus singular `dictionary.rating`. With two rated players this yields `2 RATING` (EN), `2 NOTA` (PT), `2 VALORACIÓN` (ES), `2 VOTO` (IT), `2 NOTE` (FR), `2 BEWERTUNG` (DE); Arabic also bypasses its dual form. Turkish numeral + singular construction is valid and should not be treated as a plural error. The verified heading at line568 already uses `dictionary.ratingCount(...)` correctly. Suggested minimal repair: use existing ratingCount in pointsSummary too, with regression covering1/2 and Arabic dual. Root informed; no edit authorized to this reviewer. This defect concerns detail-enabled rendering, not the pending guest image matrix.

## Source actually reviewed

- Actual `app/live/page.tsx` default renderer and metadata pass draftLocalesEnabled=false; six draft locales are not publicly enabled by these tests. Server gate verifies eligible account before detailed fixture read, and initial snapshot is partial persisted schedule.
- Match Centre visible empty, selected, current/results rail, stale notice, lineup-pending, match-detail/timeline/ratings and lineup labels, accessible selection announcement and date/status composition.
- Complete eight-locale `match-centre-i18n.ts`, `match-event-i18n.ts`, `fixture-alert-i18n.ts`; status catalogue/aliases and Gregorian rail date formatting in `match-centre.ts`.
- Current eight-language plan: preserve exact brands/proper names and facts; language-specific plural/format/RTL and per-state evidence; no global approval from catalogue existence.

## Source results by concern

| Concern | Verdict | Evidence / limit |
| --- | --- | --- |
| EN/PT/ES/IT/FR/AR/TR/DE selected/empty/stale copy | PASS source semantics | Localized title, schedule, venue, pending-lineup and freshness copy preserves meaning; no new unequivocal mistranslation identified in inspected catalogue strings. Not yet rendered approval. |
| Event and rating catalogue counts | PASS source construction | EN/PT/ES/IT/DE explicit1 vs plural; FR0/1 singular; TR uninflected noun after numeral; AR plural-rule zero/few/many/dual/other choices. Arabic dual deliberately omits digit2. Actual execution not performed here. |
| Rating-count consumer | FAIL source | PointsSummary bypasses count helper, as detailed above. |
| Official identities/protected text | PASS source boundary | Provider player/team/venue names are passed through, TouchLine/TouchLine England/TouchLine Verified/TouchLine Data retained. Fixed brand subtitle is not accidental fallback. Generic card labels are not protected brands. |
| Dates/time zone | PASS source boundary | Date formatter and rail formatter pin gregory and explicit provided/normalized time zone; no geography inferred from locale. Numeric scores/minutes remain factual; visual bidi checks pending other agent. |
| Known events/status labels | PARTIAL | Known event vocabulary localizes all8; unknown event becomes localized generic Event. Known status aliases localize; unknown status returns raw provider string. Exhaustive provider vocabulary coverage not established. |
| Loading/error with no detail | PARTIAL | Main centre retains verified snapshot on transient errors; selected detail absent renders localized dataPending. No standalone error vocabulary is falsely claimed as exercised. Stale/degraded notice selects localized source-appropriate explanation. |
| Fixture-alert panel | PASS source semantics, PARTIAL runtime | Loading/saving/disabled/signed-out/error/saved copy and aria label use selected catalogue. All8 explicitly distinguish saved interest from unavailable mobile delivery. Runtime preference/push consent/delivery not exercised. |
| Selected/detail coverage | PARTIAL | Pending120-image matrix is guest with canReadMatchDetail=false, so events, ratings, lineup and highlights are not visually covered. |

Editorial observation, not asserted linguistic blocker: signedOut alert copy in all8 retains Arena branding for login; current login is TouchLine. Any branding replacement requires an explicit product wording decision; no inferred rename here. Likewise preserved legacy PT Home/Away fallback and technical snapshot/fixtures wording are recorded as source wording, not silently rewritten under a translation review.

## Pending rendered phase

Root prepares8locales×3viewports×5states=120images. This reviewer is assigned desktop text40 (empty/selected/stale/loading/error); visual agent owns layout/responsive/RTL. No images have been claimed viewed in this initial receipt. Runtime state labels must be reconciled with report actual branch evidence, not trusted only from filenames. Language release, account persistence, authenticated detail, notifications delivery and deploy remain outside this source-only result.

## Rendered follow-up: 40 desktop images actually inspected

Artifact directory: `/private/tmp/touchline-test-runtime-20261007.1UPtcv/visual/live-2026-10-07T10-07-12.738Z`. Every combination `{en-GB,pt-BR,es-ES,it-IT,fr-FR,ar-SA,tr-TR,de-DE}-desktop-{empty,selected,stale,loading,error}.png` was opened and read, not inferred from catalogue coverage. This is 40 images; phone/tablet belong to the separate visual reviewer. Report scope explicitly says synthetic private Live component, not public routing/account/persistence approval.

PASS for meaning of visible translated title/navigation, schedule empty notice, selected fixture labels, venue-pending, match-data pending, freshness notice and localized Gregorian date in these images: no additional unequivocal mistranslation identified. `Synthetic Home/Away` and `Synthetic 1` are fixture identities, not untranslated UI fallbacks. TouchLine, TouchLine England, TouchLine Data, TouchLine Verified, Club Owner/ClubHub and fixed brand subtitle remain protected/preserved.

The three stale/loading/error screenshots retain the same degraded persisted-schedule explanation and last-verified labels in each language. They do not show three separately authored loading/error alerts; no such coverage is claimed. Empty also carries degraded schedule notice. Selected renders the live status; verified detail is not admitted. Ratings, timeline events, actual lineup and alert-preference panel states remain visually untested.

Two presentation observations sent to visual reviewer: Arabic mixed venue/TouchLine phrase and punctuation inherit apparent LTR ordering; German `ZULETZT VERIFIZIERT` crowds the adjacent SY crest initials in stale/loading/error rail cards. These are direction/layout findings, not a request to change correct dictionary text. Text such as “canonical schedule” and translated equivalents is technically worded but not an unequivocal translation defect.

## Rating-count repair reconciliation and exact regression acceptance

During final source read, `TouchlineMatchCentre.tsx:599` already changed to `dictionary.ratingCount(verifiedDetail.playerStatistics.filter((row) => row.rating !== null).length)`. This is the minimum proposed repair and is semantically correct: it reuses existing language plural rules and keeps the original non-null admission (including numeric zero). This reviewer did not edit product code or execute tests. The original P2 above records the pre-repair finding, not a claim that the current line is still defective.

Regression acceptance in `tests/touchline-match-centre-i18n.test.mts`: use existing real JSX `consumer(true)` and `detail()` fixture; isolate the actual `section class="pointsSummary"` and its heading, not any whole-page inclusion (verified heading already contained the right phrase before repair). Exercise one rated row plus null, and two rated rows including zero. Independent literal expected outputs for two are EN `2 official ratings`, PT `2 ratings oficiais`, ES `2 valoraciones oficiales`, IT `2 voti ufficiali`, FR `2 notes officielles`, AR `تقييمان رسميان`, TR `2 resmî puan`, DE `2 offizielle Bewertungen`; one uses each corresponding singular, including AR `1 تقييم رسمي`. Existing catalogue plural-category/default-gate assertions stay intact. A test comparing only `copy.ratingCount` to its own output would not establish consumer regression.

Final disposition: PARTIAL for the Live page overall. Visible desktop text subset reviewed; source repair observed; detail-enabled visual plural proof, authenticated preferences, persistence, delivery, public locale release and full Live acceptance remain outside this evidence. No browser/test/build/server or external call was launched by this reviewer.
