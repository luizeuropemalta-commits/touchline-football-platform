# QA — plano mínimo de locale, quota/prequery e compatibilidade recovery

2026-10-07. **PROPOSTA LOCAL; nenhuma SQL remota, configuração, chamada Sportmonks ou ativação executada.** Manifesto desta tarefa: somente este documento. Integração: `/Users/luizlopez/Developer/touchline-release-candidate-20261007`, base `30419c494911112f7b793ad8881e5b8e36c4f553`; a árvore tem mudanças posteriores e ainda não constitui um SHA de implantação. A suíte serial do root não foi interrompida nem duplicada.

## Evidência e alvo

O root informou leitura recente do schema QA: `notification_preferences` contém `user_id/settings/channels/frequency/quiet_hours/explicit_consent_at/created_at/updated_at`; não contém `game_locale` ou `game_locale_revision`, nem RPC `touchline_set_game_locale`. As tabelas de quota não existem. Preflight adicional comunicado pelo root:

- Preferences: RLS true, uma linha (sem leitura de PII); policies authenticated own-user INSERT/SELECT/UPDATE.
- Grants preexistentes de postgres/anon/authenticated/service_role: INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER. Não ampliar nem corrigir adjacências neste lote; grants não são equivalentes às policies, e RLS não protege operações como TRUNCATE. Registrar o risco preexistente para revisão de segurança separada, sem revogação silenciosa.
- Triggers: `notification_preferences_updated` BEFORE UPDATE → `touch_updated_at`; `touchline_match_push_preferences_epoch` AFTER INSERT/DELETE/UPDATE → `touchline_match_push_invalidate_enrollment`.
- `cron.job`: apenas job 5 (`* * * * *`) e job 6 (`30 seconds`), ambos `active=false`. Manter pausados; isto não prova ausência de invocações manuais/em voo ou outros schedulers.

Este documento não substitui o recibo dessas consultas. Defaults, corpos de funções/triggers, dependências e estado de recovery ainda precisam da conferência delimitada abaixo. Nenhum dado remoto foi alterado pelo root nesse preflight.

Governança: AGENTS.md, TOUCHLINE_MISSION_FOOTER.md e ROLLBACK_PLAYBOOK.md. Forward-only; não apagar histórico aplicado nem dados de consentimento, quota ou reservas. Instalação de schema, configuração de binding e ativação são gates distintos. Skill Supabase aplicada à análise de RLS, invoker/definer e privilégios; documentação remota e queries não executadas nesta tarefa.

## Manifesto mínimo e ordem

Todos os arquivos abaixo pertencem a `supabase/migrations/`. Revalidar hashes imediatamente antes da execução; qualquer diferença exige nova revisão.

| Ordem/sub-lote | Arquivo | SHA-256 |
|---|---|---|
| L1 | `20261002183141_touchline_notification_game_locale.sql` | `13a85b62378261328c5edd01026b3cc392df1cbdcd9314c2a13c3f64ddec97f4` |
| L2, após L1 | `20261002200934_touchline_game_locale_revision.sql` | `438ab0f13338dce1b43e2461b8ff57f2752bf78f7e63fd4cd1b17483ff6da00b` |
| Q1 | `20261002152457_touchline_fixture_quota_authority.sql` | `ce34d739405276b62d197cb8de3beaa7fb834ee60b60f78a2e7f1fb844f7ac56` |
| Q2, após Q1 | `20261003233637_touchline_sportmonks_prequery_authority.sql` | `1874df53481e913e35b58e9f4acf6a2ebbf1e6f4f60fc7eac35b2b4334b5cdb6` |
| R, antes de retomar Live desta candidata | `20261002160805_touchline_fixture_recovery_deferral.sql` | `01d8e34ec82252e3b0d2fd31a002ea76815a28071743cc9f00af8bafc2d11b7d` |

L1/L2 são dependências diretas da persistência pública: `app/api/notifications/preferences/route.ts:117,180` lê as duas colunas e chama o RPC CAS com revisão. A leitura também ocorre com o gate de oito idiomas OFF; fechar apenas esse gate não elimina a dependência de schema.

Q1/Q2 são dependências dos consumidores da factory `lib/football-data/fixture-provider-server.ts:8`, que exige binding e não recua para provider desprotegido. Inclui Live/schedule/starter e `app/api/touchline-awards/golden-boot/refresh/route.ts:57`. Q2 amplia a autoridade para league/season/stages/topscorers, além dos endpoints de fixture.

**Recovery é obrigatório para retomar o fluxo Live desta candidata, não para instalar locale ou executar somente Golden Boot.** `lib/football-data/fixture-backlog-recovery.ts:61` exige `reservationId` no claim; finish/persist enviam o novo argumento. `live-sync.ts:311` entra no backlog após sucesso live e, em deferral comprovadamente sem HTTP, chama o RPC novo. O schema anterior pode consumir um claim e a validação TypeScript então rejeitar sua resposta sem reservationId. Logo, não testar compatibilidade chamando claim em dados reais. Não há gate independente de backlog nessa passagem: adiar R exige manter o consumidor Live correspondente parado, ou uma mudança de código separadamente aprovada. R depende da instalação anterior `20260923185720_touchline_fixture_backlog_recovery.sql`, que ainda precisa ter definição/ACL/dependências hospedadas verificadas.

Fora deste lote: reminders, rehearsal, avatar, instalação/ativação de novos schedulers, consentimento e qualquer migration Fantasy. Golden Boot authority local `20261001194607` equivale à versão QA `20261001233034`: não repetir.

## Preflight somente leitura antes de aprovar aplicação

1. Registrar projeto QA exato, executor, horário, histórico de migrations e SHA do candidato; rejeitar qualquer binding de produção. Preservar saída privada sem credenciais ou registros pessoais no Git. Revalidar a permanência de jobs 5/6 pausados imediatamente antes do lote; não habilitá-los como efeito colateral.
2. Capturar schema/constraints/defaults/owner/ACL/RLS/policies/triggers e dependências de `notification_preferences`; confirmar que authenticated tem privilégios efetivos necessários além de RLS. Conferir defaults de nova preferência: canais desabilitados e consentimento nulo. Inventariar todos os overloads do RPC. Não inferir segurança apenas do nome da policy.
3. Preservar preimagem privada verificável dos campos antigos de preferences, contagem e digest determinístico; janela sem escritas concorrentes ou snapshot consistente que permita distinguir mudanças legítimas. Nunca copiar dados pessoais para o documento/log público.
4. Confirmar ausência de tabelas/funções quota e capturar grants globais/default ACLs. Se houver objetos parciais, parar: não usar IF NOT EXISTS improvisado nem reparar histórico por suposição.
5. Se R entrar: capturar tabela recovery, constraints, corpos/owners/ACLs das funções claim/finish/persist, dependências externas e contagens por estado; identificar leases/runs ativos. Não usar CASCADE. Confirmar permissões e ausência de drift contra predecessor. Preservar preimagem privada do protocolo e das linhas de recovery.
6. Inventariar jobs/rotas/consumidores de cada credencial Sportmonks e suas configurações, incluindo os consumidores ainda desprotegidos. Não invocar provider para descobrir identidade de conta. Determinar se QA e produção compartilham orçamento da mesma conta: bancos separados não coordenam quota global.

## Transações e janela de implantação

- Antes de qualquer pausa ou aplicação, aprovar explicitamente alvo, manifesto, executor, janela e plano de retomada. Não interromper jobs por iniciativa deste documento.
- Pausar e drenar os consumidores autorizados que poderiam executar durante Q/R; confirmar fim das transações em voo. Para L, impedir uso intermediário de L1 pelo novo cliente. Evitar interromper preferências existentes sem uma janela acordada.
- Executar cada migration por runner aprovado com **SQL e registro de histórico atômicos por versão**. L1, L2 e R não têm BEGIN/COMMIT próprios e exigem transação do runner; configurar lock/statement timeout limitados aprovados.
- Q1/Q2 já contêm BEGIN/COMMIT. Antes de usá-las, provar como o runner trata esses delimitadores e seu registro de histórico; não embrulhar cegamente em transação externa, pois COMMIT interno não cria transação aninhada e pode antecipar o commit. Se o executor não garantir atomicidade SQL+histórico, parar e preparar um artefato de execução revisado, sem alterar silenciosamente as fontes/hash.
- Não prometer atomicidade entre arquivos. Ordem obrigatória L1→L2 e Q1→Q2; consumidores permanecem parados até concluir todo o sub-lote necessário. Falha depois de L1 ou Q1 significa estado intermediário: preservar receipt, reconciliar schema/histórico, corrigir por forward, sem reexecutar automaticamente.
- R deve terminar antes de retomar Live; sua ordem relativa a Q1/Q2 é secundária desde que nenhum consumidor execute entre etapas. Drenagem é necessária: substituir função não cancela um corpo antigo já em execução.
- Não inserir scope enabled nem habilitar flag/job junto com DDL. Nenhuma destas migrations configura conta automaticamente.

## Binding de quota — não inventar valor

`TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE` e a chave `touchline_fixture_quota_scopes.account_scope` devem representar a mesma conta/orçamento real e ser consistentes em todos os consumidores guarded que o compartilham; formato aceito: `^[a-z][a-z0-9_-]{0,63}$`. Não escolher um rótulo por conveniência nem criar um scope por worker para contornar limite compartilhado.

Responsável pela configuração deve identificar a conta de faturamento/assinatura por inventário autorizado, sem expor token, e aprovar um identificador não secreto. Conta compartilhada QA/produção exige decisão explícita sobre coordenação ou isolamento de credenciais; não declarar quota global protegida por uma linha apenas em QA.

Somente após essa decisão e autorização de configuração: registrar scope inicialmente disabled, conferir binding de cada consumidor, manter dados de cooldown/unknown/tokens. Habilitar depois de revisão/postflight e com orçamento exato de requests aprovado. Não limpar `blocked_unknown`, cooldown, leases ou attempts para obter um smoke verde.

## Postflight por gate

**Schema sem provider:** confirmar versões/hashes e objetos esperados, L2 como único overload `(text,bigint)`, retorno de revisão textual, security invoker/search_path/ACL; locale nullable sem backfill, revisão bigint não negativa default zero; preimagem dos campos antigos preservada. Confirmar RLS/policies sem alargamento. Para Q: RLS, ausência de DML direto para anon/authenticated/service_role, EXECUTE somente service_role, endpoints novos e nenhuma ativação acidental. Para R: novas constraints/assinaturas, defaults de compatibilidade e nenhum reset de histórico/reservas.

**Prova funcional autorizada separadamente:** usuário QA controlado, leitura→escolha explícita de oito idiomas→refresh; CAS stale rejeitado, revisão exata, outra conta isolada, anon negado, canais/consentimento intactos. A gravação de locale é escrita real: não fazê-la no gate read-only nem usar fixture que apague preferência legítima. Ensaiar primeiro com dados sintéticos locais.

**Quota/recovery:** usar os harnesses locais para allowed/denied/replay/unknown/cooldown/zero-HTTP, sem contas reais. Após aprovação de scope e requests, controlar um único fluxo real e verificar recibos persistidos e ausência de replay; Live exige postflight R e reservas válidas antes da retomada. Não fabricar observação Sportmonks nem criar attempts sintéticos permanentes na conta real.

Provas locais reutilizáveis: `touchline-notification-game-locale-sql.test.mts`, `touchline-game-locale-revision-sql.test.mts`, `touchline-fixture-quota-sql.test.mts`, `touchline-fixture-provider-sql.test.mts`, `touchline-fixture-recovery-deferral-sql.test.mts`, mais testes preferences/factory/Live/Golden Boot. Nenhum foi executado por esta tarefa; consumir o recibo da suíte serial do root, com runtime SQL e zero skips, sem tratar PGlite como prova de concorrência hospedada/PostgREST.

## Recuperação forward compatível

- Falha antes do commit: rollback da transação corrente; verificar que não houve histórico parcial. Resultado desconhecido: consultar schema/histórico antes de qualquer retry.
- Falha depois do commit: preservar colunas, revisões, receipts, attempts, reservas e histórico. Pausar consumidores afetados com autorização; manter scope disabled para novas admissões e drenar trabalho já admitido. Disable não cancela HTTP/transação em voo.
- Locale: reter RPC CAS e dados; corrigir corpo/ACL por nova migration revisada, mantendo assinatura/contrato. Não recriar overload unversionado nem zerar revisões. Um retorno a SHA anterior só é aceitável após prova de compatibilidade das consultas e escritas com o schema aditivo; flag de idioma OFF não é substituto dessa prova. Se necessário, usar forward de código compatível em vez de restaurar um consumidor antigo.
- Quota: corrigir funções por forward preservando identidades e ACL; nunca remover tabelas ou liberar token/cooldown desconhecido sem evidência revisada. Não voltar a provider sem guard como rollback.
- Recovery: preservar novas assinaturas/defaults e reservas; não restaurar corpos antigos sobre operações iniciadas no protocolo novo. Drenar, reconciliar operações pendentes por evidência e corrigir por forward. Os defaults ajudam chamadas históricas, mas não provam que qualquer SHA antigo seja seguro.
- **Ainda não existe aqui um script de compensação hospedada aprovado.** Antes da aplicação, revisar o artefato forward específico e/ou comprovar que parada segura + roll-forward dentro da janela é aceito. O plano não autoriza apagar histórico ou chamar rollback de cenário como desfazer DDL.

## Decisões objetivas pendentes

1. Autorizar separadamente aplicação QA do par L1/L2 e, para manter consumidores atuais operacionais, Q1/Q2 + R; ou aceitar explicitamente Live parado enquanto R é adiado. Instalar só L é a menor mudança para idioma, não preserva por si só a operação de todos os workers da candidata.
2. Confirmar conta Sportmonks e responsável pelo binding; se orçamento compartilhado entre ambientes, aprovar coordenação/isolamento antes de enable.
3. Aprovar janela de pausa/drenagem, executor com atomicidade de histórico demonstrada, recuperação forward e requests de smoke. Não é necessário decidir novamente migrações já equivalentes/aplicadas.

## Mission completion gate deste documento

MISSION: AUDIT/PLANNING local. SCOPE: proposta QA locale/quota e dependência recovery. QA BRANCH/COMMIT: base QA30419c4, candidato exato ainda pendente. QA DEPLOYMENT/STABLE QA URL: não alterados nem verificados nesta tarefa. REMOTE BUILD BUDGET/CONSUMED: 0/0 nesta tarefa. FILES CHANGED: somente este documento. FUNCTIONAL/SECURITY RESULT: dependências e gates analisados; implementação hospedada não validada. VISUAL/RESPONSIVE/ACCESSIBILITY/BROWSER: não aplicável ao documento, não executado. TESTS/BUILD: não executados, suíte do root preservada. OBSERVABILITY: leitura de fonte e hashes; sem provider/banco remoto. OPEN FINDINGS: decisões e preflight acima. PRODUCTION: NOT TOUCHED.

| Ferramenta/skill | Uso efetivo | Resultado |
|---|---|---|
| Leitura local + SHA-256 | Migrações, callers e governança | Manifesto e dependência R identificados |
| Supabase skill | Análise de fronteiras e plano | Não equivale a execução MCP/SQL |
| apply_patch | Somente este documento | Proposta local, não autorização de aplicação |
