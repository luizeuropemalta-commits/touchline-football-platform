# Exchange — leitura pendente não é indisponibilidade

## Diagnóstico delimitado

O root observou na QA o painel Histórico de transferências inicialmente exibindo indisponibilidade de trocas; na leitura seguinte do Safari, sem reload, apareceu o recibo da troca aceita. Isso não demonstrou falha persistente da RPC, perda do recibo nem erro no saldo. Esta missão não acessou o Safari, não escreveu na QA e não reproduziu novamente a operação.

A causa concreta no código local e na base HEAD era `useExchangeHistory` retornar `null` tanto antes da conclusão do GET como após uma resposta inválida/indisponível. O Hub convertia imediatamente qualquer `null` em mensagem de indisponibilidade. O endpoint e o DTO foram lidos; a evidência atual não justifica alterá-los.

## Correção de responsabilidade deste agente

- `components/touchline/market/useExchangeHistory.ts`: resultado tipado com `idle`, `loading`, `ready` e `unavailable`. Somente `ready` contém histórico confirmado. Mantidos conta, temporada, revisão, cancelamento, leitura sem retries e ausência de valores fabricados.
- `tests/touchline-exchange-history-client.test.mts`: transições de leitura pendente, vazio confirmado, erro real, descarte de resposta cancelada e ocultação imediata do histórico da conta anterior.

O root é responsável pela adaptação de `ClubOwnerExchangeHub.tsx`, mensagens localizadas e testes do Hub. O consumidor deve usar `remoteHistory.history`; quando não há histórico pré-carregado e `status === 'loading'`, deve mostrar carregamento tanto no histórico quanto nas receitas. `exchangeHistory: null` explícito continua indisponível; `undefined` continua solicitando leitura autenticada. Não se deve tratar timeout, erro ou contexto divergente como histórico vazio.

## Evidências

- `artifacts/exchange-history-loading-20261101/focused.log`: cliente, apresentação e composição real de rota/adapter em harness, 14 PASS / 0 FAIL / 0 CANCELLED / 0 SKIP, 1246.636875 ms.
- ESLint dos dois arquivos de responsabilidade do agente: exit 0.
- `git diff --check` dos dois arquivos: exit 0.
- `artifacts/exchange-history-loading-20261101/typecheck.log`: 3 entradas (2 arquivos + next-env), zero diagnósticos. Verificação restrita; diagnósticos de dependências não foram incluídos.
- Revisão independente de `publication_current_data`: nenhum bloqueador concreto de privacidade/cancelamento; confirmou fence por conta/temporada/revisão, descarte de respostas canceladas e distinção de vazio válido. Não reexecutou testes; integração do consumidor permanece sob revisão do root.

## Limites e continuidade

Esta correção é local. O estado inicial e a transição no painel publicado precisam ser comprovados após publicação da candidata. Não houve alteração de taxa, bônus, saldo, recibo, histórico ou política de autenticação. Os testes anteriores de cliente/DTO continuam rejeitando histórico de outra conta/temporada/revisão e não transformam erro em zero.

## Registro da missão

**MISSION:** distinguir carregamento de indisponibilidade no histórico Exchange.
**SCOPE:** hook e testes focados; consumer/i18n pelo root.
**QA BRANCH:** candidata qa-stripe-release-20261029, detached.
**QA COMMIT:** base 47ebfffbbda98cbb89bcd3ad08fb19efd1e50694; alterações locais não commitadas.
**QA DEPLOYMENT:** nenhum realizado por este agente.
**REMOTE BUILD BUDGET / CONSUMED:** 0 consumidos.
**STABLE QA URL:** https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
**FILES CHANGED:** hook e teste listados acima; documento e artifacts de evidência.
**FUNCTIONAL RESULT:** verde local delimitado no estado da leitura; consumer integrado sob responsabilidade do root.
**VISUAL RESULT / RESPONSIVE RESULT / ACCESSIBILITY RESULT:** inspeção da nova apresentação ainda pendente; não declarar verde visual.
**SECURITY RESULT:** fences e descarte de resposta cancelada preservados e testados; nenhum segredo ou dado privado acrescentado.
**BROWSER MATRIX:** nenhum navegador executado neste lote; Safari sob controle do root.
**TESTS:** 14 PASS focados, sem somar sobreposições com outras suítes.
**BUILD:** não repetido; gate consolidado do root continua separado.
**OBSERVABILITY:** logs e hashes no diretório de artifacts.
**OPEN FINDINGS:** completar adaptação do Hub e comprovar transição publicada.
**PRODUCTION:** NOT TOUCHED.

| Ferramenta | Execução | Decisão |
|---|---|---|
| Shell/Git | Leitura do hook, cliente, DTO, rota, Hub e base HEAD | Identificada ambiguidade concreta de estado |
| Node/TypeScript | 14 testes, typecheck restrito, lint e diffcheck | Verde local delimitado |
| Safari / Supabase / Vercel | Não executados por este agente neste lote | Sem alegação de correção remota |
