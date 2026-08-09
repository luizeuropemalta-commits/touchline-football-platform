# Eight-locale surface release matrix

**Status: LOCAL GOVERNANCE CONTRACT / RELEASE BLOCKER UNTIL HUMAN REVIEW**

The exact approved locale set is:

`en-GB`, `pt-BR`, `es-ES`, `it-IT`, `fr-FR`, `ar-SA`, `tr-TR`, `de-DE`.

No other language is a release candidate. This matrix does not create copy,
enable a locale, or change a public URL. It records every surface that must be
reviewed before a locale can be called complete.

## Current truth

- Only English (United Kingdom) and Brazilian Portuguese have human runtime
  catalogues today.
- Spanish, Italian, French, Arabic, Turkish, and German remain disabled and
  canonicalize to English before SSR. They must not receive a document `lang`
  or UI label that implies localised content.
- Arabic is intentionally dormant. It needs a complete human catalogue plus
  explicit RTL reading, focus, swipe, icon, numeric/date and responsive-layout
  evidence before it may render.
- English/Portuguese runtime availability is not a whole-site release pass:
  route metadata, PWA/manifest, error/offline, authentication, private owner
  and Admin surfaces still require their own review evidence.

## Required surface inventory

The checked-in `locale-surface-release-manifest.ts` covers:

1. Root document and global navigation.
2. Club Hub, club/player/coach profiles.
3. Live, player-card rankings and tables.
4. Market and card surfaces.
5. Authentication and account recovery.
6. Private Club Owner, Admin and Inbox surfaces.
7. Metadata, PWA manifest, robots/sitemap and error recovery.

For every locale and every listed surface, record content, metadata, viewport
and persistence review. Arabic additionally records RTL review. The validator
fails closed for incomplete catalogues, unknown surfaces, missing review items
or missing Arabic RTL evidence.

## Human and visual release gate

Before a locale is enabled, its catalogue must satisfy the separate catalogue
review contract: source revision/hash, catalogue hash, named translator,
independent reviewer, UTC review time and all required namespaces. Then QA must
visit every listed route from top to bottom at desktop, mobile, tablet and
TV-like widths; verify first visit, language switching, reload/deep-link and
return persistence; test keyboard/touch, errors, and emitted metadata. Mobile
Safari/WebKit and Chrome Android are required. No fallback or machine-generated
copy may be represented as a completed human catalogue.

## Release consequence

The six absent human catalogues block Preview product QA and production
promotion. This matrix is a local safety/traceability improvement only; it
does not clear that gate.
