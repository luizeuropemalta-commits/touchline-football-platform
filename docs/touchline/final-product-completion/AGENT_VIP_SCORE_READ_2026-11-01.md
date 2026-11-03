# VIP — origem do zero na rodada 9

Consulta somente leitura em QA `xgxbwqxjssxxuihuwmgy`, em 2026-11-01 entre 05:37 e 05:42 UTC. Duas contas CUSTOMER de teste autorizadas. Nenhuma linha de dados, migração, flag, consentimento, dispositivo ou pontuação alterada.

## Resultado confirmado

O zero visível da VIP **não é uma soma de notas igual a zero**. Não existe linha de pontuação dessa conta. Seu XI foi confirmado, depois a coleção mudou sem nova confirmação; no fechamento, o servidor rejeitou o XI por elegibilidade, voltou a DRAFT e não gerou as seleções imutáveis usadas na soma.

| Evidência | VIP | Standard |
|---|---|---|
| user_gameweek | 6b2d1835-1c2b-460a-8744-a65f52fcf152 | 2f07ae4a-8739-4167-a59c-5e0e9e4af17f |
| Estado atual | DRAFT | LOCKED |
| Formação fotografada | 3-4-3 | 4-4-2 |
| Seleções de rascunho | 11 | 11 |
| Seleções imutáveis | 0 | 11 |
| Score de rodada | ausente | 41,19 PROVISIONAL |
| Rodadas FINAL da temporada | 0 | 0 |
| Soma sazonal FINAL | 0 | 0 |
| Plano ativo / fotografia | VIP / VIP | Standard / Standard |

A coleção atual da VIP é 4-4-2, revisão 82; a fotografia confirmada que ficou no rascunho é 3-4-3, revisão 72. Portanto a diferença de formação vista pelo coordenador também é explicada por fontes distintas, e não prova perda de uma configuração por navegador.

## Linha do tempo durável

- 2026-10-31 07:05:09.565714 UTC: operação `lineup/confirm` na revisão 72, formação 3-4-3, 11 jogadores; evento `XI_CONFIRMED`.
- 07:07:16.696095: revisão 73 move Valentín Barco de **titulares slot 5**, posição da fotografia confirmada, para **reservas slot 5**.
- 07:09:05.090372: revisão 74 move Granit Xhaka para titulares slot 6.
- 07:10:57.997486: revisão 75 muda formação para 4-3-3.
- 07:12:52.592919: revisão 76 move Cole Palmer para titulares slot 6.
- Não há outro `XI_CONFIRMED` depois dessas mudanças.
- 12:25:07.111493: evento VIP `XI_REJECTED`, motivo `LOCK_ELIGIBILITY_REJECTED`. No mesmo instante, a Standard recebe `XI_LOCKED`.
- Hora gravada de fechamento: 12:25 UTC; primeiro kickoff: 12:30 UTC. Isto antecede a correção de timing aplicada pelo coordenador em 1/nov. O novo timing não corrige uma fotografia já rejeitada nem autoriza pontuação retroativa.

## Critério exato e limites históricos

Foi lido o corpo **instalado na QA** de `touchline_club_round_is_owned`, `touchline_fantasy_lock_gameweek` e `touchline_fantasy_reconcile_gameweek`.

O guard de propriedade exige que a fotografia dos titulares/reservas continue igual à coleção por jogador, área e slot, e que os 11 selecionados continuem titulares. A mudança registrada de Barco já deixa a confirmação antiga incompatível. A operação de formação e as entradas posteriores não foram acompanhadas por reconfirmação.

A leitura atual do guard é false para VIP e true para Standard; plano, treinador, quantidade relacionada (20) e orçamento são válidos hoje. O guard atual lista divergências de área/slot e três selecionados antigos que não são titulares atuais. Como também houve mudanças posteriores para testes, **a lista atual inteira não é apresentada como fotografia exata das divergências às 12:25**. O evento histórico guarda o motivo genérico, não cada predicado; a operação 73 e a ausência de nova confirmação são evidência direta do descompasso pré-fechamento.

O fechamento só cria `locked_selections` para CONFIRMED elegível. Rebaixa os CONFIRMED restantes para DRAFT com auditoria. A reconciliação soma apenas quem possui essas seleções imutáveis; por isso não cria score para a VIP. Não é falha de aritmética nem motivo para inventar uma linha de score.

## Fonte das notas, cron e temporada

Existem contribuições individuais da rodada para os jogadores presentes no rascunho VIP, como Vuskovic 7,19, Matheus Nunes 6,50, Barco 6,39, O'Reilly 7,14, Haaland 6,56 e Doku 8,15. São linhas da fonte de pontuação individual; **não são pontos adquiridos pela VIP**, pois esse XI não foi travado.

A cron QA `touchline-qa-live-sync` está ativa a cada minuto; as três últimas invocações consultadas constam succeeded. Os seis últimos eventos SCORE_RECONCILED entre 05:35 e 05:40 indicam nenhuma linha alterada e allFixturesFinal=false. Isso confirma reconciliação recorrente, não aprovação integral do fornecedor: os últimos runs de `football_data_sync_runs` constam **partial** e um running, a investigar no setor de sincronização. Nenhum erro/payload potencialmente sensível foi exportado.

As duas contas têm só uma user_gameweek na temporada e nenhuma rodada FINAL. O total sazonal é de fato zero para ambas; o patch local de ranking competitivo não converterá 41,19 provisórios em final nem criará score para a VIP.

## Origem da apresentação e correção proposta

`lib/touchlineFantasy/server.ts` lê a tabela de scores e usa `number(score?.gameweek_score) ?? 0`. `FantasyGameweekClient` exibe o número em resumo e Arena. A ausência legítima de uma linha torna-se visualmente indistinguível de uma pontuação real zero.

O cliente já calcula `hasUnsavedChanges` e retira a indicação `lineupConfirmed` quando a coleção diverge. Porém o aviso se resume a “Alterações não salvas” no rodapé, enquanto o fechamento mostra mercado fechado. Isto não explica claramente a perda de elegibilidade. A coleção foi salva; o que falta é **reconfirmar a escalação para esta rodada**.

Correção recomendada para todos os clientes, sem recalcular:
1. Projetar status de pontuação separadamente do número: sem escalação válida, aguardando apuração, provisório ou confirmado. Não usar ausência como 0,00.
2. Exibir aviso de reconfirmação junto ao resumo/ação de escalação quando titulares, reservas, treinador ou formação mudarem, enquanto mercado estiver aberto.
3. Depois do fechamento e sem XI travado, mostrar “Sem escalação válida nesta rodada”; remover sugestão de confirmar no mercado fechado. Manter histórico e saldo.
4. Notificações de escalação válidas complementam a UX, mas não substituem confirmação. A instalação do schema de notificações não comprova entrega.
5. Melhorar futuramente auditoria do lock para registrar causas individuais (plano/treinador/propriedade etc.), sem gravar informação pessoal desnecessária.

O coordenador recebeu os paths propostos antes de qualquer edição. Ainda **não aplicado no momento dessa leitura**; implementação local posterior registrada abaixo. Não corrigir a conta manualmente para fabricar pontos, nem transformar esse incidente de fixture QA em concessão retroativa a clientes.

## Evidência e missão

Evidência reproduzível: `artifacts/avatar-notifications-20261031/vip-score-read-20261101.json`, cinco consultas SELECT e resultados limitados, incluindo funções de leitura/lock/reconciliação consultadas por definição.

MISSION: explicar ausência de pontos VIP e orientar correção de UX.
SCOPE: duas contas de teste QA, leitura SQL e código, artefato e relatório próprios.
QA BRANCH: candidata qa-stripe-release-20261029; base 47ebfff, WIP compartilhado.
QA COMMIT/DEPLOYMENT: nenhum criado por este agente.
REMOTE BUILD BUDGET / CONSUMED: 0 / 0.
FUNCTIONAL RESULT: causa comprovada; nenhuma correção de produto aplicada.
VISUAL / RESPONSIVE / ACCESSIBILITY: não executado; a observação da tela é do coordenador.
SECURITY: somente SELECT, sem segredos, sem auth payloads, Production intocada.
BROWSER MATRIX / TESTS / BUILD: não executados neste recorte.
OBSERVABILITY: timestamps e evento de rejeição preservados.
OPEN FINDINGS: apresentação não distingue ausência; aviso de reconfirmação insuficiente; sync partial é pendência independente.
PRODUCTION: NOT TOUCHED.


## Fechamento local posterior — apresentação e prevenção de confirmação perdida

Este adendo substitui o estado de implementação acima, preservando a leitura histórica e seus limites. O coordenador autorizou o patch de apresentação em `server.ts`, DTO de estado e `FantasyGameweekClient`, sem alteração de pontos, standings, escalações ou contas.

O contrato de estado agora transporta `gameweekScoreStatus`. A apresentação distingue `NO_VALID_LINEUP`, `PENDING_SCORE`, `UNAVAILABLE`, espera de confirmação/kickoff, ausência de rodada e pontuação `PROVISIONAL`/`FINAL`. Somente uma nota numérica finita não negativa com evidência de apuração aparece como número; um zero real continua sendo zero. Ausência, leitura falha e estado contraditório não fabricam zero nem pontuação. Rodada aberta/futura não é rotulada como inelegível. A pontuação sazonal mantém sua leitura independente.

Após uma escalação confirmada mudar com a coleção conhecida e a janela aberta, o cliente mostra aviso acessível junto à confirmação: é necessário **confirmar o XI novamente antes do início da rodada para pontuar**. Depois do fechamento sem XI válido, a mensagem explica a falta de escalação e preserva os pontos anteriores desta temporada; não oferece confirmação fora da janela. O poll com falha invalida a evidência da rodada sem apagar o valor sazonal conhecido. Resumo, Arena e DTO usam o mesmo estado explícito. Nenhum dado foi corrigido retroativamente.

### Verificação encerrada

| Gate | Resultado | Evidência |
|---|---|---|
| Função, servidor, DTO, poll e JSX real | 100 PASS / 0 FAIL / 0 SKIP | `artifacts/avatar-notifications-20261031/vip-score-focused-20261101.log` |
| ESLint focado | exit 0 | `artifacts/avatar-notifications-20261031/vip-score-eslint-20261101.log` |
| TypeScript global sem incremental | exit 0 | `artifacts/avatar-notifications-20261031/vip-score-typecheck-20261101.log` |
| Revisão independente do delta | Sem bloqueador concreto | `artifacts/avatar-notifications-20261031/vip-score-independent-review-20261101.json` |
| Navegador real / QA publicada | PENDENTE | Não comprovado por SSR, AST ou funções isoladas |
| Build / suíte ampla consolidada | Não executados neste recorte | Gates do coordenador para o pacote completo |

A rodada focada anterior terminou com 99 PASS e uma falha de fixture por `releasePlayerId` ausente no novo teste de renderização. A fixture foi completada e a rodada final acima substitui esse resultado; não somar contagens. O primeiro TypeScript incluiu indevidamente os `.ts/.tsx` preservados em artifacts; só essas cópias foram renomeadas para `.preimage`, mantendo seus hashes. A execução global final passou. Os arquivos de produto não foram relaxados para contornar essas falhas de execução.

Cobertura relevante: revisão 7,19 → 7,02 sem alteração de regra de soma; zero real; falta de score; DRAFT fechado; CONFIRMED aguardando worker; janela aberta; falha de leitura; resposta DTO; independência da temporada; aviso de reconfirmação embutido e standalone; ação fechada indisponível; ausência de falso aviso enquanto coleção carrega; oito catálogos de idioma existentes. Testes por JSX não equivalem a inspeção visual de Safari/iPhone.

Manifest e pré-imagens delimitam o delta sobre WIP pré-existente: `artifacts/avatar-notifications-20261031/vip-score-presentation-manifest-20261101.json`. A cópia de cada arquivo modificado foi preservada antes da edição; `preserved-paths.json` mapeia o nome original ao arquivo `.preimage`. Nenhuma alteração deste lote foi commitada ou publicada pelo agente.

### Próxima validação no produto

Na candidata com os arquivos deste manifest, verificar com uma conta QA em janela aberta: confirmar XI, alterar titulares/reservas/formação, observar o aviso junto ao botão, reconfirmar e conferir remoção do aviso. Na VIP da rodada 9 fechada, confirmar traço + mensagem de XI inválido em vez de 0,00; na Standard, conferir 41,19 provisório enquanto a fonte continuar nesse valor. Uma falha transitória do score deve mostrar indisponibilidade sem apagar a temporada. Comparar desktop, Arena e mobile; não reabrir a rodada nem atribuir pontos para testar esse aviso.

MISSION: informar pontuação com evidência e evitar perda silenciosa de confirmação do XI.
SCOPE: status de rodada, DTO, resumo/Arena e aviso de reconfirmação; local com testes delimitados.
QA BRANCH: candidata qa-stripe-release-20261029; base 47ebfff, WIP preservado.
QA COMMIT / DEPLOYMENT: nenhum criado por este agente; patch ainda não publicado.
REMOTE BUILD BUDGET / CONSUMED: 0 / 0.
FILES CHANGED: 6 arquivos de produto e 7 testes listados no manifest; relatório e artifacts próprios.
FUNCTIONAL RESULT: VERDE LOCAL, 100 testes focados; nenhum ponto retroativo.
VISUAL / RESPONSIVE / ACCESSIBILITY: vínculos ARIA/role testados; aparência e aparelhos ainda não aprovados.
SECURITY: nenhum write remoto; histórico QA só leitura, sem segredos; não amplia confirmação fora da janela.
BROWSER MATRIX: não executada neste recorte; gates publicados e físicos pendentes.
TESTS: 100 PASS / 0 FAIL / 0 SKIP; ESLint exit 0; TS global exit 0; revisão independente sem bloqueador.
BUILD: não executado neste recorte.
OBSERVABILITY: timestamps do incidente, pré-imagens/hashes e logs preservados.
OPEN FINDINGS: validação da UI após integração/deploy; sincronização partial segue pendência independente; detalhe por predicado no evento de lock é melhoria futura.
PRODUCTION: NOT TOUCHED.

## Follow-up: prova de navegador local — bloqueio de ambiente preservado

Em 2026-11-01T06:36:24.773388+00:00, o coordenador solicitou verificação renderizada de ausência de XI VIP, 41,19 provisórios Standard, apuração pendente, indisponibilidade e zero real, nas larguras 390/1280 e idiomas PT/EN. O preflight local bloqueou **antes de abrir o navegador**, porque havia 2172542976 bytes livres e a reserva padrão exige mais de 5.368.709.120 bytes. Nenhum override de disco/memória foi aplicado, nenhum navegador iniciou, nenhuma conta ou dado foi alterado. O diagnóstico `sysctl kern.memorystatus_vm_pressure_level` também foi negado no sandbox; não há confirmação de pressão normal neste recorte.

A busca por harness encontrou o browser original do XI (`tests/touchline-my-club-xi-browser.test.mts`), o bundler isolado compartilhado e os testes existentes de métricas/workflow. Para o escopo proporcional, foi preparado um harness **somente em artifacts** que extrai diretamente as declarações e JSX do produto para resumo, aviso e ações; usa o CSS real e os catálogos reais. A origem dos estados, o resultado pré-computado de mudanças e o destino do callback save são fronteiras sintéticas explícitas. Isso não prova autenticação, fetch real, salvamento de XI ou a página inteira.

- Runner: `artifacts/avatar-notifications-20261031/vip-score-browser-proof-20261101.mjs`.
- Dependências do fixture: `artifacts/avatar-notifications-20261031/vip-score-browser-fixture-20261101.js`.
- Matriz preparada: Chromium/WebKit, PT/EN, 390/1280, cinco estados de pontos e três estados de reconfirmação, ações embedded/standalone; 128 cenários previstos, **zero executados**.
- Comando: `node --experimental-strip-types artifacts/avatar-notifications-20261031/vip-score-browser-proof-20261101.mjs`.
- `node --check` passou; modo `--prepare` compilou as declarações/JSX e dependências sem navegador.
- Receipt de fontes e HTML isolado: `artifacts/avatar-notifications-20261031/vip-score-browser-20261101/`.
- Resultado: `BLOCKED_BEFORE_BROWSER`, zero casos; `vip-score-browser-proof-20261101.log` e `vip-score-browser-20261101/result.json`.

O harness verifica texto, status/valores, temporada independente, links de ranking preservados, aviso/ARIA, reconfirmação somente em janela aberta, callback sintético sem disparo quando fechado, foco e overflow. Prevê capturas para inspeção humana depois da execução. Capturas ainda **não existem**; preparação de HTML não é PASS visual. Não repetir sob a mesma falta de capacidade; próximo gate é recuperar os recursos exigidos e então executar/inspecionar a matriz. O produto continua VERDE LOCAL nos 100 testes focados anteriores, **navegador/visual BLOCKED**, QA publicada PENDENTE. Production permanece intocada.
