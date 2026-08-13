# Legacy card model deprecation

Superseded public behaviour:

- deriving a public card tier or price directly from a valuation feed;
- rendering grey, pending, updating or fake-tier cards on a game surface;
- treating an active contract or a visual asset fallback as publication authority;
- exposing Market Value, market range, economic profile or valuation-source wording in a public card or zoom.

The canonical replacement is the manual market-value plus explicit publication lifecycle described in `TOUCHLINE_MANUAL_MARKET_VALUE_CARD_PUBLICATION_ARCHITECTURE.md`. Legacy valuation fields may remain temporarily in compatibility DTOs as `null` while consumers migrate, but they are not a source for a public card.
