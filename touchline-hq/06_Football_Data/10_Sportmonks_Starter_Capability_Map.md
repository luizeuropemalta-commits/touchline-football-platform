# Sportmonks Starter Capability Map

Version: 1.0  
Author: Touchline Football Data Architecture Board  
Last Updated: 2026-06-26  
Status: Active Capability Map  
Dependencies: 01_Data_Strategy, 02_Sportmonks, 03_API_Adapter, 04_Sync_Engine, 05_Cache_Strategy, 06_Rate_Limit, 07_Data_Quality, 07_Architecture, 08_Database  
Future Related Documents: Sportmonks Live Validation Report, Provider Cost Matrix, V1 Football Data Integration Plan, Football Data Coverage Matrix

## Executive Summary

Sportmonks Starter can be useful for Touchline, but it must be treated as a controlled data foundation, not as the complete future of the company.

Starter is suitable for:

- canonical football entities
- selected league coverage
- player and team profiles
- fixtures
- standings
- team squads
- official lineups
- standard statistics
- basic match-centre data

Starter is not enough for every future Touchline ambition. It should not be treated as the final answer for:

- global all-league coverage
- advanced xG products
- premium expected lineups
- betting-style trends
- deep market-value intelligence
- agent/agency representation truth
- full transfer business intelligence

Touchline should use Sportmonks Starter to build the first provider-independent football data foundation, while keeping all product logic behind the `FootballDataProvider` adapter layer.

## Confirmed Planning Assumptions

The Sportmonks API documentation and FAQ indicate:

- Starter plans cover a limited number of leagues compared with higher plans.
- Plan differences include league count, API rate limits and support level.
- Teams, players, official lineups, formations and match statistics are included in base plans, subject to league coverage.
- API 3.0 rate limits are provider/account dependent and must be validated from the live account.
- Some capabilities require add-ons or higher coverage, especially premium expected lineups and xG.

Official references used for this capability map:

- Sportmonks API FAQ: https://docs.sportmonks.com/v3/api-faq
- Sportmonks endpoints overview: https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints
- Sportmonks leagues guide: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/leagues-and-seasons/leagues
- Sportmonks teams guide: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/teams-players-coaches-and-referees/teams
- Sportmonks players guide: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/teams-players-coaches-and-referees/players
- Sportmonks fixtures guide: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/livescores-and-fixtures/fixtures
- Sportmonks livescores guide: https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/livescores
- Sportmonks lineups guide: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/lineups-and-formations
- Sportmonks fixture statistics guide: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/statistics/fixture-statistics
- Sportmonks standings guide: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/standings/season-standings
- Sportmonks includes guide: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes

## Architecture Rule

The frontend must never call Sportmonks directly.

The flow is always:

```text
Sportmonks
↓
FootballDataProvider adapter
↓
Touchline sync engine
↓
Touchline database
↓
Touchline internal API
↓
Frontend
```

Sportmonks field names must not appear in UI components, business logic, economy logic, Fantasy logic or Transfer Center rules.

## Capability Classification

Status definitions:

| Status | Meaning |
| --- | --- |
| V1 Required | Required for the first reliable football data foundation |
| V1 Optional | Useful in V1, but not required to launch the first stable version |
| V2 | Important after V1 foundation is stable |
| Future | Valuable later, but not needed now |
| Do Not Use | Avoid because it conflicts with Touchline strategy, licensing, risk or product focus |

Sync categories:

| Sync Type | Meaning |
| --- | --- |
| Static | Rarely changes; cache long-term |
| Daily | Refresh once or a few times per day |
| Matchday | Refresh around fixtures |
| Live | Refresh frequently during active matches |
| Historical | Persist final records after events complete |

## Sportmonks Starter Feature Map

| Sportmonks Feature | What It Provides | Touchline Module | V1 Priority | Store in Database? | Recommended Sync | Includes? | Risks / Limitations |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Competitions / Leagues | Leagues, competitions, country relationships, season links and logos where available | Football Data Core, Club Network, Competitions | V1 Required | Yes | Static / Daily | Yes: country, seasons, currentSeason | Starter only covers selected leagues; must validate chosen league list |
| Seasons | Season IDs, dates, current season flags, league relationships | Football Data Core, Standings, Fixtures, Historical Data | V1 Required | Yes | Static / Daily | Yes: league | Every fixture/stat lookup depends on correct season mapping |
| Teams / Clubs | Team identity, name, logo, country, venue metadata where available | Club Profile, Club Network, Search | V1 Required | Yes | Static / Daily | Yes: country, venue, currentSeason | Logos may not match desired transparent/gaming style; should be cached and normalized |
| Team Squad | Squad members, player-team relationship, jersey number, position, contract start/end where available | Club Profile, Squad Sync, Player Profile, Agent Opportunity Matching | V1 Required | Yes | Daily / Matchday | Yes: player, position, detailedPosition | Squad availability depends on selected league coverage |
| Player Profile | Player identity, display name, image, date of birth, nationality, height, weight, position, teams and metadata | Player Profile 2.0, Player Search, Cards foundation | V1 Required | Yes | Daily / Historical | Yes: nationality, country, position, teams, trophies, statistics, metadata | Market value and agent/agency truth are not guaranteed |
| Coaches | Coach identity, image, nationality, linked teams where available | Coach Cards, Club Profile, Future Coach Module | V1 Optional | Yes | Static / Daily | Yes: country, teams | Coach depth varies by coverage |
| Fixtures | Scheduled, past and future matches; participants; venue; scores; state; metadata | Calendar, Club Schedule, Match Centre Foundation | V1 Required | Yes | Daily / Matchday / Historical | Yes: participants, scores, league, season, state, venue | Do not over-poll normal fixture endpoints during live windows |
| Calendar | Date-based fixture discovery | Calendar, Upcoming Matches, Club Schedule | V1 Required | Yes | Daily / Matchday | Yes: participants, league, season | Must use selected leagues to control cost |
| Team Schedule | Fixtures by team or team/date windows | Club Profile, Player Availability, Calendar | V1 Optional | Yes | Daily / Matchday | Yes: participants, scores, state | Useful after team IDs are stable |
| Livescores | Current in-play and recently updated fixture state | Live Arena, Live Match Widgets | V2 | Store snapshots only after V2 | Live | Yes: scores, participants, events, lineups, statistics | Do not build Live Arena yet; high polling risk |
| Lineups | Official starting XI, bench and formations close to kickoff | Squad Lock, Confirmed Starting XI, Future Fantasy | V2 | Yes, as match lineup snapshots | Matchday / Live | Yes: lineups, lineups.player, formations | Official lineups arrive around kickoff; expected lineups are premium/add-on |
| Events Timeline | Goals, cards, substitutions and other match events | Match Centre, Live Arena Timeline, Player Match History | V2 | Yes, as fixture event snapshots | Live / Historical | Yes: events, events.player, events.type | Event semantics must be normalized before scoring |
| Match Centre | Combined fixture detail: teams, scores, lineups, statistics, events and metadata | Match Centre, Live Arena, Club Match Pages | V2 | Yes | Matchday / Live / Historical | Yes: participants, scores, lineups, events, statistics.type | Build after Football Data Core and database schema are stable |
| Standings | League tables, corrections, live standings where available | Competitions, Club Ranking, Dashboard | V1 Required | Yes | Daily / Matchday / Historical | Yes: participant, details, rule | Live standings should wait until V2 |
| Group Standings | Tournament group tables | Competitions, Cups, International Tournaments | V2 | Yes | Daily / Matchday | Yes: participant, group | Only useful when competitions module supports groups |
| Topscorers | Top goals/assists/cards by season/league where available | Player Rankings, Club Dashboard, Football Feed | V1 Optional | Yes | Daily / Historical | Yes: player, team, type | Good for engagement, not required for first data foundation |
| Team Season Statistics | Team-level season performance | Club Profile, Rankings, Scouting, Match Analysis | V1 Optional | Yes | Daily / Historical | Yes: type, season, team | Standard stats are useful; advanced metrics may need add-ons |
| Player Statistics | Player performance by season/match | Player Profile 2.0, Player Cards, Scouting | V1 Optional | Yes | Daily / Historical | Yes: type, team, season, competition | Must normalize statistic type IDs into Touchline stat names |
| Referee Statistics | Referee records and match assignments | Match Centre, Integrity/Discipline Context | Future | Maybe, not V1 | Historical | Yes: referee | Low product priority for agent/club platform |
| Team Recent Form | Recent team outcomes and streaks | Club Profile, Match Preview, Opportunity Context | V1 Optional | Derived and stored | Daily / Matchday | Yes: recent fixtures, scores | Can be derived from fixtures instead of separate storage |
| Head2Head | Historical fixtures between two teams | Match Preview, Club Intelligence, Live Arena | V2 | Store derived cache, not core table first | Historical / Matchday | Yes: participants, scores | Not needed until Match Centre exists |
| Injuries & Suspensions | Player availability risks if available in plan/coverage | Player Availability, Club Scouting, Fantasy | V2 | Yes, with expiry/status | Daily / Matchday | Yes: player, team, fixture | Coverage and availability must be verified; never use for medical certainty |
| Commentaries | Text timeline commentary for matches | Live Arena Timeline, Match Centre Story Mode | Future | Store only selected final commentary if licensed | Live / Historical | Yes: fixture, event | High content/licensing risk; not V1 |
| TV Stations | Broadcaster and TV station metadata | Match Centre, Fan Info, Public Football Hub | Future | Optional reference table | Static / Daily | Yes: fixtures, countries | Not relevant to professional workflow V1 |
| Trends | Odds/prediction/value-bet style signals or market trend products | Not core Touchline Pro; maybe analytics later | Do Not Use for V1 | No | None | No | Avoid gambling/betting associations and regulatory risk |
| News | Pre-match or football news articles if within subscription | Football Feed, Match Preview, Social Layer | Future | Store metadata/link only | Daily | Yes: fixture, league | Content licensing and duplication risk; avoid full article copying |
| Transfers | Player transfer records and movement history | Player Career Timeline, Club Intelligence, Transfer Center Context | V1 Optional | Yes, as external transfer history | Daily / Historical | Yes: player, fromTeam, toTeam | Must never be confused with Touchline Card transfers |

## V1 Essential Data Package

The V1 Sportmonks Starter integration should focus only on the data needed to make Touchline feel real without overbuilding Live Arena or Fantasy.

V1 Required:

1. Competitions / Leagues
2. Seasons
3. Teams / Clubs
4. Team Squad
5. Player Profile
6. Fixtures
7. Calendar
8. Standings

V1 Optional but valuable:

1. Coaches
2. Topscorers
3. Team Season Statistics
4. Player Statistics
5. Team Recent Form
6. Transfers as historical references

V2:

1. Livescores
2. Lineups
3. Events Timeline
4. Match Centre
5. Group Standings
6. Injuries & Suspensions
7. Head2Head

Future:

1. Referee Statistics
2. Commentaries
3. TV Stations
4. News metadata

Do Not Use for V1:

1. Betting odds
2. Value bets
3. Betting-style trends
4. Predictions that make the product feel like gambling

## Touchline Module Mapping

### Player Profile 2.0

Uses:

- Player Profile
- Player Statistics
- Team Squad
- Transfers
- Fixtures
- Topscorers

Store:

- canonical player record
- provider source mapping
- current team relationship
- historical team relationships
- season stats snapshots
- trophy references where available

V1 rule:

Player profile data must be database-first. Sportmonks enriches missing data, but the app reads from Touchline.

### Club Profile / Club Network

Uses:

- Teams / Clubs
- Team Squad
- Fixtures
- Standings
- Team Season Statistics
- Team Recent Form
- Coaches

Store:

- canonical club record
- provider source mapping
- club logo
- selected-league squad
- schedule
- standing snapshots
- form derived from fixtures

V1 rule:

Club profile should be one of the first real integration targets after the provider core, because the current product already needs better club pages.

### Competitions

Uses:

- Competitions / Leagues
- Seasons
- Standings
- Fixtures
- Group Standings later

Store:

- competition
- season
- standings snapshot
- fixture list

V1 rule:

Do not build a full competition game yet. Only build the data backbone.

### Transfer Center

Uses:

- Transfers as historical football movement reference
- Players
- Teams

Store:

- external transfer history separately from Touchline Card transfers

Critical rule:

Sportmonks transfer data is real-world football history. Touchline Transfer Center transactions are internal digital platform transactions. They must never share the same table without a clear type boundary.

### Future Live Arena

Uses:

- Livescores
- Lineups
- Events
- Match statistics
- Commentaries optionally

Store:

- active fixture state cache
- finalized match snapshot
- event timeline snapshot

V2 rule:

Do not start Live Arena until fixture, team, player and competition IDs are stable.

## Includes Policy

Includes should be used to reduce API calls, but only inside provider adapters.

Recommended Starter includes:

| Use Case | Recommended Includes |
| --- | --- |
| Player profile | country, nationality, position, teams, trophies, statistics, metadata |
| Team profile | country, venue, currentSeason, seasons |
| Squad sync | player, position, detailedPosition |
| Fixtures by date | participants, scores, league, season, state |
| Match Centre V2 | participants, scores, lineups, events, statistics.type, venue |
| Standings | participant, details, rule |
| Coaches | country, teams |

Rule:

No UI component may choose Sportmonks includes. Includes belong only in the adapter or sync engine.

## Database Storage Decision

| Data Type | Store? | Reason |
| --- | --- | --- |
| Competitions | Yes | Needed for all match/standing context |
| Seasons | Yes | Required for correct historical lookup |
| Teams | Yes | Core club identity |
| Players | Yes | Core player identity |
| Coaches | Yes | Future coach cards and club profiles |
| Squads | Yes | Club-player relationships |
| Fixtures | Yes | Calendar and match history |
| Standings | Yes | Snapshot history and ranking UX |
| Live scores | Cache first, store final snapshots | Avoid write-heavy live polling in V1 |
| Lineups | Yes, after matchday module | Important for future Fantasy and Match Centre |
| Events | Yes, after V2 | Needed for live timeline and historical match records |
| News | Metadata only | Avoid copying copyrighted text |
| TV stations | Optional | Low V1 value |
| Trends / odds / value bets | No | Product/legal risk |

## Recommended Sync Frequencies

| Data | Frequency |
| --- | --- |
| Countries, leagues, teams, venues | Weekly or monthly |
| Seasons and competition metadata | Daily during setup, weekly after stable |
| Players | Daily for active leagues; on-demand when profile is opened |
| Squads | Daily; faster during transfer windows |
| Fixtures | Daily; matchday refresh around kickoff |
| Standings | Daily; matchday refresh after matches |
| Team/player statistics | Daily; historical after fixture final |
| Livescores | V2 only; live polling during active windows |
| Lineups | V2 only; start polling 75 minutes before kickoff |
| Events timeline | V2 only; live polling during active windows |
| News | Future; metadata daily |

## Risks and Limitations

### Coverage Risk

Starter league coverage is limited. If Touchline needs global player/club coverage, Starter is not enough.

Mitigation:

- start with chosen leagues
- use Transfermarkt Link Registry as reference layer
- keep provider architecture replaceable
- upgrade provider plan only when product usage proves demand

### Rate Limit Risk

Starter has limited hourly request capacity.

Mitigation:

- database-first architecture
- aggressive caching by data type
- queue sync jobs
- avoid frontend direct calls
- avoid live polling until V2

### Market Value Risk

Sportmonks may not provide Transfermarkt-style market values.

Mitigation:

- never promise market values from Sportmonks until validated
- keep market value as a separate provider capability
- store official market value source separately

### Agent/Agency Risk

Sportmonks is not an agent representation provider.

Mitigation:

- agent/agency verification remains a Touchline workflow
- Transfermarkt links remain public references only
- representation must be confirmed by users/admin/legal proof

### Gambling Association Risk

Trends, odds and value-bet products may pull Touchline toward betting.

Mitigation:

- exclude betting-style features from V1
- if ever used, restrict to non-gambling analytical context
- do not build economy or rewards around gambling outcomes

## Recommended First Real Integration Test

The first real integration test should be:

```text
Sportmonks Team → Squad → Player Profile
```

Test flow:

1. Fetch one selected league.
2. Fetch one known team from that league.
3. Fetch the team squad.
4. Normalize squad players to Touchline player models.
5. Save provider mappings.
6. Open one internal player profile from the squad.
7. Confirm the frontend reads only Touchline database/internal API.

Why this test first:

- it validates competitions, teams, squads and players together
- it helps fix current club profile and player profile needs
- it avoids Live Arena complexity
- it proves the database-first model

## Engineering Recommendation

Build next:

1. Sportmonks live credential validation.
2. Provider coverage test for selected Starter leagues.
3. Internal database tables for provider entity mappings.
4. Team/club sync proof-of-concept.
5. Squad-to-player sync proof-of-concept.
6. Player profile enrichment from Touchline database.

Do not build:

- Fantasy scoring
- Live Arena
- betting/trend widgets
- full global sync
- direct Sportmonks frontend calls

## Final Decisions

### Essential for Touchline V1

- Competitions / Leagues
- Seasons
- Teams / Clubs
- Team Squad
- Player Profile
- Fixtures
- Calendar
- Standings

### Postpone

- Livescores
- Lineups
- Events Timeline
- Match Centre
- Group Standings
- Injuries & Suspensions
- Head2Head
- Commentaries
- TV Stations
- News

### Never Use in V1

- betting odds
- value bets
- betting-style trends
- gambling-style predictions

### First Real Integration Test

Team → Squad → Player Profile through `FootballDataProvider`, saved into Touchline database, read by internal APIs.

### Next Engineering Step

Create the Sportmonks validation and provider mapping test using one selected league and one selected club, then persist normalized entities behind the database-first rule.
