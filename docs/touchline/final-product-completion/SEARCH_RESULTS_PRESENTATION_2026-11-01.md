
## Busca ClubOwners — apresentação, 2026-11-01

MISSION: DAILY, apresentação dos resultados de amigos.
SCOPE: foto clicável e nome/seguidores à esquerda; taça e posição à direita; retirar Atualizar dados no erro de busca.
QA BRANCH: candidata local qa-stripe-release-20261029, detached.
QA COMMIT: base 47ebfffbbda98cbb89bcd3ad08fb19efd1e50694, WIP preservado.
QA DEPLOYMENT: não realizado. REMOTE BUILD CONSUMED: 0.
FILES CHANGED: ClubOwnerSearch.tsx, ClubOwnerSearch.module.css, clubowner-search-dialog-browser.test.mts.
FUNCTIONAL: 3 PASS, 0 FAIL; Chromium com componentes reais e dados sintéticos, PT/EN, 390/1280px. WebKit/Firefox não executados nesta rodada. Foto e nome apontam para o mesmo perfil; teste de teclado considera ambos. Busca pode ser reenviada com Enter e ao editar texto.
VISUAL: captura mobile inspecionada, sem sobreposição; fundo e foco verde preservados. Evidência artifacts/clubowner-search-ui-20261101.
ACCESSIBILITY: taça decorativa, posição rotulada, foco de teclado verificado.
SECURITY: nenhuma alteração de autenticação ou dados.
TESTS: /tmp/search-layout-browser-final.log. TypeScript exit 0, lint focado e diff check.
BUILD: não executado nesta rodada.
OBSERVABILITY: testes HTTP interceptados; não provam servidor QA.
OPEN FINDINGS: @ID único como alex23 ainda não implementado; requer campo e unicidade transacional, sugestões no cadastro, busca pelo handle e preservação do UUID interno. Não simular @ID a partir de nomes repetíveis. Integração/publicação e matriz restante pendentes.
PRODUCTION: NOT TOUCHED.
ROLLBACK: reverter somente os hunks desta apresentação, preservar WIP anterior.


## Neon do avatar — 2026-11-01
Adicionado ao componente compartilhado ClubOwnerPublicAvatar: traço circular luminoso na cor do plano, volta a cada 2 segundos, isolado da foto e do botão de recuperação. Movimento desativado com prefers-reduced-motion. Plano não confirmado não recebe cor inventada.
Validação local: ESLint e diff-check sem erros; teste Chromium da busca 3 PASS/0 FAIL, WebKit/Firefox 2 SKIP. Screenshot mobile inspecionado; fotos sintéticas, não contas reais. Log /tmp/avatar-neon-browser.log. Sem deploy; Safari/iPhone e QA publicados ainda não validados neste lote.
