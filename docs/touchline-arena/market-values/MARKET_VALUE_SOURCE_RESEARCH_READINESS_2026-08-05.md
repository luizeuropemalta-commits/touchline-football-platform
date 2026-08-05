# TouchLine England Market-Value Research — Source Readiness

Status: `EXTERNAL_HARD_GATE` for bulk value ingestion and public publication.

## Commercial enquiry status — 5 August 2026

TouchLine has requested a Football Benchmark demonstration and commercial
quotation limited to **Player Valuation**. The request was submitted as a
Football agent / representative by TouchLine's Founder & Director. Its stated
objective is to let licensed football agents using TouchLine consult player
valuation data. No Club Finance & Operations, Social Media Analytics, Youth
Football, scouting, player analysis, contract, agent or other data module has
been requested as part of this initial purchase.

The requested initial valuation coverage is the first divisions of England
(Premier League), Spain (La Liga), France (Ligue 1), Brazil (Série A) and
Germany (Bundesliga), with Malta coverage requested for confirmation.

The enquiry asks for the smallest suitable plan, permitted delivery method
(CSV and/or API), update cadence, commercial price, and rights to store and
publicly display approved values through the TouchLine read model. This gate
remains unresolved until Football Benchmark returns a written proposal and
licence scope.

## Research result

Football Benchmark documents coverage of all Premier League club players and
four/five valuation dates per season. Its Data & Analytics page identifies the
Player Valuation product as a subscriber platform with configurable data
access/downloads. The public methodology describes the model but does not
grant TouchLine a reusable data licence.

FootballTransfers documents a monthly-updated Estimated Transfer Value model
and public player pages expose individual ETVs. Its available public
methodology does not establish a bulk-reuse or republication licence for
TouchLine.

## Safe boundary applied

- No automated scraping or scraper API is used.
- No external source is called during gameplay.
- No player value from either source has been imported, approved or published.
- No card tier, border, nominal price, active-season contract or historical
  classification was changed.
- The Market Value Engine remains ready for reviewed CSV/Excel/licensed-adapter
  input and keeps players honestly in `Market Value Pending` until then.

## Evidence samples (research only — not TouchLine data)

- FootballTransfers currently presents Erling Haaland at EUR 154.3m, dated
  1 July 2026, on its public player page.
- FootballTransfers currently presents Bukayo Saka at EUR 104.7m, dated
  1 July 2026, on its public player page.

These observations are not inserted into any TouchLine table or import file.
They only verify that the proposed secondary source has current individual
pages and explicit valuation dates.

## Required external resolution

Obtain written confirmation or a licence covering TouchLine's intended use:

1. internal research and storage of individual values;
2. bulk import for the England player population;
3. public display of a TouchLine-approved value derived from the source; and
4. refresh frequency and any attribution obligations.

After that, an authorised operator can provide the source export or approved
CSV. The existing import workflow will validate canonical identity, preserve
history, queue conflicts, require review and keep all public wording as
`TouchLine Verified`.

## Sources consulted

- https://footballbenchmark.com/player-valuation-methodology
- https://footballbenchmark.com/en/fb-intelligence
- https://www.footballtransfers.com/en/about-us/data-algorithms
- https://www.footballtransfers.com/en/players/erling-braut-haaland
- https://www.footballtransfers.com/en/players/bukayo-saka/stats
