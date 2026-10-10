# Live QA — investigação e execução isolada, 10 outubro 2026

## Correção local de fuso sem epoch — 10 outubro, 16:57 UTC

Defeito por inspeção: `sportmonksFixtureStartAt` devolvia `starting_at` bruto quando faltava epoch, perdendo o fuso enviado em date/between. Uma string sem offset não representa o mesmo instante em hosts diferentes. A fonte oficial [Sportmonks UTC](https://www.sportmonks.com/glossary/utc-time/) confirma UTC por padrão e alteração da representação quando a query pede outro timezone. Não atribuir todos os relatos remotos a esse fallback: os dados remotos também estavam antigos e ainda dependem de ingestão.

MISSION/SCOPE: CRITICAL ENGINEERING local. Manifesto: novos `lib/football-data/sportmonks-fixture-instant.ts`, `tests/sportmonks-fixture-instant.test.mts`; deltas restritos de `lib/football-data/providers/sportmonks.ts` e `tests/sportmonks-fixture-window.test.mts`. Epoch válido permanece prioritário. Sem epoch, formato/calendário/offset são validados; texto semoffset usa IANA da query ou UTCdefault. Candidatos são projetados de volta ao horário local; gap/fold retornam indisponível, nunca horário inventado. Temporada mantém seu fallback de data de calendário separado de kickoff. Query vazia é omitida pelo HTTP e agora também significa UTC no mapper.

TESTS:23PASS/0FAIL/0SKIP3793.68ms em instant/window/rail-i18n/central-provider;8PASS/0SKIP305.06ms finais depois dos negativos adicionais. Cobertura: hostUTC/Malta/Brasil, verão/invernoLondres, cruzamentode meia-noite, Índia/Nepal, DSTgap/foldLondres/LordHowe, offsets explícitos, datas inválidas e epoch fora do intervalo sem RangeError. Provider real com HTTP sintético verifica fixture/date/between/inplay/latest e troca de fuso/cache. Typecheck restrito next-env+provider:554fontes/0diagnósticos;lintfocal0/diff0. Revisão independente semP1/P2 no algoritmo; observação timezonevazio reparada e retestada. Não há SQL/APIreal.

QA COMMIT: detached8cd7eae + árvore acumulada, sem commit limpo. QA DEPLOYMENT: nenhum; orçamentoGitnativo1apósgates/0consumido nesta fatia; alias não revalidado. BUILD/fullsuite:pendentes árvore atual. VISUAL/RESPONSIVE/ACCESSIBILITY/BROWSER: semnovaUI, não exercitados;não PASSremoto. SECURITY:segredos não usados/expostos. OBSERVABILITY: horário ausente permanece ausente; fontebruta preservada. OPEN: atualizar fixtures reais via autoridade, provar exibição/placares/eventos/horários em QA/.com.br. PRODUCTION NOT TOUCHED. Rollback: somente novosarquivos/deltasdesta fatia, preservando cache/guard e demais alterações. Ferramentas reais:fonte+docoficial,apply_patch,Node serial,tsc,lint,diff,revisor.

## Missão e limites

CRITICAL ENGINEERING: diagnosticar Live desatualizada e restaurar QA sob autorização humana. Não publicar, alterar Production, rotacionar credenciais sem necessidade, inventar placar nem contornar quota. Aceitação final: ingestão real, persistência e exibição de placares/eventos/pontos com fonte recente. Ainda NÃO atingida.

## Evidência remota

- QA Supabase: `xgxbwqxjssxxuihuwmgy`.
- Preview Ready: `dpl_7KyeoF1xFhBiFQKFXxTK5NhRxbbc`, SHA `8cd7eae73a584c2781aea3b2a446410189c80429`.
- Alias: https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
- `cron.job`: job5 `touchline-qa-live-sync`, `* * * * *`, inactive.
- Último live_scores antes do teste:30Sep19:18UTC,partial,0updated. Nenhum run em andamento na pré-condição.
- Vault: segredo QA presente e >=32caracteres (só booleano/tamanho mínimo consultados); URL confere exatamente com alias QA. Nenhum valor de segredo exportado.
- SUPERSEDED diagnóstico de segredo11caracteres: Vercel CLI58.11 usa `[SENSITIVE]` como placeholder ao exportar valores protegidos; enviar placeholder explica401, não prova defeito no segredo real.
- Metadados atuais Vercel: token Sportmonks configurado separadamente em Preview/qa e Production; isso NÃO prova contas/quotas diferentes. `TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE` ausente. Tabela `touchline_fixture_quota_scopes` QA sem linhas.
- Um único POST via `net.http_post`, Authorization construído no banco usando Vault, com pré-condições de URL, segredo e ausência de job/run ativo; request_id1.
- Resposta502, timed_out=false, erro público sanitizado. Run `d3c3eae8-f356-401f-9d24-a055de4ddb74`, início13:50:00.338UTC/fim13:50:00.529UTC, error/0updated. Logs Vercel confirmam fetched0, snapshotFixtures0, fantasyFeedsStored0, playerFixtureRowsWritten0, errorCount0 antes da correção local. O endpoint aceitou autenticação e iniciou o run, não avançou à ingestão.
- Factory no SHA remoto exige binding e lança erro quando ausente. Nenhum scope criado por conveniência; cron permanece pausado.

## Defeito corrigido localmente

Exceções anteriores ao preenchimento de `result.errors` eram finalizadas como erro sem categoria/error_message. Agora persistimos apenas estágio fixo seguro (`provider-initialization` ou `orchestration`), mantendo rethrow e finalização única. Mensagens privadas de exceções não entram em banco/logs. Não altera gates, algoritmo de pontos, dados ou chamadas ao provider.

Manifesto: `lib/football-data/live-sync.ts`, `tests/touchline-live-sync-outcome.test.mts`, `tests/touchline-live-detail-refresh.test.mts`, `tests/touchline-golden-fixture-distribution.test.mts`, `tests/touchline-arena-live-mirror.test.mts`, este relatório, CURRENT_STATE, CURRENT_EXECUTION_LEDGER e fila no workspace coordenador. Rollback local: retirar somente este delta, preservando alterações anteriores.

## Gate de conclusão

### Checkpoint 14:46 UTC — suíte local verde, integração ainda pendente

`release-final.log`: **4.918 PASS, 0 FAIL, 10 SKIP**,4.928testes/13suites,247153,05ms,exit0. Runner canônico de release com runtimes PGlite e2workers; exclusões documentais próprias do runner preservadas. Não equivale a todos os ensaios opcionais/QA remota. `live-browser-after.log`:5PASS/0SKIP emChromium, componente real comHTTPsintético; não prova dadoSportmonksatual. TypeScript completo apósproteção manualexit0; ESLintcompletoexit0/7avisosexistentes; diffcheck0. Revisão independente doúltimo contrato liveTimeZone também semachado.

Saúde: segunda leituraMac pressão2/30%livre,swap6,42GiB,disco8,6GiB. Terminada a suíte, nenhum build adicional iniciado; semlimpeza/killdosapps. Gate local de regressão verde, mas buildlocal/SHAclean/autoridadecentral/validaçãoremota continuam NO-GOpara publicação. Próxima etapa é integração centralOFF comprova concorrente, não repetir a descoberta da assinatura.

**MISSION:** preparar sincronização durável; **SCOPE:** correções locais, testes e desenho compartilhado; **QA BRANCH/COMMIT:** detached8cd7eae+alterações preservadas, sem nova candidata imutável; **QA DEPLOYMENT:** inalterado; **REMOTE BUILD BUDGET/CONSUMED:**1QAcondicional/0; **STABLE QA URL:** https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app; **FILES CHANGED:** manifestos abaixo; **FUNCTIONAL RESULT:** localparcialPASS; **VISUAL/RESPONSIVE/A11Y:** sem nova aprovação global; **SECURITY:** fronteiras preservadas/revisão independente; **BROWSER MATRIX:** Chromium sintéticoLive, nãoSafari autenticado nesta fatia; **TESTS:**4918/0/10 e5browser; **BUILD:** nãoexecutado; **OBSERVABILITY:** logs locais e diagnóstico remoto anterior; **OPEN FINDINGS:** centralquota, consumidores, frescordados,build/SHA/QA; **PRODUCTION:** NOT TOUCHED.

### Continuação — autorização de preparar Production, sem ativação

Owner confirmou preparar integração de autoridade única de quota também para Production, ativar apenas após QA. Contrato/inventário em `sportmonks-shared-authority-20261010.md`; implementação central ainda pendente. Nenhuma env, migration remota, scheduler, segredo ou Production alterados.

Correções adicionais reais: efeitos de sincronização do filtro de clube e fuso do navegador agora são adiados após commit, com cancelamento. Filtro inicial não agenda trabalho redundante; escolha manual invalida handoff pendente por geração. Revisão independente detectou essa corrida e confirmou o reparo sem novos P0/P1/P2. Não é alegação de ganho de desempenho nem prova de hidratação nativa.

Manifesto incremental: `app/fantasy/FantasyGameweekClient.tsx`, `components/touchline/match-centre/TouchlineMatchCentre.tsx`, `tests/touchline-post-mount-context-sync.test.mts`, `tests/touchline-market-club-handoff.test.mts`, `tests/touchline-fantasy-markt-redesign.test.mts`, novo contrato de arquitetura, estado/ledger/fila. Preservar todos os deltas anteriores nesses arquivos em qualquer rollback.

ESLint completo exit0/0erros/7avisos existentes (`lint-after.log`). Nova suíte global `release-after-contracts.log`: **4.917PASS/1FAIL/10SKIP**,211060,56ms. Última falha na expectativa que não aceitava `liveTimeZone` entre props do componente; teste atualizado para exigir explicitamente essa propriedade e 12focaisPASS. Novo global ainda necessário, não declarar zero falhas por inferência. TypeScript havia passado antes da última proteção de seleção; nova checagem em execução.

Gate continua **NO-GO DEPLOY**: autoridade central/consumidores, build, SHA limpo e aceitação remota pendentes. Orçamento remoto1QA autorizado após gates, consumido0; Production NOT TOUCHED.

### Atualização 14:30 UTC — execução por blocos autorizada

Owner autorizou um deploy **QA** ao terminar os gates e pediu monitoramentoMac20min. Produção permanece fora do alvo, mesmo com cota compartilhada. As automações `touchline-fechamento-cont-nuo` (50min) e `touchline-sa-de-do-mac` (20min) registram blocos/saúde; o monitor só admite descarte de temporários próprios com origem e ausência de uso comprovadas. Nenhuma exclusão executada.

Suíte global mais recente: **4.864PASS/45FAIL/10SKIP**, exit1,197346,74ms. Loglocal `/private/tmp/touchline-release-audit.MhDvld/release.log`. Anterior4.826/82/10 é histórico, não estado atual. Triagem posterior localizou contratos de testes obsoletos após alterações visuais aprovadas: remoção da faixa redundante, menu no header, orçamento no plano, novos dados de assinatura, Remover no zoom e área técnica. Corrigidos somente harnesses/expectativas; controles auth, idioma, read-only, posição e persistência preservados. Revisão independente semP0/P1/P2. Focais posteriores verdes não substituem novo global.

Manifesto adicional de testes desta continuação (todos em `tests/`, não inclui alterações preexistentes fora do delta):

- `touchline-market-route-draft-gate.test.mts`, `touchline-club-owner-avatar-context-server.test.mts`, `touchline-live-header-composition.test.mts`.
- `touchline-rankings-auth-error-envelope.test.mts`, `touchline-rankings-draft-integration.test.mts`, `touchline-navigation-waterfalls.test.mts`.
- `touchline-club-owner-avatar-ui.test.mts`, `touchline-player-card-rankings-draft-render.test.mts`, `touchline-match-centre.test.mts`, `touchline-public-motion-accessibility.test.mts`.
- `touchline-clubowner-auth-error-envelope.test.mts`, `touchline-clubhub-coach-category-showcase.test.mts`, `touchline-clubhub-draft-render.test.mts`, `touchline-clubhub-header-context.test.mts`.
- `touchline-ar-club-owner-market.test.mts`, `touchline-protected-market-vocabulary.test.mts`, `touchline-clubowner-embedded-market-navigation.test.mts`, `touchline-mobile-xi-interaction.test.mts`.
- `touchline-fantasy-market-metrics-i18n.test.mts`, `touchline-match-centre-draft-propagation.test.mts`, `touchline-fantasy-arena-projection.test.mts`, `touchline-fantasy-formatters-i18n.test.mts`.
- `touchline-position-picker.test.mts`, `touchline-player-zoom-caller-position.test.mts`, `touchline-market-game-page.test.mts`, `touchline-market-premium-pitch.test.mts`, `touchline-market-squad-builder-redesign.test.mts`.
- `touchline-fantasy-market-access-copy.test.mts`, `touchline-fantasy-market-workflow-i18n.test.mts`, `touchline-my-club-command-centre.test.mts`, `touchline-neon-identity-regression.test.mts`, `touchline-player-ranking-presentation-i18n.test.mts`.

Documentação: este relatório, CURRENT_STATE/CURRENT_EXECUTION_LEDGER e fila/release-blocks/mac-health no workspacecoordenador. Manifesto NÃO autoriza incluir qualquer outro delta automaticamente num commit. Rollback: somente estes ajustes novos, jamais reset de arquivo que contenha trabalho anterior.

Gate desta fatia: CRITICAL ENGINEERING local; branchdetached/HEAD8cd7eae+árvoresuja; deployment/aliasinalterados; orçamentoGit1apósgates/consumido0; funcionalparcial; auth/segurançapreservadas; visual/responsivo/a11y/browsernão reinspecionados nesta fatia de testes; tscpré-triagem0; buildnãoexecutado; global45falhasantes das correções mais recentes; quota global, SHAclean eaceiteremoto pendentes. **Production NOT TOUCHED.**

| Ferramenta | Ação real | Decisão |
|---|---|---|
| Node runner + PGlite | Suíte completa com2workers/runtimeSQL;197s |45falhas diagnosticadas, não deploy |
| apply_patch + Node focais | Atualizar32harnesses/contratos aprovados | Preservar controles, repetirglobal |
| Revisor independente | Revisão dos deltas de testes | SemP0/P1/P2; não é aceitevisual |
| AgenteMac + heartbeat nativo | MediçãoRAM/swap/disco; cadência20min | Sem alvo de limpeza comprovado, nada apagado |
| Automação de engenharia | Regras porbloco/cores eQAcondicional | Persistência sem ampliarProduction |

- QA branch: remota qa; checkout local detached,229caminhos alterados antes deste delta; não pronto para deploy.
- QA commit:8cd7eae remoto, patch local não publicado.
- Remote build budget/consumed: autorização QA anterior sujeita a candidata exata;0builds consumidos nesta rodada.
- Functional: PARCIAL; autenticação real provada, ingestão falhou.
- Visual/responsive/accessibility/browser: não exercitados nesta fatia backend; nenhuma aprovação nova.
- Security: segredo mantido no Vault; fail-closed preservado; sem alteração de ACL/credenciais.
- Tests:2regressões falharam antes;63testes focais passaram após correção (live-sync-outcome e fixture-authority). ESLint focal0; TypeScript completo `tsc --noEmit --incremental false` exit0; diff-check0 também após documentação. Diff final dos dois arquivos inspecionado, sem ampliar chamadas ao provider.
- Atualização14:10UTC: suíte completa executada,4.826PASS/82FAIL/10SKIP; build não executado. Revisão independente do patch diagnóstico sem achado material. Duas expectativas obsoletas daLive foram corrigidas depois dessa suíte;87focaisPASS/0FAIL/0SKIP incluindo novo controle positivo/negativo do efeito real de detalhe. A suíte completa ainda precisa repetir após triagem das demais falhas; não subtrair falhas aritmeticamente e declarar nova contagem global.
- Observability: falha real502 correlacionada entre request, run e logs; patch ainda só local.
- Production: NOT TOUCHED.

| Ferramenta | Executada | Resultado |
|---|---|---|
| Supabase CLI db query | Sim | Cron/Vault booleanos/runs/quota; um POST QA autorizado |
| Vercel CLI logs/env metadata | Sim |502eausência de binding confirmados, sem valores sensíveis |
| Node test / ESLint | Sim |63PASS/0FAIL;lint0 |
| Release preflight / Fiscal skills | Sim, gate leitura | BLOCKED: quota/candidata/gates pendentes |

## Bloqueio e próxima ação exata

SUPERSEDED bloqueio de identificação: painel autenticado em `my.sportmonks.com/subscriptions` confirmou FootballStarter, PremierLeague e2.000API Calls; owner confirmou explicitamente mesma assinatura paraQA/.com.br e únicaAPI de futebol. Não repetir perguntas/descoberta dessa identidade sem evidência de mudança. Nenhuma assinatura, cobrança ou token alterado.

BLOCKED: coordenação global. A factory atual executa quotaRPC no cliente Supabase do próprio ambiente. Repetir o mesmo account_scope em dois bancos independentes NÃO cria limite compartilhado. Production legado não possui quota_scopes; consumers não protegidos também precisam entrar no inventário. Não habilitar QA com alegação de proteção global inexistente.

Após identificação: configurar binding legítimo com escopo inicialmente desabilitado, coordenar consumidores compartilhados, validar schema/recovery, aprovar orçamento concreto de requests, preparar candidata limpa e único deploy Git QA. Executar uma sincronização controlada, conferir receipts/placares/eventos/pontos persistidos e só então retomar cron. Não alterar dados antigos para fabricar demonstração verde.

## Recuperação durável — não repetir importação por tentativa

Pedido humano: configuração estável, fácil de diagnosticar e com adaptador substituível no futuro. Estado atual abaixo distingue decisões de implementação concluída.

1. **Fonte/identidade:** Sportmonks permanece única fonte aprovada. O contrato `FootballDataProvider` em `types.ts` e o adaptador `providers/sportmonks.ts` já separam dados externos do produto. UUIDs internos, pontuação, orçamento e arte não devem depender de trocar o token ou da seleção visual de plano.
2. **Autoridade de quota compartilhada (pendente):** usar uma única autoridade durável para todos os consumidores dessa assinatura, sem credencialservice-roleProduction dentro dePreview. A alternativa de coordenação/broker precisa de projeto e revisão; não simplesmente duas tabelas com o mesmo nome. Mudanças emProduction continuam exigindo autorização própria. Manter cronQAOFF enquanto não houver coordenação comprovada.
3. **Inventário de chamadas:** factoryguarded usada porLive, fixture-schedule, starter, golden-boot eqa-twenty-club-roster. Factorygenérica ainda usada porcapability-sync, provider-diagnostic, sync-engine, qa-country-sync eplayer-profile-official; há HTTP direto emsearch-and-build-card. Inventário de fonte não prova que todos estejam ativos, mas impede assumir queLive é o único consumidor.
4. **Diagnóstico por camada:**401→autorização do endpoint;502antes deingestão +provider-initialization-failed→binding/provider;quota negada→receipt/cooldown/autoridade;run sucesso comsnapshot velho→persistência/projeção;UTCcorreto comhora visual errada→fuso. Não rotacionar credenciais, recompilar ou importar todo histórico como resposta genérica.
5. **Configuração persistente:** binding não secreto versionado/documentado, segredo somenteVault/envprotegido, gate separado de configuração, job idempotente. ReloadSafari/restart local nunca deve criar configuração nem acionar importação. Validar nomes/escopo antes de cada candidata; comparar drift sem exibir valores.
6. **Prova de retomada:**uma execuçãoQA delimitada, correlacionar run/receipt, HTTP/paginação, fixture atualizado, eventos, settlements, pontos e snapshot. Testar segunda execução idempotente e falha/retomada sem duplicação. Só depois habilitar a cadência acordada. Atualização contínua de placares é necessária; refazer configuração não.
7. **Troca futura deAPI:** novo adaptador deve passar o mesmo contrato, reconciliaridentidades porprovider+id, cobrirUTC/status/eventos/correções/paginação/limites. EnsaioQA ecutoverexplícito comrollback, sem misturar gols/resultados de dois fornecedores nem alterar pontos para compensar diferenças. Nenhum segundo provider foi implementado/contratado nesta rodada.

### Gate desta continuação

Prova adicional executada:17 testes de diagnósticos/autorização/provider exclusivoPASS; browserChromium sintético com componente real5PASS/0SKIP (503retém seleção e recupera no próximo ciclo45s; alertas recuperam sem escrita; troca de fixture não vaza detalhe anterior; idioma/reload preservam seleção). Total desta continuação109PASS em comandos focais distintos. HTTP inteiramente sintético no browser: não certifica ingestãoSportmonks nem dadosQA atuais. ESLint direto3arquivosexit0, diff-check0 e mission-governancePASS. `pnpm exec` tentou verificação/install e abortou antes de remover dependências porNO_TTY; executado eslint instalado diretamente, sem purgar ambiente. Não repetir instalação destrutiva com preview ativa.

MISSION: CRITICAL ENGINEERING, diagnóstico/triagem local. QA BRANCH:checkoutdetached; QA COMMIT:8cd7eae+delta local, semSHApublicável. QA DEPLOYMENT/URL:inalterados acima. REMOTE BUILD BUDGET/CONSUMED:0consumidos. FUNCTIONAL:87focaisPASS, sync real pendente. VISUAL/RESPONSIVE/ACCESSIBILITY:não alterados; sem novoPASS. SECURITY:guard preservado e teste de ausência de leitura protegida; semsecrets. BROWSER:painelSportmonks observado, não provaLivefresca. BUILD:nãoexecutado. OPEN FINDINGS:coordenação global,82falhas globais antes da triagem,10skips, árvore suja e publicação. PRODUCTION:NOT TOUCHED.
