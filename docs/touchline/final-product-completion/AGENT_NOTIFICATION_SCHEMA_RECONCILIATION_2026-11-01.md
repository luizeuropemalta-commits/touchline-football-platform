# Notificações — conciliação dos recibos de instalação

## Resultado

Do preflight inicial de sete tabelas ausentes, **as duas de rehearsal já foram instaladas e verificadas**. A correção da projeção do mercado também já foi aplicada. Não repetir esses lotes nem restaurar a antiga margem de cinco minutos.

O postflight QA de 05:27:37 UTC confirma rehearsal em `20261101023725 / touchline_push_rehearsal_atomic_qa_20261101`, cobrindo as fontes 20261002221350 e 20261003224152. RLS forçada, ACL restrita, RPCs e índices foram conferidos, com zero dispositivos/tentativas/cooldowns naquele instante. Isso não é prova de entrega.

A projeção foi aplicada depois como `20261101053339 / touchline_fantasy_market_timing_forward_qa`, fonte local 20261101052804. A raiz reconfirmou seus hashes por SELECT atual. A duplicata 091500 foi retirada de migrations e preservada só como fixture de regressão.

## Único lote ainda ausente — leitura atual confirmada

O SELECT executado pelo root na QA `xgxbwqxjssxxuihuwmgy`, em **2026-11-01T09:29:47.639896Z**, confirma as cinco tabelas e dez funções do lote ausentes. O histórico filtrado contém somente rehearsal `20261101023725` e timing `20261101053339`. Portanto, somente estas quatro fontes continuam por instalar:

1. 20261002032250_touchline_fantasy_lineup_reminder_read.sql
2. 20261002033308_touchline_game_notification_ledger.sql
3. 20261002035727_touchline_game_notification_delivery_claims.sql
4. 20261002045327_touchline_lineup_reminder_admission_scan.sql

As cinco tabelas ausentes são `touchline_game_notification_enrollments`, `touchline_game_notification_identities`, `touchline_game_notification_deliveries`, `touchline_lineup_reminder_scan_state` e `touchline_lineup_reminder_admission_work`. As duas tabelas rehearsal estão presentes com RLS e FORCE RLS. O recibo bruto está em `artifacts/avatar-notifications-20261031/notification-schema-reconciliation-qa-20261101.json`, SHA-256 `959833f7c76866c888dfe8b3a4cfa9b0ebfe04eb4ed82c3441c0dcb860b488f5`. O executor remoto foi o root; este agente conferiu e vinculou o arquivo local. Não confundir esta confirmação de ausência com instalação.

A próxima ação executável pelo root é uma única `apply_migration` com `project_id: xgxbwqxjssxxuihuwmgy`, nome `touchline_lineup_schema_atomic_qa_20261101` e o conteúdo integral de `lineup-managed-batch-20261101.sql`, SHA-256 `e20a0e8ec313998851090c1f7e464a1322176cbe8276a599db42eb621dc09502`. O envelope e suas quatro fontes permanecem byte a byte iguais à prova local e à revisão independente. Não é necessário repetir PGlite. Antes da aplicação, confirmar os três gates publicados OFF e capturar o baseline somente leitura em `lineup-managed-batch-20261101-preapply-single.sql`; se o estado tiver mudado, reconciliar antes de aplicar. Após sucesso, executar `lineup-managed-batch-20261101-postflight-single.sql`, que devolve todos os controles em um único JSON, e registrar a versão real gerada no mapeamento das quatro fontes. Não inventar versões originais no histórico e não executar db push abrangente.

Os dois novos triggers dos pais passam a atuar em futuras gravações de devices/preferências, inclusive com workers OFF: invalidam gerações/filas e não enviam mensagens. O envelope exige preservação dos triggers, policies, owner, ACL e RLS já existentes, além das funções de mercado. O postflight compara essa evidência por OID/definição. A prova local não simulou os triggers match-push, portanto coexistência no catálogo não equivale a teste de entrega ou de concorrência. Lock disputado por mais de cinco segundos aborta a instalação; não retirar guards para forçar sucesso.

Uma falha no DO desfaz todo o lote. Se o retorno da aplicação for incerto, consultar objetos e histórico antes de repetir. Depois do commit, manter gates OFF e preservar ledger/histórico; corrigir por novo forward delimitado se necessário. Não executar DROP/CASCADE/TRUNCATE nem restaurar a margem antiga de cinco minutos. O plano completo e hashes de evidências estão em `lineup-managed-batch-20261101-ready-gates.json`.

Não recriar devices, preferências, histórico, match_push ou locale: já existiam antes do preflight. Não ativar workers/gates nem enviar por esta conciliação.

## Evidência e limites

Mapa com hashes atuais das quatro fontes, versão dos lotes, recibos e query: `artifacts/avatar-notifications-20261031/notification-schema-applied-reconciliation-20261101.json`. Todos os hashes das fontes coincidem com o envelope preparado. A versão anterior da conciliação foi preservada em `reconciliation-history-20261101/092947-confirmed/`. Zero chamadas remotas, escritas remotas, testes de produto, navegadores ou mudanças em Production por este agente neste lote. Não alterei CURRENT_STATE nem CURRENT_EXECUTION_LEDGER, que pertencem à raiz.

**MISSION:** reconciliar instalações e entregar gates do único lote lineup inativo restante. **SCOPE:** leitura de recibos/fonte, hashes, queries e relatório próprios. **QA BRANCH/COMMIT:** candidata qa-stripe-release-20261029, base 47ebfff, WIP preservado. **QA DEPLOYMENT / BUILD BUDGET / CONSUMED:** nenhum / 0 / 0. **STABLE QA URL:** https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app. **FILES CHANGED:** conciliação/manifestos e queries próprios; SQL de instalação e fontes intactos. **FUNCTIONAL/SECURITY:** ausência atual confirmada por root; prova local e revisão independente reutilizadas com igualdade de hashes. **TESTS/BUILD:** nenhum teste ou build novo; comparação determinística de bytes/hashes passou. **VISUAL/RESPONSIVE/ACCESSIBILITY/BROWSER:** fora deste escopo, sem PASS alegado. **OBSERVABILITY:** recibo remoto bruto e hashes preservados. **OPEN FINDINGS:** aplicação gerenciada/postflight ainda não realizados; configuração, consentimento, dispositivo, agendamento e entrega física são gates posteriores. **PRODUCTION:** NOT TOUCHED.

| Ferramenta | Execução real nesta atualização | Evidência / decisão |
|---|---|---|
| Shell/Python | Conferiu recibo, fontes embutidas, hashes e preparou dois SELECTs | Hash do lote igual ao aprovado; somente lineup pendente |
| Supabase | SELECT executado pelo root, não por este agente | Recibo QA 09:29:47; nenhuma mutação desta revisão |
| Revisão independente | Recibo anterior no mesmo hash | Sem bloqueador de envelope; limites de runtime preservados |
| Browser/PGlite/build | Não executados | Nenhuma repetição sob baixa capacidade |
