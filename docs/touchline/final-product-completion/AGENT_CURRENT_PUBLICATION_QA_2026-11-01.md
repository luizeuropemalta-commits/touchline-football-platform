# QA — sincronização e publicação após reinício

Inspeção de 01/11/2026, aproximadamente 02:10–02:18 UTC. Escopo somente leitura da QA `xgxbwqxjssxxuihuwmgy`. Nenhuma consulta à Production, segredo extraído, chamada de sincronização, RPC de reconciliação/publicação, DDL, alteração de pontos ou teste pesado.

Evidência: `artifacts/official-fixture-read-20261101/current-qa-publication-readonly.json`. Consultas executadas pelo conector Supabase: SELECT de recibos, feeds, revisões, snapshots, catálogo privado e definição de função. A leitura da definição não executou a função.

## O cron está executando, mas não distribui uma publicação nova

- Recibos de `live_scores` confirmados a cada minuto entre 02:05 e 02:11 UTC, todos `partial`. Recibo 02:11: `4d995432-f824-48bd-88fb-711fe4ca15c3`.
- Nessa execução, `fetched=0`, `fantasyFeedsStored=0`, `playerFixtureRowsWritten=4866`, `coachPointsReconciled=0`. O contador de linhas não prova alteração numérica: é reprocessamento da fonte persistida, não evidência de 4866 correções novas.
- Há feeds reconsultados hoje, por exemplo `19722120` às 01:57:01.716 UTC e `19722114` às 01:44:02.824 UTC. Isso comprova atividade de consulta no servidor, não resolução do fixture bloqueado.
- O snapshot compartilhado continua `b4f638e3-6f8a-45fd-83d5-8939577059b7`, criado em 27/10 às 08:50:14.895 UTC, com Live `fetchedAt=2026-10-27T08:50:00.094Z`.
- Ele fixa ranking de jogadores terminado em `c39d0ddc`, enquanto o ponteiro independente ativo fixa `8e46d087`, ativado em 27/10 às 08:59:13.554 UTC. Não há autorização para misturar esses dois estados numa tela.
- Treinadores continuam no snapshot ativo terminado em `e60b41592264d0c9ea80263139a17ec1`, de 25/10. Há candidata privada mais recente, descrita abaixo, que não foi publicada.

## Identidade de jogador ainda pendente no dado persistido

O único `playerFailedFixtureIds` do recibo é `499756e3-cedc-43cc-8131-5c2eac95ea69`, Sportmonks `19722185` (30/08/2026). Último feed salvo: 31/10 às 15:07:05.773 UTC; última tentativa: 15:07:05.227 UTC.

A linha `14674515841`, Fulham `11`, reserva `Macauley Zepa`, camisa 35, não contém `playerId`. Os sete erros `lineup-identity-pending` são jogadores canônicos afetados por essa ambiguidade, não sete fixtures diferentes. O ranking acusa `ranking-source-incomplete` e o ciclo de rodada acusa `statistics-pending`.

O histórico prova a mudança do importado: revisão 33 (`existing_baseline`) continha `playerId=37740887`; revisão 34, importada em 27/10, já não contém esse campo. A revisão 237 de 28/10 continua sem ID e acrescentou atribuição completa dos treinadores. Baseline não é resposta HTTP original; **não restaurar 37740887 com base apenas nesse histórico**.

A cadência local reconsulta jogos com mais de 72 horas uma vez por 24 horas. Portanto a ausência de nova leitura desse jogo entre 15:07 e 02:11 é compatível com a cadência; não demonstra cron parado. O dado atual da Sportmonks ainda precisa ser consultado pela integração protegida.

## O bloqueio de treinador não é falta de atribuição no fixture 19722185

- Os 88 fixtures `Full Time` da temporada têm `coachAttribution.status=complete` nos feeds consultados.
- O recibo atual tem `coachPendingFixtures=[]` e erro genérico `coach-points:attribution-pending`.
- A função SQL instalada devolve também `ok=false` por `coach-editorial-identity-pending`, `season-unavailable` ou `fixture-results-unavailable`; o chamador reduz esses motivos à mesma mensagem genérica. Não interpretar essa mensagem como prova de atribuição esportiva ausente.
- Candidata privada mais recente: `coach-v2:1e83121b-b778-459b-b9a0-7cf1eaff5729:df797964ebe4451a73f1c886b3159e61`, gerada em 01/11 às 01:21:11.960 UTC, 88 fixtures e 21 treinadores.
- Comparação exata com os 20 IDs do seed da candidata: o ID adicional é `30314`, Newcastle, com 13 pontos. O seed tem `523911` para Newcastle, que aparece na candidata privada com zero pontos. Não inferir que são a mesma pessoa nem transferir pontos entre IDs.
- O catálogo privado está instalado, porém `revision=0`, `editorial_enabled=false`, `public_enabled=false`, sem publicações, observações, candidatos ou vínculos atuais. Assim, não fornece a identidade histórica adicional. A falta do ID `30314` no seed é compatível com o ramo `coach-editorial-identity-pending`; o recibo publicado não preserva o objeto `ranking` para comprovar diretamente o motivo retornado naquela execução.

Próxima correção de observabilidade: guardar motivo seguro de `coachReconciliation.ranking` e IDs editoriais pendentes, distinguindo-os de `pending` por fixture. Depois verificar a identidade oficial 30314 e preparar a publicação revisada no catálogo, preservando os registros históricos e a identidade separada 523911. Não desativar o bloqueio nem editar o snapshot ativo diretamente.

## Caminho oficial sem copiar credenciais

O check do root em `environment-check-network-20261101.log` foi executado: `executed=false`; token Sportmonks, token de worker, URL/ref QA não foram fornecidos ao processo em valores utilizáveis. Não ocorreu o GET oficial. Não repetir extração de variáveis nem contornar a autoridade de quota.

Na sessão de ADMIN já autenticada na QA, o diagnóstico existente é:

`/api/football-data/provider-diagnostic?scope=fixture&fixtureId=499756e3-cedc-43cc-8131-5c2eac95ea69`

O código exige proprietário, ambiente QA e valida competição/temporada antes de usar o provider com quota central. Não persiste futebol ou pontos; admissão/conclusão de quota pode registrar recibos operacionais. Se retornar `provider-lineup-identity-invalid`, preserva-se a pendência; se retornar sucesso, a projeção permite verificar o ID da linha. Esse endpoint não projeta treinadores. Sua disponibilidade na versão publicada ainda precisa ser conferida pelo root; este agente não abriu o navegador, para evitar concorrência sobre a sessão.

Para a identidade do treinador, usar a fonte oficial já autenticada e o fluxo editorial `/admin/coaches`, confirmando os gates reais antes de qualquer comando. Não usar o catálogo atual de clube como prova de treinador histórico da partida.

## Próxima ação mínima

1. Executar uma leitura protegida do fixture pela sessão ADMIN existente e guardar apenas a projeção segura. Não alterar identidade por nome nem usar o baseline como substituto.
2. Corrigir a observabilidade do resultado do ranking de treinadores e resolver a identidade editorial adicional 30314 pela fonte oficial/catálogo, sem atribuir seus pontos a 523911.
3. Só após fonte e identidades verificadas, executar o caminho normal autorizado de reconciliação/publicação e comprovar a mesma revisão em Live, cards, rankings e ClubOwner. Não chamar o publisher isolado.

MISSÃO: diagnóstico atual QA. RESULTADO: cron ativo, bloqueios persistidos e divergência de publicação identificados com recibos. LOCAL/QA: leitura delimitada; nenhuma validação visual ou de lançamento. ARQUIVOS: este relatório e recibo JSON. BUILD/DEPLOY: nenhum. PRODUCTION: não tocada.
