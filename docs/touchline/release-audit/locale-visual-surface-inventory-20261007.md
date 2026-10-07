# Inventário reconciliado das telas visuais de idioma

2026-10-07. A expressão anterior “16 páginas” misturava telas com `/` (redirecionamento para intro) e `/auth/callback` (endpoint, sem UI). Este inventário separa as **16 telas visuais atuais do usuário** de redirects, endpoints, administração e ferramentas internas. “Fechado localmente” significa somente a amostra/estado exatos do recibo, não prontidão global para deploy.

| # | Tela | Recibo local |
|---|---|---|
| 1 | `/login` | `outputs/card-review-20260921/login-local-closure-20261007.md` |
| 2 | `/live` | `docs/touchline/release-audit/live-status-layout-fix-20261007.md` |
| 3 | `/register` | `docs/touchline/release-audit/register-local-closure-20261007.md` |
| 4 | `/forgot-password` | `docs/touchline/release-audit/forgot-password-local-closure-20261007.md` |
| 5 | `/reset-password` | `docs/touchline/release-audit/reset-password-local-closure-20261007.md` |
| 6 | `/intro` | `docs/touchline/release-audit/intro-local-closure-20261007.md` |
| 7 | `/touchline-clubs` | `docs/touchline/release-audit/clubs-directory-local-closure-20261007.md` |
| 8 | `/touchline-clubs/[club]` | `docs/touchline/release-audit/club-profile-local-closure-20261007.md` |
| 9 | `/touchline-players/[player]` | `docs/touchline/release-audit/player-profile-local-closure-20261007.md` |
| 10 | `/touchline-coaches/[coach]` | `docs/touchline/release-audit/coach-profile-local-closure-20261007.md` |
| 11 | `/rankings` | `docs/touchline/release-audit/rankings-local-closure-20261007.md` |
| 12 | `/touchline-player-card-rankings` | `docs/touchline/release-audit/card-rankings-local-closure-20261007.md` |
| 13 | `/clubowner` | `docs/touchline/release-audit/clubowner-local-closure-20261007.md` |
| 14 | `/inbox` | `docs/touchline/release-audit/inbox-local-closure-20261007.md` |
| 15 | `/notifications` | `docs/touchline/release-audit/notifications-local-closure-20261007.md` |
| 16 | `/football-search` | `docs/touchline/release-audit/football-search-local-closure-20261007.md` |

`/`, `/coming-soon`, `/arena`, `/arena/[zone]`, `/my-club` e `/fantasy` são entradas/redirecionamentos para superfícies acima; `/auth/callback` é endpoint. Administração e visual-qa/audit/preview/rehearsal ficam fora da revisão de oito idiomas acordada. Os testes de rota para raiz/persistência/callback passaram 42/42 nesta continuação, sem skips/falhas.

**Checkpoint de integração local posterior:** suíte consolidada no código após as 16 telas passou 4713/4713, sem falhas ou ignorados; TypeScript e build Webpack isolado passaram. Recibo e hash no `CURRENT_EXECUTION_LEDGER.md`. **Pendências antes da liberação:** as amostras locais não cobrem todo estado/dado real, todas as entidades, permissões, notificações entregues nem navegação autenticada. O gate dos seis novos idiomas continua OFF. Faltam revisão independente, candidata QA única, testes hospedados com separação QA/produção e só depois decisão de produção.
