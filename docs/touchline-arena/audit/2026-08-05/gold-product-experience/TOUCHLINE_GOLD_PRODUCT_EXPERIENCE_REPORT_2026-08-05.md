# TouchLine Gold Product Experience + Market/Squad Builder

Date: 2026-08-05  
Implementation checkpoint: `3cd62c17`  
Branch: `safety/touchline-2026-06-28-wip`  
Preview: `https://touchline-arena-official-ql37xycvx-fifa-agent-plataform.vercel.app`  
Production promotion: **NOT PERFORMED**

## Executive result

The public/read-only Gold experience and the redesigned Market/Squad Builder are technically complete for Founder review. The Market now owns a single guided team-building journey instead of duplicated panels. The coach is selected first and remains outside the player formation; signed players fill eligible Starting XI slots before the match bench; the 35-player club roster is represented as 11 starters, 9 match-bench players and 15 remaining contracted players.

The release is **not approved for production promotion yet** because the full authenticated ClubOwner journey still requires a controlled test persona with persisted coach, inventory and wallet state. No real user credential or production mutation was used to simulate that evidence.

## Approved football and economy rules preserved

- Contracted squad: 35 players.
- Starting XI: 11.
- Match bench: 9, including at least one goalkeeper.
- Remaining contracted squad: 15.
- Matchday squad: 20.
- Maximum substitutions: 5.
- Coach is a dedicated ClubOwner entity and never consumes a player slot.
- Card border, tier and nominal price continue to come only from the approved canonical card policy.
- Missing or unverified market value remains `Pendente`/`Pending`; it is never converted to zero or a fabricated tier.
- Active-season contracted cards retain their stored authoritative tier and contract.
- No new U23 quota or real-club player limit was invented. Neither rule was found in the approved squad contract, so either future constraint requires a Luiz decision and a versioned policy.

## Market and Squad Builder result

| Requirement | Result | Evidence |
| --- | --- | --- |
| One dedicated Market journey | PASS | Duplicate legacy builder surfaces removed from `ArenaClient`; one `TouchlineSquadBuilderStage` is mounted. |
| Coach-first | PASS locally | Mandatory gate blocks and hides player operations until the coach state is resolved. |
| Six-step guidance | PASS | Coach, goalkeeper, defence, midfield, attack and review/Arena handoff. |
| Starting XI | PASS | Eleven explicit slots; successful eligible contracts fill vacant XI slots before bench. |
| Match bench | PASS | Nine slots represented separately from the remaining squad. |
| Full contracted squad | PASS | Canonical 35-player progress and 15-player remainder. |
| Coach outside formation | PASS | Coach remains in the technical area and is excluded from every player slot count. |
| Position filters and selection | PASS | Goalkeeper, defender, midfielder and attacker selection use the centralized eligibility rule. |
| Card border and nominal price | PASS | Existing verified card contract reused; no new price or threshold invented. |
| Pending economics | PASS | Unverified values disable commercial promises and show an explicit pending state. |
| Immediate placement | PASS | Contracted player enters the first eligible XI vacancy, then the bench, without duplicating roster identity. |
| Review and Arena handoff | PASS | Final guided stage exists; matchday transfer to Arena remains separate from contracting. |
| Responsive design | PASS | Mobile portrait, mobile landscape, tablet, tablet landscape, desktop and large desktop checked. |
| Chromium/WebKit | PASS | Local production-build matrix and Preview smoke matrix passed. |

## Gold UX corrections

- Portuguese wording was completed on the audited first-party surfaces.
- Password recovery without a valid grant now renders a safe expired/unavailable state without a noisy browser 401.
- Auth links, password visibility controls, profile navigation, Match Centre actions, ClubOwner links and the Arena matchweek carousel received effective 44 px touch targets.
- Duplicated, undersized follow/like controls inside the compact player-card artwork were removed from the profile hero; the full accessible social actions remain directly below the card.
- The Arena empty-club state now gives a persistent, clear path to the coach/Market journey while preserving the stadium as the matchday environment.
- Coach-first gated content is `inert` and `aria-hidden`, preventing keyboard and assistive-technology access to player operations before coach confirmation.
- ClubHub heavy card rendering remains progressive rather than blocking first content.
- Loading, empty, unavailable and pending states do not fabricate football or commercial data.

## Validation

### Automated quality

- TypeScript: **PASS**.
- ESLint on changed TypeScript/JavaScript: **PASS**.
- Automated tests: **666/666 PASS**.
- Production build: **PASS**.
- Static generation: **118/118 pages generated**.

### Browser and responsive evidence

- Complete Gold route matrix: 336 checks across 28 routes, 6 viewports and Chromium/WebKit. The two initial navigation observations were caused by the intentional home intro navigation; the eleven initial recovery console observations were caused by the invalid-grant 401.
- Correction matrix: 36/36 checks, zero navigation, server, overflow, console, network failures.
- Final audited-surface matrix: 180/180 checks, zero navigation, server, overflow, console or network failures.
- Final touch-target correction: 72/72 checks, zero navigation, server, overflow, console or network failures.
- Final closeout: 24/24 checks and **zero undersized interactive controls** on Arena and Player Profile.
- Local Market coach-first journey: 6/6 PASS across Chromium/WebKit and mobile portrait, landscape and desktop.
- Preview smoke matrix: 36/36 checks, zero navigation, server, overflow, console, network or undersized-target failures.

Detailed JSON, screenshots and route captures are stored locally under `evidence/`. They are intentionally not embedded in chat.

## Preview interpretation

The Preview correctly redirects anonymous `/market-transfer` requests to the localized login route while preserving `returnTo=/market-transfer?lang=pt-BR`. Therefore:

- authentication boundary and return destination: **PASS**;
- anonymous public/read-only smoke test: **PASS**;
- authenticated Market rendering in Preview: **BLOCKED BY CONTROLLED TEST PERSONA**;
- coach cross-session persistence in this specific Preview: **NOT REVALIDATED IN THIS BLOCK**.

The local production build exercised the complete no-coach gate and builder structure without real credentials. This is valid technical evidence but does not replace the required controlled authenticated Preview journey.

## Remaining gates and risks

1. A controlled non-production ClubOwner persona with a persisted coach and authoritative inventory is required to verify coach selection, reload, logout/login, another browser, purchase/placement, full roster and Training Centre continuation.
2. A controlled Admin persona is required for Inbox/notification write operations and operational Admin journeys.
3. Market-value ingestion remains behind the approved/licensed-source boundary. Pending values must stay pending until verified.
4. Any U23 or maximum-players-per-real-club rule requires an explicit commercial/gameplay decision; none was added.
5. Native physical-device testing remains desirable after the controlled Preview persona pass; Playwright WebKit covered the technical Safari rendering boundary in this block.

## Founder review and publication decision

- Safe for Founder visual review: **YES**.
- Safe for anonymous/read-only Preview review: **YES**.
- Safe for controlled authenticated Preview test: **YES, once the test persona is supplied/created through the approved test workflow**.
- Safe for production promotion: **NO**.
- `touchline.com.br` changed by this block: **NO**.
- Real payments, Stripe Live, Wallet or production data changed: **NO**.

## Final answers

- Market rebuilt: **YES**.
- Repeated navigation removed: **YES**.
- Coach-first implemented in Market: **YES**.
- Starting XI/bench/full squad organized: **YES**.
- Canonical 35/11/9/15 rule enforced: **YES**.
- Card border and nominal price contract preserved: **YES**.
- Mobile-first and WebKit validation: **PASS**.
- Preview ready: **YES**.
- Founder review: **YES**.
- Production promotion: **NO — controlled authenticated journey remains mandatory**.
