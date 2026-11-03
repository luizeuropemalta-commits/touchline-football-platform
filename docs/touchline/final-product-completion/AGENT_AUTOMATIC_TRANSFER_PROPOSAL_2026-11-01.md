# Automação de transferências oficiais — proposta técnica, 2026-11-01

**Estado: PROPOSTA DOCUMENTADA; NÃO IMPLEMENTADA, NÃO ATIVADA, NÃO APROVADA NA QA.**

Auditoria somente leitura do código da candidata detached `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694`, incluindo WIP congelado pelo coordenador. Objetivo: completar o caminho de uma transferência oficial inequívoca de um jogador já publicado, preservando a identidade e a publicação do card. A suíte ampla do coordenador está em execução: nenhum fonte/teste foi alterado e nenhum SQL remoto, navegador ou processo pesado foi executado neste recorte.

Este documento detalha a pendência de automação já preservada em [STATUS_RETOMADA_2026-10-31.md](STATUS_RETOMADA_2026-10-31.md), seção “Auditoria da automacao de transferencias”. O estado remoto citado em documentos anteriores não foi consultado novamente; não constitui prova atual de configuração.

## 1. Caminho comprovado no código atual

| Etapa | Evidência local | Comportamento e limite |
|---|---|---|
| Captura | `lib/football-data/roster-reconciliation-server.ts:19–61` | Consulta 20 clubes pela fonte guardada, exige completude/frescor, salva snapshot. Cron só pode `capture`; não decide nem aplica. |
| Identidade do agendamento | Mesmo módulo, `rosterCronCommand`; `supabase/qa/touchline_roster_reconciliation_scheduler.sql` | Chave determinística por janela UTC de seis horas. Instalador cria cron pausado. Repetição recupera recibo antes de novo HTTP. Não representa transferência aplicada. |
| Fonte | `lib/football-data/providers/sportmonks.ts:760–872` | Base + enriquecimento; valida IDs, cobertura de todos os membros, limites e menor fetchedAt. Captura completa é observação da fonte, não uma prova independente de data efetiva ou histórico de uma transferência. |
| Guarda de endpoint | `app/api/football-data/roster-sync/route.ts` | Token dedicado comparado em tempo constante; POST apenas; estado collecting = 202, review = 200, recibo failed = 503. |
| Comando do dono | `app/api/admin/football-data/rosters/route.ts` | Sessão, owner, origem, corpo limitado e whitelist; ator vem da sessão. Nenhum cliente escolhe fatos, clube ou valor para aplicação. |
| Journal/locks | `supabase/migrations/20261027210456_roster_reconciliation_workflow.sql:83–158` | Advisory lock (900101,20); recibo por request UUID + ator + hash antes de gates; lease de captura 15 min; uma collecting global; valida QA, temporada corrente e fonte de até seis horas. |
| Decisão/CAS | Mesmo SQL, linhas 202–225 | Snapshot FOR UPDATE + revisão; últimas decisões por provider ID; apply exige approve, gate SQL, executor QA; advisory (900100,20), SHARE ROW EXCLUSIVE nas duas tabelas e comparação do baseline INTEIRO. |
| Aplicação | Mesmo SQL, linhas 226–271; `supabase/qa/011_touchline_qa_twenty_club_roster_atomic_apply.sql:104–240` | Reconstitui 20 elencos, chama executor legado atômico, restaura fatos de não aprovados na mesma transação, grava recibo. Conserva UUID por provider ID. Nenhuma chamada de republicação nesta cadeia. |
| Publicação existente | `app/api/admin/manual-card-editorial/route.ts:286–350` | Reconciliação manual aceita somente publicação já published, ignora campos editoriais enviados e passa patch vazio ao RPC existente. |
| Revalidação protegida | `20260819205247_touchline_card_engine_auto_publication.sql:66–224` e correções `20260819213849`/`20260819214250` | Trava jogador → vínculo → valor → publicação; exige um vínculo ativo e Premier League; reusa valor verificado, aplica overrides existentes, calcula completude e só sincroniza quando necessário. |
| Leitor | `lib/touchlineArena/card-publication-read-model.ts:85–117,243–292` | Publicação precisa coincidir com vínculo ativo/clube atual. Consulta nova com noStore; não disfarça vínculo antigo como card válido. Transferência sem republicação pode virar “publication pending”. |

A falha de integração é concreta: **aplicar o novo vínculo não reconcilia a publicação que aponta para o vínculo antigo**. A mesma combinação foi isolada em `tests/card-publication-integrity.test.mts`. Não é permitido resolver isso removendo a validação do leitor.

## 2. Escopo mínimo da primeira automação

Automatizar apenas `TRANSFER_REVIEW_REQUIRED` de **jogador canônico já existente e já publicado**, entre clubes suportados na competição/temporada ativa. Entradas novas, ausências, saída da liga, promoção/rebaixamento, treinadores e mudanças gerais de posição/nome/nacionalidade continuam filas próprias.

Elegibilidade reavaliada no servidor e no commit:

1. Snapshot imutável completo de 20 clubes, Sportmonks, temporada ainda corrente, até seis horas, sem IDs repetidos e sem alteração do checksum.
2. Provider ID identifica exatamente o mesmo UUID canônico; destino aparece uma única vez na fonte completa. Origem atual e histórico de vínculos conferem com o baseline desse jogador. Não resolver por nome.
3. Publicação anterior published, com identidade/vínculo de origem coerentes; valor **verified + confidence verified**, temporada editorial compatível e classificação derivada compatível com o valor. Um card publicado com valor provisional não entra neste recorte.
4. Destino é clube canônico suportado, com ativos reais de camisa/escudo/fundo disponíveis segundo o catálogo do produto. Ter apenas logo_url no banco não prova toda a arte.
5. Campo indispensável ausente, posição incompatível, múltiplos vínculos, conflito com override editorial ou publicação suspensa: deixar em revisão com motivo; não completar via IA.
6. Não sobrescrever override aprovado. Em especial, um override de camisa pode conservar o número do clube anterior: se contrariar o número oficial do destino, revisão explícita antes da automação.
7. Nenhuma decisão humana reject vigente para essa evidência pode ser contornada pelo worker. Registrar versão da política automática e respeitar pausa.
8. Não alterar preço/valor aprovado, carteira, contratos de ClubOwner, elenco fantasy, escalações congeladas, fixture histórico, pontos ou conquistas. Transferência real não é Exchange entre contas.

A proposta não transforma a confiança no fornecedor em garantia de verdade histórica. O recibo informa o que foi observado, quando, de qual fonte e versão; correção posterior gera nova observação e nova transação.

## 3. Menor delta seguro recomendado

**Não** simplesmente liberar `cron:roster-v1` para decide/apply, nem encadear apply e POST de publicação em duas requisições. Também não remover a validação QA existente. O primeiro caminho fica QA-only, com migração e release próprios; habilitação futura de Production continua gate separado.

Reusar captura, snapshots, provider guard, catálogo, derivação de publicação e projeção pública. Acrescentar um worker pequeno de operações por jogador e um comando SQL protegido que grava vínculo + publicação + recibo na mesma transação.

Por que uma operação por jogador: o CAS existente compara o snapshot inteiro e o executor regrava 20 elencos. Reutilizá-lo por item faz a primeira transferência invalidar o baseline das demais. Uma transação contendo todo o lote é menor em linhas, mas um único card sem completude bloqueia os demais. O novo comando deve aplicar somente o delta oficial do jogador selecionado; não criar um segundo sincronizador amplo.

### Arquivos/contratos propostos — nomes indicativos, ainda não criados

| Local | Delta proposto |
|---|---|
| Nova migração forward, criada pela CLI no momento da implementação | Policy auto_apply default false; journal de operações/attempts/recibos com RLS e ACL restritos; enqueue/claim/apply/status; ponte de publicação exclusivamente derivada com ator de sistema. |
| `lib/football-data/roster-reconciliation-server.ts` | Após capture/recuperação review, solicitar enqueue idempotente e drenar um lote pequeno; não chamar provider novamente para retentar aplicação. |
| `lib/football-data/roster-reconciliation-repository.ts` | RPCs tipados de fila/recibo/status; rejeitar respostas incompletas; códigos sanitizados. |
| `lib/football-data/roster-reconciliation-contract.ts` | DTO administrativo com estados por fase e motivos; manter comandos externos limitados. Não permitir ator/regra/valor/target arbitrário no corpo. |
| `app/api/football-data/roster-sync/route.ts` | Separar resultado da captura do resultado da aplicação e do backlog. Não retornar “sincronizado” se só capture passou. Worker somente com token dedicado e gates verificados. |
| Instalador QA de agendamento | Captura existente 6h permanece. Drenagem/retry em cadência curta separada, sem nova consulta Sportmonks, inicialmente pausada. Endpoint precisa tolerar reenvio/timeout do pg_net. |
| Status/UI administrativa de roster | Mostrar observação, validação, aplicação e publicação, com revisão/retry e motivo por jogador. Não substituir erros por “parcial” genérico. |
| Testes focados existentes + novos testes locais | Matriz indicada abaixo; sem atualização de testes antigos para mascarar mudança de regra. |

Uma segunda captura não deve apagar nem editar a primeira. Mesmo payload em outro snapshot pode gerar no-op confirmado; nunca nova versão/publicação sem alteração efetiva.

## 4. Operação, idempotência e recuperação

**Identidade proposta:** chave única derivada de snapshot ID + player UUID + policy version + before-binding digest + desired-binding digest. Envelope canônico/hashes persistidos; actor `system:roster-transfer-v1`, origem, season, provider ID, snapshots, publicação anterior e posterior rastreáveis. RequestId reutilizado com payload diferente deve falhar.

**Estados propostos:** queued → claimed → applied; alternativas retry_wait, review_required, superseded. O recibo de applied/no-op é imutável. Attempts append-only com erro sanitizado, next_attempt_at e duração. Não usar o mesmo estado “review” para afirmar aplicação.

**Claim:** transação curta, lock SKIP LOCKED ou mecanismo equivalente testado, claim token/version e lease finita. Número de tentativas/retry não deve impedir recuperação de recibo aplicado. Consulta de recibo vem antes dos gates/frescor; uma operação confirmada continua recuperável depois de pausa ou virada de temporada.

**Aplicação SQL proposta, uma transação por jogador:**

1. Recuperar recibo por operation key + hash; se existir, retornar exatamente o persistido.
2. Verificar token/version do claim, gates, QA target, season corrente, frescor do snapshot e decisão humana. Não aceitar evidência arbitrária do cliente.
3. Obter locks compatíveis com os escritores existentes: workflow advisory (900101,20) → roster advisory (900100,20) → mesmas tabelas football_players/football_squad_members. Manter timeout limitado. Na primeira versão conservar esses locks globais, embora largos; otimização por jogador é outro lote, após prova de concorrência.
4. Travas de linha em ordem estável e compatível: clubes necessários, jogador, memberships pertinentes ordenados, valor verificado, publicação e estado editorial. Repetir os checks de CAS **por jogador**, clubes/temporada e publicação/valor/overrides relevantes. Preservar bloqueio de writers que não seguem advisory. Concorrência com commands editoriais requer teste Postgres real de duas sessões; PGlite serial não basta.
5. Se o destino já está aplicado e publicação coerente: no-op confirmado, sem bump de versão/histórico. Se estado atual não coincide nem com before nem com desired: superseded/review; não reverter automaticamente uma transferência mais recente.
6. Alterar apenas fatos autorizados desse jogador: current_club_id, desativação do vínculo de origem, upsert do vínculo do destino e camisa oficial confirmada. Conservar UUID, vínculos históricos e source revision observada. Não inferir data efetiva passada nem carimbar todos os elencos como atualizados. Mudanças adicionais fora da allowlist vão para revisão.
7. Revalidar completude/valor/arte e republicar para o vínculo destino na **mesma transação**. Retorno REVIEW_REQUIRED ou inconsistência deve abortar as alterações desse jogador; não confirmar futebol novo com card quebrado.
8. Gravar recibo com before/after e versões/IDs de publicação/histórico, snapshot checksum, policy version e operador de sistema. Qualquer erro de publicação ou de recibo desfaz vínculo, publicação e auditoria desta tentativa juntos.

**Falhas:** crash antes do commit = nenhuma mudança; crash/resposta perdida após commit = mesmo recibo, sem nova versão; lock timeout/erro transitório = retry com backoff e teto, sem novo provider HTTP; lease vencido = claim novo com fencing token, worker antigo rejeitado; baseline/temporada alterados ou fonte expirada = não retentar cegamente, aguardar snapshot novo/revisão; operação em review não impede processar o próximo jogador.

**Compatibilidade com revisão manual:** o snapshot original permanece imutável. Quando uma operação automática é aplicada, o apply manual do snapshot antigo pode corretamente falhar `ROSTER_BASELINE_CHANGED`. A UI deve explicar a necessidade de nova observação. Não marcar todo o snapshot applied nem fingir que pendências foram concluídas. O status deve anexar os recibos automáticos por operação e manter os itens não tratados; captura subsequente reconcilia a fila sem reaproveitar decisões em evidência diferente.

## 5. Ponte de publicação: dois detalhes que não podem ser ignorados

### Ator real da automação

As funções atuais exigem `p_actor_id uuid`; tabelas de publicação/auditoria referenciam `public.users`. Não fabricar UUID de robô nem atribuir execução automática ao usuário como se ele tivesse clicado.

Proposta: extrair o núcleo já existente de derivação para helper interno não exposto e sem EXECUTE público, mantendo o wrapper humano atual intacto. O wrapper automático só o chama após validar operação/claim/policy. Registrar `actor_kind=system`, operation ID e `authorized_by` separado; audit humano pode ficar null onde o esquema já permite. Se houver constraints adicionais no banco real, validá-las no próximo gate antes de migrar. Não afrouxar a validação do endpoint humano.

### Guardas que a revalidação atual não substitui

`touchline_apply_card_editorial_review` consegue criar/publicar um card inexistente e a função derivada faz upsert. A limitação “já publicado” existe no handler HTTP, não como modo restrito do RPC. O novo caminho deve impor esse requisito **sob lock no SQL**, junto com publicação/version esperada e valor approved. Não chamar o RPC isoladamente com campo booleano de arte fornecido pelo cliente.

O cálculo de tier/preço permanece no Card Engine. Transferência por si só não autoriza mudar temporada editorial, valor, status ou classificação. Se os derivados atuais não coincidem com os previamente aprovados, encaminhar para revisão em vez de corrigir silenciosamente outra regra nesta operação.

## 6. Propagação e prova de produto

O leitor canônico já faz fresh read e protege vínculo; não é necessário inventar um cache paralelo de publicação. Isso não garante que uma aba aberta refaça a consulta nem que todos os consumidores usem o mesmo reader. Após commit, uma revisão/invalidacão de apresentação deve ser recuperável e separada do recibo de banco.

Proposta: outbox durável gravada junto com o recibo, deduplicada por operation ID + consumer/event. Evento sanitizado “card presentation changed” invalida/recarrega as projeções adequadas sem revelar auth IDs. Falha do refresh não desfaz transação confirmada nem repete escrita; retenta apenas a propagação. Não marcar UI atualizada apenas porque houve commit.

Provar por UUID: origem perde jogador no elenco real atual, destino ganha; card/zoom/perfil/Live/ClubHub/mercado/ClubOwner mostram vínculo e arte corretos; histórico da partida mantém clube da época e pontos; contratos, saldo, posição fantasy escalada e curtidas por identidade permanecem. Históricos e fotos/curtidas não são reatribuídos por nome. Prêmios e rankings não podem aceitar mapeamento antigo de clube/temporada.

## 7. Testes necessários antes de qualquer habilitação

Estes são critérios propostos, **nenhum executado neste recorte**.

- Captura incompleta, stale, fora da temporada/QA, ID duplicado, origem ambígua, ausência da fonte: zero mutações.
- Transferência elegível A→B de publicado: mesmo UUID, um vínculo ativo, publication membership B, valor/overrides/contratos/pontos intactos.
- Novo sem valor, provisional, unpublished, update de posição fora da allowlist, destino sem arte, camisa override conflitante, reject humano: revisão com motivo, sem aplicação.
- Mesma operação duplicada/lost response: mesmo recibo; nenhuma nova versão, decisão ou histórico.
- Falha injetada entre football update e publicação, depois da publicação e no INSERT do recibo: rollback total por jogador.
- CAS: edição do vínculo, valor, override, suspensão de publicação, temporada ou snapshot entre enqueue/claim/apply; falha fechada, sem sobrescrever edição concorrente.
- Dois workers, lease vencida, worker antigo retomando, timeout, crash; recibo consistente e tentativa velha sem autoridade.
- Falha persistente em um item e pelo menos dois itens saudáveis: saudáveis avançam, sem fila bloqueada.
- Duas transferências A→B→C e resposta atrasada A→B: C não é revertido; trilha preserva ambos eventos confirmados.
- Estado já aplicado antes de enqueue: no-op; mesma observação em novo snapshot não gera histórico artificial.
- Privilégios: anon/authenticated sem acesso direto à fila/RPC/recibos; owner status protegido; clientes não forjam ator, claim, preço, evidência ou destino.
- SQL real de concorrência e locks com fluxo manual de valor/publicação; não declarar concorrência comprovada por PGlite serial.
- Consumidores/publicação + refresh de abas, erro de leitura não vira card inexistente confirmado; prova visual nos destinos reais após release, inclusive mobile.
- Quota/frescor observados: retentar aplicação custa zero chamadas Sportmonks; scheduler e alerta distinguem captura concluída de aplicação/publicação concluídas.

Testes existentes reutilizáveis: `roster-reconciliation-runtime.test.mts`, `roster-reconciliation-pglite.test.mts`, `roster-reconciliation-routes.test.mts`, `card-publication-reconcile-route.test.mts`, `card-publication-integrity.test.mts`, `touchline-card-publication-read-model.test.mts` e `touchline-card-publication-atomic-command.test.mts`. Nomes de casos lidos, não reexecutados durante a suíte ampla.

## 8. Gate e reversão

Antes de implementar, confirmar o catálogo efetivo de funções/ACLs/migrações da QA em consulta autorizada e comparar com estas definições locais. Criar migration forward pelo fluxo oficial, manter auto gate OFF, testar falhas e revisar independentemente. Publicar apenas o candidato consolidado autorizado; smoke com duas identidades/jogadores sintéticos delimitados, só depois habilitação controlada e monitorada.

Pausa do worker interrompe novas operações, preserva recuperação dos recibos e não restaura dados antigos. Se uma transferência aplicada precisar correção, usar novo comando compensatório baseado na fonte e no estado atual, com CAS e auditoria; nunca replay de backup amplo. Não usar rollback de publicação isolado que possa apontar para membership agora inativo.

A migração de automação proposta ainda não existe. Nenhuma configuração desta proposta foi alterada na QA/Production.

## Registro desta missão documental

MISSION: preparar a menor automação segura de transferências oficiais já publicadas.
SCOPE: leitura de fontes/migrações/testes e proposta por escrito; fonte de produto congelada.
QA BRANCH/COMMIT: worktree qa-stripe-release-20261029; base detached 47ebfffbbda98cbb89bcd3ad08fb19efd1e50694 + WIP existente.
QA DEPLOYMENT: não consultado neste recorte.
REMOTE BUILD BUDGET/CONSUMED: 0/0 neste recorte.
STABLE QA URL: https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
FILES CHANGED: este documento e link no relatório próprio AGENT_SOCIAL_ADMIN_2026-10-31.md.
FUNCTIONAL/VISUAL/RESPONSIVE/ACCESSIBILITY/BROWSER RESULT: não testados; não há PASS operacional.
SECURITY: somente análise; proposta preserva QA guard, RLS, serviço restrito, ator auditável e campos privados.
TESTS/BUILD: não executados, conforme freeze.
OBSERVABILITY: linhas/fontes locais acima; nenhum log remoto novo.
OPEN FINDINGS: implementar journal/executor/ponte/propagação, revisar, testar, publicar e provar consumidores; coaches e novos jogadores continuam fora deste recorte.
PRODUCTION: NOT TOUCHED.

| Ferramenta/plugin | Executado neste recorte | Evidência/decisão |
|---|---|---|
| Shell/rg/sed | Leitura delimitada de código e testes | Cadeia capture→apply não publica; reader rejeita vínculo antigo |
| Escrita documental | Relatório e link setorial | Proposta revisável, sem fonte/teste editado |
| Skill Supabase | Lida para fronteiras de segurança | Não equivale a execução do banco |
| Supabase/Vercel/Gmail | Não executados | Nenhuma consulta/mutação remota, e-mail ou deploy |
| Node/PGlite/browser | Não executados | Recursos mantidos para a suíte ampla do coordenador |
