# Publicação compartilhada e identidade pendente — auditoria somente leitura

Data: 01/11/2026. Agente: `social_finance_admin_finish`. Candidata: `worktrees/qa-stripe-release-20261029`, base `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694` com WIP compartilhado congelado pelo coordenador.

**Estado: diagnóstico e proposta; nenhuma correção implementada neste recorte.** Leitura de fontes e artefatos existentes, sem consulta remota, credenciais, alteração de política, SQL, testes ou código de produto. A suíte serial do coordenador não foi repetida nem considerada concluída por este agente.

## Resposta objetiva

Uma identidade ausente em uma partida histórica deve impedir inferências sobre o jogador afetado e a publicação de um ranking que dependa dessas inferências. Não precisa impedir, por natureza, a apresentação de placares e minutos oficialmente confirmados de outras partidas. Hoje o código acopla essas entregas: a ingestão válida pode avançar e a publicação pública compartilhada continuar antiga.

Isso **não prova erro nos números da Sportmonks**, nem autoriza atribuir a linha sem ID pelo nome, apagar a linha, transformar desconhecido em ausência ou conceder prêmio manualmente. O bloqueio numérico é uma proteção real. O alcance global do bloqueio é uma limitação de disponibilidade da arquitetura atual, incompatível com a expectativa de manter a Live atualizada apesar de uma pendência histórica isolada.

## Cadeia comprovada no código

| Etapa | Evidência | Comportamento atual |
|---|---|---|
| Identidade ausente de um reserva | `lib/football-data/player-season-statistics-store.ts:578` | Se um jogador conhecido não aparece identificado na escalação e há reserva sem ID do clube compatível, não é seguro concluir que o conhecido esteve ausente |
| Proteção do jogador | Mesmo arquivo, 585–603 | Registra `lineup-identity-pending`, fixture e linhas afetadas; preserva o agregado e **todos** os settlements daquele jogador. O `continue` também impede recalcular outros jogos válidos desse mesmo jogador nesta execução |
| Outros jogadores | Mesmo arquivo, 746–769 | Agregados e settlements válidos de jogadores não ambíguos ainda são gravados. A presença de erro não significa zero trabalho confirmado |
| Ranking de atletas | Mesmo arquivo, 792–795 | Qualquer `lineup-identity-pending` devolve `ranking-source-incomplete` antes do rebuild global; o último snapshot completo permanece |
| Estado e janela da rodada | `lib/football-data/live-sync.ts:461`, 476–504 | Fixtures canônicas podem ter sido persistidas; janela Fantasy e reconciliação do ciclo de rodada continuam pelos RPCs próprios, com seus controles |
| Treinadores | Mesmo arquivo, 518–541 | Reconciliador pode confirmar jogos válidos e ainda retornar atribuições pendentes. O erro continua explícito no resultado |
| Snapshot mutável de Live | Mesmo arquivo, 547–554 | Montado com estados reconhecidos como persistidos, preservando o estado anterior de escrita falha; `football_live_snapshots` pode avançar mesmo com erro de ranking |
| Publicação compartilhada | Mesmo arquivo, 558–566 | Só publica quando não há fixtures falhas, cobertura faltante e erros dependentes. `lineup-identity-pending` e atribuição de treinador pendente bloqueiam o avanço |
| Exceções já delimitadas | Mesmo arquivo, 278–286 | Erros independentes de agenda/backlog já são separados e não seguram uma publicação válida. Pendências de pontuação não estão nessa exceção |

Reserva realmente não identificada, sem minutos/nota/evento e com papel conhecido é diferente de identidade malformada, jogador com evento, titular sem ID ou mapeamento ambíguo. Os testes existentes preservam essa distinção; não ampliar a tolerância para todos os casos.

## Ponteiros ativos não são a mesma publicação

Há três identidades distintas: ranking ativo de atletas, ranking ativo de treinadores e publicação compartilhada da apresentação. A última fixa IDs exatos dos rankings, um payload de Live e seus digests em um registro imutável, depois troca seu ponteiro numa transação.

- `supabase/migrations/20261011003000_touchline_live_presentation_immutable_publication.sql`: tabelas privadas, trigger de imutabilidade, função só para `service_role`, snapshot deduplicado por digest e troca atômica do ponteiro.
- `20261011004000_touchline_live_presentation_freshness_guard.sql`: exige snapshot de Live com menos de cinco minutos e relógio não adiantado além da tolerância.
- `20261011013000_touchline_live_presentation_score_payload_contract.sql`: valida forma, timestamps e identidade/proveniência dos fixtures; normaliza a forma de IDs capturada da QA sem patch arbitrário.
- O SQL fixa rankings completos V4/V2 atualmente ativos, mas **não prova que cobrem toda a Live atual nem lê o resultado da execução de sincronização**. A decisão de somente publicar após sincronização dependente bem-sucedida está no orquestrador. Portanto, chamar esse RPC diretamente para contornar o erro mudaria a política efetiva.
- `lib/touchlineArena/live-presentation-read-model.ts:230`: lê ponteiro compartilhado e payload exato. Falha/corrupção não autoriza procurar fonte mutável mais nova.
- `lib/touchlineArena/sports-publication-server.ts:18`: resolve somente os dois IDs fixados, confere suas coberturas e monta a publicação pública.
- `lib/touchlineArena/sports-publication.ts`: parser rejeita identidade/versão/temporada incoerentes; nunca preenche um membro ausente com um ponteiro ativo mais novo.

Prova histórica já registrada, **não revalidada remotamente neste recorte**: `STATUS_RETOMADA_2026-10-31.md:69–75` informa publicação compartilhada com ranking `c39d0ddc` de 25/10 e ativo `8e46d087` de 27/10. Também registra fixture Sportmonks `19722185`, Sunderland × Fulham, linha `14674515841` sem `playerId`, clube `11`, e atribuição de treinador pendente. Esses artefatos explicam a divergência então observada; não estabelecem o estado atual da QA em 01/11.

## Alcance real nos leitores

Não é correto afirmar que absolutamente todos os consumidores param na mesma revisão:

1. Live compartilhada, atualização cliente dos cards/prêmios, próximo jogo, carrossel e projeção ao vivo da tabela oficial acompanham a publicação compartilhada (`sports-publication-client/reader`, `card-ranking-client`, `sports-publication-official-table`). Podem permanecer na última revisão mesmo com dados canônicos mais novos.
2. `readPersistedLiveScoreSnapshot` em `lib/football-data/live-score-persistence.ts:9–46` prefere o payload compartilhado; somente ausência comprovada da **primeira** publicação permite compatibilidade com a tabela mutável. Publicação antiga/ilegível não cai para a fonte nova. Com idade superior ao limite padrão de cinco minutos, devolve `null`; leitores que pedem idade ilimitada podem reter dados antigos, sem reescrever timestamps.
3. O sinal compartilhado calcula `liveFreshness.degraded`; isso é saúde da publicação, não prova de atualização dos pontos. `resolveTouchlineLivePresentationTiming` já distingue `settling` quando o jogo acabou e falta cobertura de ranking.
4. `loadTouchLineActiveRanking` (`card-ranking-server.ts:14–33`) ainda lê o **ponteiro ativo de ranking**, usado no SSR de `/rankings` e ClubHub. Assim, SSR e atualização cliente podem partir de autoridades diferentes.
5. `card-leadership-authority.ts:37–49,89–105` aceita uma publicação compartilhada válida em ordem de ativação, inclusive um snapshot com data de criação anterior — isso é necessário para reversões legítimas. Não resolver a divergência escolhendo simplesmente a maior data; alinhar a autoridade do SSR e do cliente.
6. Pontuação/classificação de **ClubOwners** usa `touchline_fantasy_user_gameweeks` e scores FINAL pela projeção própria (`club-owner-standings-server.ts`), não o ranking de atletas compartilhado. Pode progredir pelo ciclo Fantasy quando suas fontes são suficientes. Não inferir que ela está atualizada ou parada só olhando o ponteiro de atletas.

## Classificação

| Item | Classificação |
|---|---|
| Não criar ausência/zero para jogador que pode ser o reserva sem ID | Requisito correto de integridade |
| Não publicar ranking completo a partir de fontes incompletas | Requisito correto; preservar último ranking comprovado |
| Impedir Live válida por pendência histórica sem relação com seu placar/minuto | Limitação concreta de disponibilidade decorrente de política explícita; não é erro acidental de parser |
| SSR pelo ativo e cliente pelo compartilhado | Duas autoridades reais na leitura; causa demonstrável da divergência de revisões. Sintoma visual atual exige inspeção publicada |
| Suprimir todos os jogos do jogador ambíguo | Conservador e seguro, mas amplo. Reduzir exige cálculo por fixture e cobertura do agregado; remover o `continue` sozinho é incorreto |
| Resolver o jogador pelo nome/apagar a linha/republicar ranking por fora | Não é correção aceitável |

## Menor caminho correto proposto

**Primeiro, resolução de fonte quando existir prova oficial:** recuperar novamente a fixture/escalação pelo canal protegido e verificar se o fornecedor entregou o ID ou uma retificação inequívoca. Confirmar separadamente a atribuição histórica do treinador. Se ambos forem corrigidos na fonte, o pipeline atual pode avançar sem alterar política. Se a fonte continuar incompleta, não marcar o problema como resolvido.

**Para continuidade durante uma pendência real**, manter o envelope compartilhado imutável, mas explicitar nele a cobertura e a atualidade de cada domínio. Não criar uma API paralela que leia tabelas mutáveis no browser.

1. Produzir recibo tipado por domínio e fixture: gravação canônica, placar/minuto, estatísticas, identidade de escalação, ranking de atletas e ranking de treinadores. Diferenciar pendência de fonte conhecida de falha de infraestrutura/escrita. Não usar apenas um prefixo de string numa lista de erros liberados.
2. Permitir nova revisão do envelope para fatos de Live persistidos e validados, mesmo com ranking pendente. Fixar nele o ranking completo anterior, com seu ID e seu `asOf` real, estado `pending_source` e cobertura efetiva. Se não existir anterior, manter indisponível; nunca transformar em pré-temporada ou zeros.
3. Não rotular o ranking antigo como revisado na hora do placar novo. Status da sincronização geral continua parcial/pendente internamente, com motivo claro no admin. O produto pode mostrar “Pontuação em atualização” e a última atualização do ranking sem expor IDs privados.
4. O publisher deve receber/validar o recibo e as revisões esperadas, com CAS e origem vinculada à execução; não simplesmente ler qualquer “ativo” que mudou enquanto a execução rodava. Snapshot, pins, estados de cobertura e ponteiro devem ser gravados na mesma transação, deduplicados por conteúdo.
5. A mesma revisão publicada deve servir ao SSR e às atualizações cliente de rankings/prêmios. Preservar reversões oficiais, empate e ausência de líder; não escolher o líder pela data mais recente ou pela opinião sobre a nota.
6. Ao corrigir a fonte, retentar a fixture, substituir settlements pelo identificador/versionamento existente, recalcular ranking completo e publicar envelope recuperado. Repetição sem mudança não duplica pontos, ranking ou recibos.
7. Reduzir o bloqueio por jogador a fixtures válidas é um segundo recorte: gravar settlements independentes, preservar os ambíguos, deixar agregado/ranking incompletos e impedir finalização baseada em ausência presumida. Não é necessário fazer isso para destravar apenas o placar/minuto válido; não ampliar o patch inicial sem necessidade.

Arquivos mínimos envolvidos no recorte de continuidade: `live-sync.ts`, contrato/serviço de publicação, migração do publisher, leitores SSR de ranking e estados de apresentação. **Não há patch seguro de uma linha removendo o gate.** A alteração do envelope precisa versionamento/compatibilidade testados; o formato V1 pode continuar legível durante a transição, sem inferir os novos estados quando ausentes.

## Verificação exigida antes de implementar/aprovar

- Fixture histórica com reserva sem ID + partida atual válida: placar/minuto atual avançam; jogador ambíguo permanece sem ausência inventada; ranking anterior conserva ID, cobertura e data, marcado pendente.
- Histórico ambíguo não retira pontos existentes, não produz zeros, não altera prêmios manualmente e não finaliza rodada indevidamente.
- Nenhum snapshot anterior: ranking indisponível, sem fingir pré-temporada; placar só avança com validação suficiente.
- Erro de escrita, fonte trocada, time/temporada errados, timestamps futuros, payload inválido ou receipt/CAS divergente continuam bloqueando a parte dependente; sem bypass mutável.
- Duas execuções concorrentes e reversão VAR: mesma autoridade SSR/cliente; ordem de ativação legítima, sem aceitar resposta atrasada ou somar pontos de novo.
- Correção da identidade e treinador recupera estado completo e todos os consumidores; repetição idempotente.
- Separar classificação dos atletas da classificação ClubOwner e provar a contribuição por rodada FINAL nas duas contas CUSTOMER QA.
- Estado visual de pendência legível, sem falso “100% sincronizado”. Conferir Live, card pequeno, zoom, perfil, ClubHub, tabela, prêmios e rankings na versão publicada.

Testes existentes consultados, **não executados neste recorte**: `touchline-player-season-statistics-pagination.test.mts:117–155`, `touchline-live-sync-outcome.test.mts:373–410`, `touchline-live-score-publication-boundary.test.mts`, testes da publicação imutável PGlite e consumidores compartilhados. O artefato `artifacts/local-card-integrity-20261031/sync-diagnostics-tests.log` registra cobertura anterior desses gates; seus PASS não aprovam a proposta nova.

## Registro da missão

MISSION: auditoria de alcance do bloqueio de publicação por identidade pendente. SCOPE: somente leitura de fonte/artefato e este documento; nenhum dado de conta/credencial lido. QA BRANCH/COMMIT: candidata detached base `47ebfff`, WIP congelado. QA DEPLOYMENT/REMOTE BUILDS: não executados; zero builds. FUNCTIONAL/VISUAL/RESPONSIVE/ACCESSIBILITY: sem nova aprovação. TESTS/BUILD: não executados pelo setor. SECURITY: sem SQL remoto, mudança de grants, segredo, política ou payload público. OBSERVABILITY: rastreio estático e evidência histórica delimitada. OPEN FINDINGS: continuidade por domínio e unificação de autoridade SSR/cliente são propostas abertas. PRODUCTION: NOT TOUCHED.

| Ferramenta | Execução | Limite |
|---|---|---|
| Shell, `rg`, `sed` | Leitura de fontes, migrations, testes e relatórios locais | Não demonstra estado remoto atual |
| Editor de arquivos | Este relatório e link no relatório próprio | Nenhuma fonte/teste alterado |
| Supabase/Vercel/navegador/Gmail | Não executados | Suíte do coordenador e congelamento preservados |
