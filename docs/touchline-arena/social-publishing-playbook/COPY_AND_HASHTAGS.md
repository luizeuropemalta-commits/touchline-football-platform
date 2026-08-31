# British English copy and hashtags

The executable LINE-UP copy contract is [`social-lineup-caption.ts`](../../../lib/touchlineArena/social-lineup-caption.ts).

## Copy rules

- Use British football language: `line-up`, `Full Time`, `fixture`, `Gameweek`, `goals`, `nil` when editorially appropriate.
- Be short, factual and fixture-specific: clubs, venue, Gameweek, kick-off/final score, formation or verified decisive events.
- Use `v` in the fixture label; avoid American sports phrasing.
- Never mention SportMonks, API, provider, internal pipelines, settlements or implementation details publicly.
- Never invent a statistic, narrative, assistance, coach role, player number, result or points explanation.
- Market open/closed controls squad editing only; player and coach scoring updates during the match and consolidates at full time.
- During QA, include `COMING SOON • CURRENTLY IN TESTING` wherever the current publication contract requires it.

## Canonical copy and channel adapters

- Generate one canonical British English editorial copy from one verified factual payload and bind both to a single `sourceChecksum`.
- Instagram and Club Owner Timeline adapters may change only presentation and channel-specific footer/CTA fields. They cannot change any fixture fact, score, event, player, rating, timestamp or factual statement.
- Instagram may include up to five approved hashtags, `COMING SOON`, and an approved swipe/Story CTA.
- Timeline omits hashtags and all Instagram-specific wording; it may expose internal comments/reactions only after their separate privacy/moderation contract is approved.
- Channel output also receives its own immutable presentation checksum. A factual or canonical-copy change invalidates every channel derivative; a presentation-only change invalidates the affected derivative.
- Any factual divergence between channel adapters is a fail-closed integrity error.
- Subject emojis follow the versioned [Canonical Social Icon Lexicon](CANONICAL_SOCIAL_ICON_LEXICON.md); adapters cannot make random or channel-specific substitutions.

## Hashtag policy

- Maximum five relevant hashtags.
- Prefer `#TouchLine`, the two verified club/fixture identifiers and one or two competition/Gameweek topics.
- Do not use misleading trend tags, unsupported player claims, repeated spelling variants or provider names.
- Hashtags are part of the caption checksum and require the same separate text approval.

Gap: no canonical automatic hashtag builder exists. Automatic generation must omit hashtags or remain `REVIEW_REQUIRED` until a typed, tested policy is implemented; an operator must not silently append text after approval.
