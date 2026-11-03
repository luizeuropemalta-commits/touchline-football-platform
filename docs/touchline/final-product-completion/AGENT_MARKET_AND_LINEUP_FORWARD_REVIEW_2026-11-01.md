# QA — forward de horário e esquema mínimo de lembretes

Estado atual em 2026-11-01 09:29:47 UTC: **timing já aplicado na QA como 20261101053339; somente o lote lineup permanece ausente e pronto para aplicação gerenciada pelo root com gates OFF**. A consulta atual confirmou cinco tabelas/dez funções ausentes; rehearsal já instalado em 20261101023725. Ver `AGENT_NOTIFICATION_SCHEMA_RECONCILIATION_2026-11-01.md` e `lineup-managed-batch-20261101-ready-gates.json`. As instruções originais de aplicar timing abaixo são históricas e **SUPERSEDED**; não repetir esse forward. Este agente não aplicou mudanças remotas. Preparação em 2026-11-01, candidata `qa-stripe-release-20261029`, base `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694`. Nenhuma fonte, migration histórica, teste do produto ou configuração foi alterada por esta missão.

## Alvo e sequência original — aplicação do timing já concluída

O único alvo autorizado é **TouchLine Development QA**, projeto **`xgxbwqxjssxxuihuwmgy`**. Production `vxireiswggllwhbsmdcj` permanece fora do escopo. `touchline_assert_qa_fixture_target` valida somente o argumento literal: não identifica a conexão. O operador deve confirmar o projeto no conector e fixar seu `project_id`; a função não substitui esse controle.

1. Revisar e criar pelo CLI uma migration forward nova para o horário; não reaplicar nem editar a migration histórica `20261002031429`.
2. Aplicar o SQL revisado pelo caminho gerenciado e registrar a versão retornada. Ler novamente catálogo, OID, ACL e hashes. Não executar `sync_gameweeks` como parte do DDL.
3. Somente quando a projeção tiver o hash corrigido esperado, aplicar o lote mínimo de quatro arquivos de lineup, em uma operação gerenciada chamada `touchline_lineup_schema_atomic_qa_20261101`.
4. Executar o postflight somente leitura, registrar a versão real e relacioná-la às quatro versões originais no manifest. Não inserir quatro registros históricos fictícios nem executar um `db push` amplo para reconciliar a fila.
5. Manter gates e workers OFF. Instalação não é autorização nem prova de envio. Root informou que já aplicou separadamente `touchline_push_rehearsal_atomic_qa_20261101`; seu postflight e sua versão são responsabilidade do root e não foram sobrescritos aqui.

O preflight anterior encontrou sete tabelas ausentes: cinco deste lote e duas de rehearsal. As tabelas de devices, preferências, histórico, subscriptions e a família `touchline_match_push_*` já existiam. `touchline_game_notification_*` é outra família; não confundir nomes nem substituir o pipeline existente. Evidência: `artifacts/avatar-notifications-20261031/qa-notification-schema-preflight-20261101.json` e `qa-notification-pipeline-distinction-20261101.json`.

## Projeção de mercado: três linhas e preservação

Artefato executável: `artifacts/avatar-notifications-20261031/market-projection-forward-20261101.sql`.

- SHA-256: `9c4041136f568133fb79c881ab0c2cb871643e05d21e4662d3cd41eaf53782a1`.
- Preimagem remota: `market-projection-forward-20261101-qa-preimage.json` e `market-projection-forward-20261101-before.sql` no mesmo diretório.
- Pós-imagem e diff: `market-projection-forward-20261101-after.sql` e `market-projection-forward-20261101-three-lines.diff`.
- Projeção anterior: OID `477218`, owner `postgres`, ACL `{postgres=X/postgres}`, STABLE, SECURITY INVOKER, `search_path=""`; MD5 da definição `e40b5f762d9b065331e3b26a24a3dff6`.
- Projeção nova: MD5 da definição `e9776c6f9df37360660a3e56e4a827d8`.
- Sync preservado: OID `36348`, owner `postgres`, SECURITY DEFINER, VOLATILE, `search_path=""`, ACL `{postgres=X/postgres,service_role=X/postgres}`; MD5 `a54aed23cad04215235eeef009a7072d`.

As três linhas retiram os cinco minutos antecipados do fechamento e os cinco minutos posteriores ao encerramento confirmado. O fechamento passa a ocorrer exatamente no kickoff. A próxima janela abre quando o último jogo da rodada anterior tem finalização confirmada, sem margem artificial. O SQL exige a definição antiga exata, substitui somente a projeção e compara todo o registro `pg_proc`, exceto `prosrc`, antes/depois. Assim OID, owner, ACL, volatilidade, invoker e configurações permanecem iguais; o registro completo do sync também deve permanecer idêntico. Nenhum GRANT, REVOKE, DROP, alteração de partidas ou chamada de sincronização é feita.

Prova local: `node artifacts/avatar-notifications-20261031/prove-market-projection-forward-20261101.mjs`, PASS em `2026-11-01T02:38:38.847Z`, resultado `market-projection-forward-20261101-local-proof.json`. Sete grupos de asserções: reversão depois do DDL; metadados/sync preservados; instante antes/igual/depois do kickoff; finalização exata; exigência de todos os jogos da rodada; sync original consumindo a projeção nova; replay recusado. O banco local utiliza pais reduzidos e não prova atualização remota de todas as telas.

## Lineup: lote mínimo de quatro fontes intactas

Artefato: `artifacts/avatar-notifications-20261031/lineup-managed-batch-20261101.sql`, SHA-256 **`e20a0e8ec313998851090c1f7e464a1322176cbe8276a599db42eb621dc09502`**.

| Fonte original em `supabase/migrations/` | Bytes | SHA-256 |
|---|---:|---|
| `20261002032250_touchline_fantasy_lineup_reminder_read.sql` | 4836 | `77fa5cdbbc923916397902950d605046a1054f922c5ecf1f9392024696a9e25d` |
| `20261002033308_touchline_game_notification_ledger.sql` | 13168 | `d223de204a10ee478cfb633d1da00b4d066e6448b18689017cd9d0d540de3c82` |
| `20261002035727_touchline_game_notification_delivery_claims.sql` | 10518 | `aec556fa6fd7a0138e2153b2fb12c2bbe36faaa277d58080adf9fe4db8ec5359` |
| `20261002045327_touchline_lineup_reminder_admission_scan.sql` | 9914 | `b8212798d4937b165264cce5399887e9fb16e0cacb7c7a409e5ce9f468e20de7` |

O manifest correspondente preserva nome, versão, tamanho e hash de cada arquivo. O lote contém as quatro fontes byte a byte e verifica seus hashes antes de executar. Seus metadados de aplicação remota permanecem nulos até o operador registrar o retorno real.

Objetos novos esperados: `touchline_game_notification_enrollments`, `touchline_game_notification_identities`, `touchline_game_notification_deliveries`, `touchline_lineup_reminder_scan_state`, `touchline_lineup_reminder_admission_work`; dez funções e três triggers. Não altera rehearsal nem a família `touchline_match_push_*`.

Pré-condições: ausência das cinco relações, índice due, dez nomes de funções inclusive overloads e três nomes de trigger; ausência de histórico conflitante; 54 colunas de dependências com tipos e nulabilidade exatos; funções auxiliares presentes; RLS e CHECK canônico de subscription dos pais; autoridade do owner; hashes exatos da projeção corrigida e do sync. Divergência aborta antes de substituir objetos. Lock timeout de cinco segundos e advisory lock limitam concorrência desta instalação.

### Permissões e efeito dos triggers

As cinco tabelas têm RLS habilitada e forçada, sem policies de cliente. Anon e authenticated não recebem acesso; service_role recebe apenas SELECT direto. Escritas exigem RPCs controladas. Todas as funções têm `search_path=""`, PUBLIC/anon/authenticated sem EXECUTE, e somente os sete pontos de entrada aprovados permitem EXECUTE a service_role. Invalidation, guard e lock interno permanecem exclusivos do owner. O guard de deliveries é invoker; os outros nove são definer. Owner/roles privilegiadas continuam tendo poder administrativo: isso não constitui proteção contra um administrador malicioso.

**Atenção operacional:** os dois triggers novos em devices/preferências passam a atuar em futuras alterações dessas tabelas mesmo com workers OFF. Não enviam mensagens: invalidam gerações e filas antigas de forma conservadora. O lote compara os triggers, policies, owner, ACL e RLS anteriores e exige que permaneçam inalterados. O postflight deve mostrar os quatro triggers anteriores da QA e os dois novos nesses pais, mais o guard em deliveries. O harness local preserva os triggers canônicos de updated_at, mas não simula os dois triggers existentes de match-push; essa coexistência requer a prova remota do root.

### Segurança de duplicação

- PK de enrollment por usuário/device/gameweek; identidade única por usuário/gameweek/tipo; delivery única por identidade/device; work único por usuário/gameweek.
- Primeiro encontro estabelece baseline e pode suprimir a rodada, sem enviar imediatamente. Alterações de deadline, subscription, consentimento e geração invalidam a autorização anterior.
- Admit/claim/reserve usam locks ordenados e releitura de autoridade; reserve consome o nonce de tentativa uma única vez. Resposta perdida ou resultado incerto não autoriza novo envio automático.
- Scan tem páginas limitadas e retries com prazo; cursor não substitui a validação feita por admit. Fila durável não significa entrega física confirmada.
- Não há bloqueio global sobre todos os escritores de dados do fornecedor/geometria. Transporte continua obrigado a conferir a fonte e o consentimento antes do envio. Este lote não ativa transporte.

## Provas e reversão

Comando proporcional executado em janela exclusiva, sem navegador concorrente:

`node artifacts/avatar-notifications-20261031/prove-lineup-managed-batch-20261101.mjs`

PASS em `2026-11-01T02:48:02.365Z`, evidência `lineup-managed-batch-20261101-local-proof.json`. Cinco grupos: erro injetado depois das quatro fontes desfaz todo o catálogo novo; falha simulada de gravação de histórico reverte a transação; instalação valida RLS/ACL/índice/triggers e tabelas vazias; SET ROLE real confirma restrições de clientes e service_role; reaplicação falha sem deriva. As dez definições resultantes têm hashes no JSON para comparar na QA.

A instalação é uma única instrução DO, portanto uma falha interna reverte todos os seus efeitos. A prova de DDL e histórico juntos usa uma transação gerenciada **simulada**; não certifica os detalhes internos do runner remoto. O operador deve verificar o registro real produzido por `apply_migration`. Não inserir BEGIN/COMMIT dentro dos arquivos preservados nem usar um caminho que grave DDL sem histórico gerenciado.

Depois de commit, rollback operacional é manter gates OFF e suspender os workers. Não apagar ledgers, dispositivos, consentimentos, triggers ou migrations gravadas. Se surgir defeito, preparar um novo forward delimitado. A preimagem da projeção está preservada para investigação/reversão avaliada; restaurá-la indiscriminadamente reintroduziria a regra antiga incorreta de cinco minutos. Não fazer essa reversão automaticamente.

Testes existentes reutilizados, sem reexecutar a suíte pesada: `artifacts/local-card-integrity-20261031/consolidated-suite.log` linhas 4922 (scan/admit SQL, páginas, retries, baseline e rollback), 4942–4948 (grafo single-claim com nonce/receipts) e 4959 (reader em um snapshot). Esses testes não são somados às novas provas como total de produto aprovado.

Postflight pronto: `artifacts/avatar-notifications-20261031/lineup-managed-batch-20261101-postflight.sql`. Retorna apenas catálogo, permissões, constraints, índices, contagens e histórico, sem endpoints de subscription, documentos privados ou segredos. Comparar os hashes, manter cinco tabelas vazias, conferir preservação dos pais e registrar o ID de versão real.

## Gate da missão delimitada

**MISSION:** preparar forward de horário e instalação mínima de lembretes para revisão/aplicação pelo root.
**SCOPE:** artefatos SQL, preimagem, manifests, provas locais e postflight; zero mutações remotas deste agente.
**QA BRANCH:** worktree `qa-stripe-release-20261029`, candidata detached.
**QA COMMIT:** base `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694`; WIP compartilhado preservado; nenhum commit deste agente.
**QA DEPLOYMENT:** nenhum deploy realizado nesta missão.
**REMOTE BUILD BUDGET / CONSUMED:** 0 / 0.
**STABLE QA URL:** https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
**FILES CHANGED:** somente artefatos listados e este relatório; fontes históricas intactas.
**FUNCTIONAL RESULT:** forward e envelope aprovados no banco local; readiness/delivery remotas ainda não comprovadas aqui.
**VISUAL / RESPONSIVE / ACCESSIBILITY / BROWSER MATRIX:** não aplicável ao escopo de artefatos SQL; nenhum PASS visual alegado.
**SECURITY RESULT:** limites de roles/RLS/ACL, ausência/replay, preservação de autoridade e reversão verificados localmente; catálogo QA anterior preservado como evidência.
**TESTS:** duas provas PGlite proporcionais em janelas exclusivas; resultados não equivalem a envio real.
**BUILD:** não executado; nenhum código do produto modificado.
**OBSERVABILITY:** manifests, hashes, provas JSON, preimagem remota e SELECTs de postflight.
**OPEN FINDINGS:** aplicação gerenciada e postflight pelo root; callbacks/triggers reais, ativação delimitada, entrega no aparelho e fluxo completo ainda exigem comprovação.
**PRODUCTION:** NOT TOUCHED.

| Ferramenta | Ação executada | Resultado / decisão |
|---|---|---|
| Supabase conector | Preflight read-only anterior e preimagem das duas funções no projeto QA | Hashes, OIDs e fronteiras observados; nenhuma execução DDL deste agente |
| Skill Supabase | Orientação carregada para fronteiras e migrations | Aplicada ao desenho; leitura da skill não contabilizada como execução de banco |
| Shell / Node / PGlite | Comparação de fontes, dois harnesses e gravação de evidências locais | PASS delimitado, sem downloads ou serviços remotos |
| Coordenação de agentes | Janela exclusiva com executor de navegador; pedido de revisão independente | Sem concorrência PGlite/browser; root decide aplicação |

## Revisão independente concluída

O agente `conditional_browser_completion` revisou os dois envelopes, hashes, a mudança de três linhas e as quatro fontes byte a byte. Não encontrou bloqueador concreto. Confirmou as pré-condições de ausência/histórico, dependência da projeção corrigida, RLS/ACL e preservação de metadados. A revisão manteve a exigência de postflight na QA, coexistência dos triggers match-push e gates OFF; não é aprovação de entrega física.
