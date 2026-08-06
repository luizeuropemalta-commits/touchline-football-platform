# TouchLine Market Transfer — Position Journey

Date: 2026-08-06

Application checkpoint: `0c8e3f9942fc9b77c07c554cd394f3aea6f9ffcf`

Production deployment: `dpl_12WhAtuYc5x8VpEU7XmQtXwZpFfG`

Production domain: `https://touchline.com.br`

## Approved squad composition

| Purchase step | Canonical bucket | Limit |
|---:|---|---:|
| 1 | Goleiro | 3 |
| 2 | Zagueiro | 6 |
| 3 | Lateral direito | 2 |
| 4 | Lateral esquerdo | 2 |
| 5 | Volante | 3 |
| 6 | Meia | 6 |
| 7 | Atacante | 8 |
| 8 | Centroavante | 5 |
|  | **Total** | **35** |

## Behaviour validated

- Coach remains the mandatory first Market Transfer decision.
- Formation is the mandatory second decision.
- The first squad is built in the approved positional order.
- Only the current incomplete position step is enabled during the first build.
- A completed position changes the active market filter to the next incomplete position.
- A full position offers contract replacement instead of allowing an additional player.
- Contract release retains the existing canonical no-refund rule.
- Unknown provider positions remain pending and cannot consume a contract slot.
- Sportmonks detailed position is preferred over its broad parent position.
- Mobile position filters are touch-scrollable, readable and do not create page-level horizontal overflow.

## Quality evidence

- TypeScript: PASS.
- ESLint: PASS.
- Full automated suite: 668 passed, 0 failed.
- Production build: PASS, 118 routes generated/validated.
- Preview: `dpl_HKg7j1uNo6XNChb6kCn7MTjZrKB6`, Ready.
- Preview URL: `https://touchline-arena-official-h8a48q82g-fifa-agent-plataform.vercel.app`.
- Production: `dpl_12WhAtuYc5x8VpEU7XmQtXwZpFfG`, Ready and aliased to `touchline.com.br` and `www.touchline.com.br`.
- Production smoke: home 200, login 200, protected Market Transfer localized redirect 307.
- Authenticated production DOM: `Goleiro 0/3`, `Zagueiro 0/6`, `Lateral direito 0/2`, `Lateral esquerdo 0/2`, `Volante 0/3`, `Meia 0/6`, `Atacante 0/8`, `Centroavante 0/5`.
- Desktop width 1280: no page-level horizontal overflow.
- Mobile 390×844: no page-level horizontal overflow.
- Browser console errors during production validation: none.

Screenshots remain in this folder and are intentionally not posted into chat.

## Result

The approved positional composition is published on `touchline.com.br`. The wider Final Product Completion mission remains in progress; this report closes only the authorised Market Transfer position-composition change.
