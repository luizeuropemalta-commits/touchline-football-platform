# Auditoria de continuidade — pós-jogo, pontos e ranking

Data: 01/11/2026. Candidata `qa-stripe-release-20261029`, HEAD `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694`, com alterações locais compartilhadas. Auditoria somente leitura do produto; este relatório é a única escrita deste lote. Não executados navegador, SQL, consultas remotas, testes ou build. Isto não é aprovação de lançamento.

## Estado reconciliado

| Frente | Evidência existente | Estado correto |
|---|---|---|
| Reconsulta pós-jogo | `live-sync-cadence.ts:91–108`; `live-sync.ts:196–214,345–367` | Implementada: 1 h nas primeiras 72 h, depois 24 h durante a temporada, tentativa antes da consulta, intervalo de falha e ordem contra bloqueio da fila. Não significa que cada dado oficial esteja completo. |
| Histórico e substituição dos pontos | Migrações `20261026121254_football_feed_revision_history.sql:21–77` e `20261001090049_touchline_fantasy_v4_raw_rating_transition.sql:163–203,300–328,425–444` | Revisões transacionais, repetição sem duplicar, reconciliação de rodada já encerrada quando a fonte muda. Testes anteriores são evidência local, não prova atual do site. |
| Diagnóstico dos treinadores | `AGENT_COACH_DIAGNOSTICS_IMPLEMENTATION_2026-11-01.md`; `live-sync.ts:524–546` e pipeline `fixture-schedule-store.ts` | Motivos seguros implementados localmente, com 113 testes previamente registrados. Erro genérico ainda encontrado em recibo hospedado não comprova ausência de atribuição no fixture. |
| VIP DRAFT | `AGENT_VIP_SCORE_READ_2026-11-01.md`; `gameweek-score-status.ts`; `FantasyGameweekClient.tsx:535–557,1051,1134` | Estado explícito local implementado. Conta sem seleção válida travada não deve ganhar pontos retroativos. Validação publicada ainda pendente. |
| Header e ranking de ClubOwners | `AGENT_HEADER_RANKING_2026-11-01.md`; `club-owner-standings-server.ts:12–70`; `club-owner-standings.ts:31–89` | Paginação e mesma projeção FINAL corrigidas localmente; 102 testes focados e 19 SQL registrados anteriormente. Não repetir ou somar totais como validação nova. |

Os caminhos de código desta tabela são relativos a `lib/football-data`, `lib/touchlineFantasy`, `lib/touchlineArena`, `app/fantasy` ou `supabase/migrations`, conforme o nome. Relatórios ficam neste mesmo diretório.

## Achados ainda abertos

### P1 — uma identidade incompleta bloqueia o fechamento das estatísticas

O recibo histórico em `AGENT_CURRENT_PUBLICATION_QA_2026-11-01.md` identifica o fixture canônico `499756e3-cedc-43cc-8131-5c2eac95ea69`, Sportmonks `19722185`. A linha oficial `14674515841` de um reserva não contém `playerId`. O baseline anterior não prova uma resposta HTTP original e não autoriza restaurar o ID antigo.

O root informou nova leitura QA às 09:00/09:02 UTC com esse único `playerFailedFixtureIds`, `coachPendingFixtures=[]`, nenhuma liquidação ausente e `cadenceExecuted=true`. Às 09:02/09:03 constavam `statistics-pending`, `ranking-source-incomplete`, sete `lineup-identity-pending` e diagnóstico genérico de treinador. Essa leitura é evidência fornecida pelo root em `artifacts/sync-read-followup-20261101/qa-0903.json`, não nova consulta deste agente.

**Os UUIDs em `lineup-identity-pending:<uuid>` são IDs de jogadores**, conforme `lib/football-data/player-season-statistics-store.ts:578–603`. Não são sete fixtures diferentes. O array `playerFailedFixtureIds` e `lineupIdentityIssues` são os campos para localizar partidas/linhas. O ramo preserva agregados e liquidações anteriores dos jogadores ambíguos, evitando inventar ausência ou zero; `:792–795` mantém o ranking incompleto.

Próximo passo operacional: obter uma nova projeção oficial pelo diagnóstico protegido existente do fixture, com admissão central de quota, e comparar a identidade da linha. Depois usar a reconciliação normal. Se a fonte continuar sem ID, manter pendência e encaminhar ao fornecedor; não casar por nome, não usar baseline como correção e não publicar snapshot à força. O root também observou `admission_denied_before_http` às 09:01 e adiamento de `19722197/19722196`: isso comprova recusa antes do HTTP naquela tentativa, não resposta vazia do fornecedor nem a causa específica da recusa. Investigar o recibo de admissão, sem bypass.

### P1 — SSR e cliente ainda usam autoridades diferentes de ranking

`lib/touchlineArena/card-ranking-server.ts:14–33` e `coach-ranking-server.ts:58–78` leem os ponteiros ativos independentes. Já `sports-publication-server.ts:18–40` e `card-ranking-client.ts:35–42` usam os IDs imutáveis fixados pela publicação compartilhada. `components/touchline/cards/TouchlineCardLeadershipBoundary.tsx:17–21` recebe o seed independente e depois a publicação; `card-leadership-authority.ts:37–49` aceita corretamente reversão para uma publicação válida anterior.

Consequência concreta: uma página pode renderizar ranking B no servidor e voltar para A ao receber a publicação compartilhada. Há consumidores diretos em `app/rankings/page.tsx:153`, `app/touchline-clubs/[club]/page.tsx:654,717`, `app/touchline-players/[player]/page.tsx:804`, `public-season-player-points-server.ts:73` e `authoritative-roster-server.ts:495`. A divergência foi observada no recibo QA das 02:10–02:18, mas não foi relida por este agente.

**Próximo patch local mínimo executável:** fazer os loaders públicos SSR resolverem ambos os rankings a partir do mesmo envelope compartilhado, usando `readPublishedTouchlineLivePresentationInput` como dependência de nível inferior e os leitores imutáveis estritos existentes. Separar leitura de ponteiro técnico do produtor, se necessária. Evitar dependência circular com `sports-publication-server.ts`, que já importa os leitores. Não escolher o snapshot pela data mais nova, pois rollback legítimo é permitido.

Testes proporcionais recomendados: ponteiro independente B/envelope A produz A em SSR e cliente; jogadores/treinadores/prêmios pertencem ao mesmo envelope; rollback B→A preservado; envelope ausente/inválido falha explicitamente sem converter indisponibilidade em pré-temporada/zero. Esta correção unifica a autoridade, mas não resolve sozinha a atualização bloqueada abaixo.

### P1 — publicação global acopla Live válido a pendências históricas de ranking

`lib/football-data/live-sync.ts:552–573` grava o snapshot canônico e só publica o envelope compartilhado se não houver fixture falho, liquidação ausente ou erro dependente de publicação. Uma identidade antiga ainda incompleta pode impedir a distribuição de placar/minutos válidos de outro jogo. `live-score-persistence.ts:9–46` prioriza a publicação compartilhada e não troca livremente por uma fonte mutável mais recente.

É uma limitação de disponibilidade concreta da arquitetura, não justificativa para afrouxar integridade. A leitura antiga confirma envelope criado em **27/10 às 08:50 UTC**, com ranking fixado diferente do ponteiro independente posterior; não confundir a data de criação do envelope com datas dos rankings internos.

Proposta após resolver a fonte: envelope versionado com proveniência, cobertura e atualização por domínio, permitindo Live canônico confirmado acompanhado do último ranking completo e indicação real de pendência. Exigir recibo único/CAS, referências imutáveis e consumidores compatíveis. Não remover o `if`, chamar publisher isoladamente ou misturar dois snapshots silenciosamente. Testes devem provar isolamento de falha histórica, preservação do ranking anterior e ausência de placar publicado quando a gravação canônica falha.

### P1 — o catálogo de treinador depende de dados removidos pela sanitização

`lib/football-data/fantasy-store.ts:14–26` e `provider-payload-sanitize.ts:44–68` removem `raw` antes de salvar. Porém `supabase/migrations/20261027210242_touchline_coach_catalogue_editorial.sql:141–171` procura nome oficial em `source.raw.coaches`; `:241–242` impede aprovação sem nome. O caminho persistido normal não fornece esse campo. O diagnóstico local esclarece a falha, mas não implementa a identidade histórica adicional.

Além disso, `:250–266` publica identidade **e muda `current_assignments`**. Não usar esse comando para cadastrar o treinador histórico `30314` como atual sem prova de nome/associação atual; não transferir seus pontos para `523911`.

Próximo patch já especificado em `AGENT_PRIVATE_COACH_IDENTITY_PROJECTION_2026-11-01.md`: projeção privada permitida por campos antes da sanitização, vinculada à revisão/feed confirmado por hash e comparação de versão; staging protegido que rejeita fonte substituída; publicação histórica separada de nomeação atual. O protótipo e seus testes documentados não equivalem a implementação. Não reter `raw` irrestrito nem inventar nome/clube.

### P2 — falha posterior de ranking impede avanço da cadência da consulta

`live-sync.ts:94–105` ancora a cadência somente no último run `success` com `cadenceExecuted=true`. `:609–616` transforma o run em `partial` se o ranking permanece pendente, mesmo que a consulta HTTP tenha sido válida. `live-sync-cadence.ts:74–84` usa essa âncora para os intervalos de 1/5/60 minutos. Assim, depois do intervalo vencer, um downstream persistentemente parcial pode solicitar nova consulta a cada cron; a quota continua protegida, mas o intervalo pretendido deixa de refletir consultas bem-sucedidas. Não é prova de consumo excessivo medido nesta auditoria.

Próximo patch local: recibo separado de consulta oficial concluída, inclusive resultado vazio válido, sem declarar o processamento geral concluído. Não basta aceitar todos os runs `partial`. Testar HTTP válido + ranking pendente respeitando próximo intervalo, reconciliação persistida continuando sem novo HTTP, recusa pré-HTTP não avançando a âncora e falha do fornecedor mantendo a política de retry.

## VIP DRAFT e números que não devem ser “consertados”

A leitura anterior da VIP, entre 05:37–05:42 UTC, documentou confirmação da revisão 72 e movimento de jogador na revisão 73 sem nova confirmação válida. O fechamento rejeitou a seleção e não gerou `locked_selections`. O SQL de pontuação exige esse registro imutável. Alterar só o DRAFT ou creditar a formação corrente produziria pontuação não autorizada pela escalação fechada. O comportamento local corrigido é explicar a seleção inválida e oferecer reconfirmação enquanto o mercado estiver aberto.

Na mesma leitura, a Standard tinha 41,19 provisórios na rodada e ambas tinham zero FINAL na temporada. Esses valores podem coexistir corretamente. Ranking de atletas, pontos da rodada de ClubOwner e total FINAL da temporada são projeções diferentes; não substituir um pelo outro. A fonte atual dessas contas não foi reconsultada nesta auditoria.

## Ordem de execução recomendada

1. Local: unificar a autoridade de SSR e envelope, com testes delimitados. Root: conservar recibo da recusa e projetar a identidade oficial quando a admissão permitir.
2. Local: fechar a proveniência privada de treinador e a publicação de identidade histórica sem mudar nomeação atual; separar sucesso da consulta da conclusão da reconciliação.
3. Revisar o contrato de publicação por domínio antes de desacoplar Live. Só publicar com versão/recibo e consumidores coerentes.
4. Após os patches e fonte resolvida: reconciliação normal, inspeção da mesma revisão em Live/cards/rankings/ClubOwner; teste de correção tardia repetida; VIP sem lineup não recebe pontos e nova rodada confirmada recebe. Manter gates remotos/dispositivos pendentes até haver prova.

## Registro obrigatório da missão

**MISSION:** auditoria estática pós-jogo → pontos → rankings, incluindo VIP DRAFT.
**SCOPE:** fonte local e conciliação de relatórios; correções apenas propostas.
**QA BRANCH:** candidata detached `qa-stripe-release-20261029`; destino futuro `qa`.
**QA COMMIT:** base `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694`; WIP compartilhado não aprovado para release.
**QA DEPLOYMENT:** não inspecionado nem alterado neste lote.
**REMOTE BUILD BUDGET / CONSUMED:** nenhum solicitado / zero.
**STABLE QA URL:** https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
**FILES CHANGED:** somente este relatório.
**FUNCTIONAL RESULT:** cinco achados delimitados; correções locais existentes preservadas como locais. Pendências `BLOCKED` para correção neste lote por escopo somente leitura; próxima ação exata acima.
**VISUAL / RESPONSIVE / ACCESSIBILITY RESULT:** não avaliados nesta missão.
**SECURITY RESULT:** gates preservados; sem consultas remotas, segredos, alteração de ponto ou dado de cliente.
**BROWSER MATRIX / TESTS / BUILD:** não executados; resultados antigos foram apenas conciliados.
**OBSERVABILITY:** referências por arquivo/linha; evidência QA histórica distinguida das leituras novas informadas pelo root.
**OPEN FINDINGS:** identidade de reserva, autoridade SSR, bloqueio global de publicação, identidade editorial de treinador e âncora de cadência.
**PRODUCTION:** NOT TOUCHED.

| TOOL / PLUGIN | RELEVANT | LOADED | EXECUTED | RESULT | EVIDENCE |
|---|---|---|---|---|---|
| Shell / leitura de fonte | Sim | Sim | Sim | HEAD e caminhos conferidos; nenhuma execução de produto | referências acima |
| Supabase | Sim, para regras da auditoria | Skill lida | Não | Sem SQL ou dados remotos deste agente | escopo registrado |
| apply_patch | Sim, documental | Sim | Sim | Novo relatório, sem editar produto | este arquivo |
| Browser / testes / build / deploy | Não neste lote | Não | Não | Não há PASS novo de runtime | escopo registrado |
