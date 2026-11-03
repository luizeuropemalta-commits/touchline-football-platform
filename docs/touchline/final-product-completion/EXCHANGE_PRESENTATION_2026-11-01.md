# Exchange — apresentação e evidências, 2026-11-01

Estado: VERDE LOCAL DELIMITADO. UI publicada ainda não atualizada. Não é aprovação do backlog completo.

## Pedido e implementação

Terminologia Card em português, ícone oficial da moeda e cor canônica amarela #f0c968 em todos os valores TC do painel. Negociações, confirmações, contratações, recibos e finanças usam o mesmo componente. Valores continuam vindo do estado/recibo original: nenhuma regra econômica, saldo ou contrato alterado por esta apresentação.

Histórico organizado em Trocas e Contratações. Recibos expansíveis, primeiro aberto; cards e resumo financeiro em colunas no desktop e empilhados no celular. Contratações exibidas em lotes de 12 com Ver mais. Estados de carregamento, indisponibilidade e cobertura parcial distintos. A arte do card é atual; nome/valor históricos permanecem fixados ao recibo.

## Evidência proporcional

- Quatro arquivos focados: 40 PASS / 0 FAIL / 0 SKIP. Log preservado no diretório abaixo; não somar com rodadas anteriores sobrepostas.
- Chromium: 1 teste, 4 cenários PT/AR em 390/1280; PASS. WebKit: 1 teste, mesmos 4 cenários; PASS. Componentes/estilos reais, fronteira HTTP e contas sintéticas. Não são testes físicos nem site publicado.
- Cenários: confirmação financeira, loading, recibos, troca de abas, 12→15 contratações, bloqueio Beta, resultado incerto recuperado com a mesma operação, reload, ausência de overflow e erros de página.
- Inspeção visual das capturas desktop PT, mobile PT/AR e contratações desktop concluída.
- ESLint nos 9 arquivos do delta sem erros; diff check limpo. TypeScript global passou no lote paralelo de pontos. Build final ainda pendente.
- Revisão independente encontrou um problema real de Tab no summary nativo; corrigido com tabIndex=0. A execução de navegador acima antecede esse pequeno ajuste de acessibilidade; a verificação de teclado após ele continua pendente.
- Uma execução anterior WebKit encontrou corrida no fixture ao recarregar durante o GET pós-recuperação. Fixture agora aguarda read inicial, confirmação, onCommitted e resposta GET concluída. Não foi suprimido pageerror. Não atribuir essa correção de teste ao produto.

Evidências: artifacts/exchange-presentation-20261101/ (logs, 40 capturas, SHA-256). Revisão: artifacts/coach-diagnostics-proposal-20261101/exchange-visual-final-review-20261101.json.

## QA real já comprovada, separada do novo visual

Troca 94b7b46d-45f0-4456-b354-4346a5bc4c72 aceita pela sessão CUSTOMER VIP no Safari. Standard entregou Pinnock 3M e recebeu Van Dijk 15M. Diferença 12M, taxa Standard 750 mil, bônus VIP 375 mil, retirada de circulação 375 mil. Recibo único; 35 jogadores por conta; nenhuma reserva residual. Após recarregar a sessão CUSTOMER Standard, UI mostrou saldo 2.250.000 TC e Van Dijk entre os fora do jogo. VIP mostrou 1.155.435.000 TC. Isso é evidência da troca publicada anterior, não do novo design.

## Continuidade

Usuário acrescentou busca social: retirar o formulário grande inline, colocar campo compacto abaixo de Encontrar amigos e abrir modal fumê preto transparente com blur canônico. Lista inicial de perfis públicos por ranking, filtrada por nome/ID, foto pública com aro verde, seguidores e seguir. Em implementação separada, preservando consentimento e dados privados.

## Registro de entrega

MISSION: apresentação Exchange e continuidade social.
SCOPE: candidata local; prova de persistência da troca já aceita na QA.
QA BRANCH: detached, destino futuro qa.
QA COMMIT: base 47ebfffbbda98cbb89bcd3ad08fb19efd1e50694, alterações não commitadas.
QA DEPLOYMENT: sem novo deploy.
REMOTE BUILD BUDGET / CONSUMED: 1 autorizado / 0 consumidos neste lote.
STABLE QA URL: https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
FILES CHANGED: ClubOwnerExchangeHub TSX/CSS, ExchangeNegotiations, TouchlineCreditAmount TSX/CSS, useExchangeHistory, exchange-hub-i18n, fixtures/testes relacionados.
FUNCTIONAL RESULT: local delimitado e persistência publicada anterior comprovada.
VISUAL / RESPONSIVE: Chromium/WebKit fixture desktop/mobile; falta QA atualizada e aparelhos reais.
ACCESSIBILITY: teclado compartilhado, controles canônicos, correção summary; rechecagem de Tab pendente.
SECURITY: comandos financeiros, autorizações e IDs preservados; nenhum segredo em evidências.
BROWSER MATRIX: Chromium/WebKit local; Safari nativo somente troca publicada anterior.
TESTS: 40 focados, 2 arquivos browser / 8 cenários. Não somar sobreposições.
BUILD: não repetido após este delta.
OBSERVABILITY: logs/capturas/hashes preservados.
OPEN FINDINGS: busca social, gates/integrações da lista integral, build/deploy/smoke e dispositivos.
PRODUCTION: NOT TOUCHED.

| Ferramenta | Ação | Resultado |
|---|---|---|
| Node/React/Playwright | Fixtures com componentes reais | PASS delimitado |
| ESLint/TypeScript | Lint focado e TS global do lote | Sem erro |
| Safari nativo | Recarregar e conferir Standard | Saldo/card persistidos |
| Revisão independente | Fonte e acessibilidade | Summary corrigido; rechecagem pendente |
| Vercel | Nenhuma publicação | Zero build remoto |
