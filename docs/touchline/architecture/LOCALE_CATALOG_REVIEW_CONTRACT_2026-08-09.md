# Locale catalogue review contract

The exact approved vocabulary is `en-GB`, `pt-BR`, `es-ES`, `it-IT`, `fr-FR`,
`ar-SA`, `tr-TR`, and `de-DE`. No ninth language is allowed without a new
owner decision.

This local contract does not create copy or enable a route. It prevents a
locale code from being presented as translated merely because it appears in a
menu or URL.

Only `en-GB` and `pt-BR` have complete runtime catalogues today. No reviewed
human catalogue was found for `es-ES`, `it-IT`, `fr-FR`, `ar-SA`, `tr-TR`, or
`de-DE`; those six remain disabled and canonicalize to English rather than
rendering a false localized experience.

Before a future locale can publish, its record must include source revision and
hashes, catalogue hash, named translator and independent reviewer, UTC review
time, complete `core`, `auth`, `market`, `rankings`, `public-routes` and
`errors` namespaces, plus persistence, metadata, route and viewport QA.
Arabic additionally requires completed RTL reading, focus, swipe, icon,
number/date and layout QA. The validator fails closed for every missing item.

The eight-language release gate remains blocked until all human catalogues and
the full page-by-page visual/device matrix are complete.
