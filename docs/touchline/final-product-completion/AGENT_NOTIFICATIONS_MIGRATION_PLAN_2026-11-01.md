# Notificações: manifesto de schema para QA

Estado: **PREPARADO PARA REVISÃO, NÃO APLICADO, ENVIO NÃO ATIVADO**. Auditoria local somente leitura de produto; foram escritos apenas este relatório e dois artefatos documentais. Nenhum teste foi executado neste lote enquanto a suíte serial do agente raiz estava ativa.

Alvo exclusivo: Supabase QA `xgxbwqxjssxxuihuwmgy`. Production `vxireiswggllwhbsmdcj` permanece proibida. Candidata inspecionada: `worktrees/qa-stripe-release-20261029`, base `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694`, com WIP de vários setores preservado.

## Fatos e alcance

O agente raiz informou em 2026-11-01, após leitura da QA: ausência de `touchline_game_notification_deliveries` e `touchline_push_rehearsal_attempts`; zero dispositivos, outbox de partidas, histórico e inscrições; três preferências; nenhum cron correspondente aos endpoints de push. Este agente não repetiu essas consultas. O nome da tabela de inscrições não foi especificado no resumo recebido; esse zero não prova a existência das tabelas novas de escalação.

As cinco migrations centrais abaixo criam persistência e controles. Não criam dispositivo, consentimento, chave VAPID, remetente, tarefa agendada ou entrega física. A existência de uma tabela também não comprova todas as migrations que a utilizam. O envio de gol/cartão usa outro pipeline já mapeado em `AGENT_NOTIFICATIONS_DELIVERY_AUDIT_2026-11-01.md`.

## Manifesto e ordem mínima

O arquivo `artifacts/avatar-notifications-20261031/notifications-migration-manifest-20261101.json` contém os caminhos e SHA-256 completos das migrations e testes. A ordem é por dependência, não um pedido para executar `supabase db push` sobre todo o histórico.

| Grupo | Migration | Resultado e condição |
|---|---|---|
| Ensaio 1 | `20261002221350_touchline_push_rehearsal_reservation.sql` | Cria cooldowns, tentativas e RPCs reserve/finish; depende de `public.users` e `notification_devices` canônico. |
| Ensaio 2 | `20261003224152_touchline_push_rehearsal_installation_guard.sql` | Índice ator/instalação e reserva definitiva por instalação, qualquer que seja o resultado. Aplicar junto da base para não expor a versão anterior entre commits. |
| Escalação P1, condicional | `20261002031429_touchline_fantasy_shared_market_window_projection.sql` | Cria projeção compartilhada e **substitui `touchline_fantasy_sync_gameweeks()`**. Só considerar se ausente e após comparar a definição atual; não sobrescrever regra posterior. |
| Escalação P2, condicional | `20261002032250_touchline_fantasy_lineup_reminder_read.sql` | Leitura coerente de rodada, XI e geometria publicada; depende da projeção e das bases existentes. |
| Escalação 1 | `20261002033308_touchline_game_notification_ledger.sql` | Inscrições, identidades, entregas e admissão; cria triggers de invalidação em preferências e dispositivos. |
| Escalação 2 | `20261002035727_touchline_game_notification_delivery_claims.sql` | Claim, reserva, término, expiração e guard de imutabilidade da tentativa. |
| Escalação 3 | `20261002045327_touchline_lineup_reminder_admission_scan.sql` | Cursor persistente por competição/temporada e fila limitada de admissão; depende de ledger, projeção e configuração ativa única. |
| Idioma P3, condicional | `20261002183141_touchline_notification_game_locale.sql` | Coluna `game_locale`, oito valores exatos, sem inferência/backfill. Necessária à leitura atual antes de entregar. |
| Idioma P4, condicional | `20261002200934_touchline_game_locale_revision.sql` | Coluna `game_locale_revision` e RPC de dois argumentos usada pela API atual; remove a RPC antiga de um argumento. Aplicar com consumidores compatíveis, nunca restaurar a antiga se a revisão já existir. |

Proposta operacional: grupo de ensaio em uma transação gerenciada; grupo de escalação/idioma em outra, incluindo apenas os pré-requisitos realmente ausentes e revisados. DDL e registros correspondentes de migration precisam ser atômicos pelo mecanismo aprovado do projeto. Não apagar histórico, inserir registros de sucesso sem executar DDL, empilhar `COMMIT` dentro do runner, ou repetir arquivos históricos para “tentar corrigir”. Se schema e histórico discordarem, produzir reparo forward específico após revisão.

## Pré-requisitos já esperados: inspecionar, não reaplicar

As consultas preparadas estão em `artifacts/avatar-notifications-20261031/notifications-migration-preflight-20261101.sql`. São somente SELECT e devem rodar por estágio, após confirmar o alvo QA. Não selecionam chaves, subscriptions, e-mails, linhas de usuário nem comandos de cron.

1. `auth.users`, `public.users`, papéis `anon/authenticated/service_role`; `touch_updated_at()` e `auth.uid()`.
2. `notification_preferences`: identidade, settings/channels, frequência, consentimento, quiet hours e updated_at; depois confirmar locale e revisão. Fonte histórica: `017_touchline_notification_preferences.sql`.
3. `notification_devices`: identidade imutável por usuário/instalação, permissão e subscription completa, RLS próprio e constraints canônicos. Fontes: `20260910183000_touchline_notification_devices.sql` e reparo `20260926233755_touchline_notification_devices_forward_restore.sql`.
4. Futebol/Fantasy: rounds, fixtures, configs, gameweeks, user_gameweeks e selections com chaves/tipos do manifesto; helpers de status live/final; exatamente uma configuração ativa no escopo de execução.
5. XI: `selected_coach_id` e formação; registry de geometria publicada e `touchline_formation_geometry_payload_is_valid(text,jsonb,jsonb)`. O reader recusa ausência, duplicação ou geometria inválida.
6. Janela de mercado: constraints de gameweeks devem permitir `locks_at = first_fixture_at`, conforme regra atual. A migration histórica `20260919151427_touchline_fantasy_kickoff_final_whistle_market_window.sql` contém essa evolução. A base antiga exigia `<`; não afirmar compatibilidade sem ler a definição atual.
7. Leitura antes da mudança: existência, assinatura, security-definer/invoker, `search_path`, ACL, triggers, constraints, índices, histórico de migrations e hash da definição atual das funções afetadas. `md5(pg_get_functiondef)` identifica o antes/depois, não equivale ao SHA-256 do arquivo SQL.

Cuidados concretos de replay:

- O reparo de dispositivos de setembro **rejeita triggers/policies desconhecidos**. Reexecutá-lo depois de instalar triggers de época de partidas/escalação pode falhar corretamente. Não apagar triggers para fazê-lo passar.
- `20260825202938_touchline_fantasy_markt_gameweek_xi.sql` também grava o antigo `lock_offset_minutes=5` e altera outras regras. Não reaplicar esse arquivo para obter apenas `selected_coach_id`.
- `supabase/qa/028_touchline_qa_formation_geometry_registry.sql` cria e semeia o registry com guard próprio de QA. Sua presença como fonte histórica não autoriza reaplicar sementes/registro neste lote.
- A RPC histórica `touchline_set_game_locale(text)` deve estar ausente quando `touchline_set_game_locale(text,bigint)` estiver instalada. O SQL de inventário lista ambas para detectar o estágio, não para exigir ambas.
- `game_locale_revision` não é lida pelo worker de escalação, mas **é exigida pela API atual de preferências**. Um setup novo de idioma só com P3 deixaria esse consumidor incompleto. A revisão não concede consentimento de push.

## Contrato de segurança e falha fechada

| Objeto | Contrato a preservar |
|---|---|
| Duas tabelas do ensaio | RLS enabled e forced; nenhum acesso público/anon/authenticated; service_role tem SELECT/INSERT/UPDATE, sem DELETE/TRUNCATE. RPCs reserve/finish são invoker, `search_path=''`, execute apenas service_role. |
| Cinco tabelas de escalação | RLS enabled e forced; service_role tem somente SELECT direto, sem escrita direta. Mutações pelo conjunto secdef revisado; anon/authenticated/public sem acesso. |
| Helpers internos | Projection, invalidate, delivery_guard e lock_current não são RPCs públicas para service_role. Auth.uid/trigger ownership não devem ser contornados. |
| Ensaio | Uma conta e instalação explícitas, origem HTTPS exata, cliente Auth e serviço ambos QA direct, consentimento atual do dispositivo. Reserva atômica antes do transporte. Qualquer tentativa histórica da instalação impede outra, inclusive falha, timeout ou expiração. |
| Escalação | Primeira observação cria baseline, não alerta histórico. XI confirmado, prazo encerrado, consentimento revogado, subscription/generation divergente ou fonte inválida cancelam/recusam; concorrência ocupada não é interpretada como ausência. |
| Tentativas | Nonce consumido e estado terminal não reabrem; erro/recibo perdido não autorizam retry de envio. Expiração marca tentativa incerta ou cancela a não iniciada, sem reenfileirar. |
| Idioma | Valor canônico da conta relido antes/depois da reserva. Sem idioma confirmado, falha fechada; não inventar idioma para satisfazer o teste. |

Os triggers `touchline_game_notification_preferences_epoch` e `touchline_game_notification_device_epoch` **entram em funcionamento no momento da migration**, mesmo com o worker desligado. Alterações relevantes de consentimento/dispositivo invalidam inscrições/fila; mudança apenas de idioma não deve invalidar. Portanto, “nenhum envio automático” não significa ausência de efeito em futuras escritas nessas duas tabelas. Incluir regressão do salvamento de preferências e do registro de dispositivo antes de ativar transporte.

## Verificações após aplicar o schema, ainda com envio desligado

- Reexecutar os estágios A–C do SELECT e conferir as assinaturas/ACLs/constraints/índices previstos; nenhuma permissão ampliada. Comparar definição de funções centrais, especialmente `sync_gameweeks`, com a preimagem aprovada.
- Confirmar que DDL e histórico correspondem aos hashes do manifesto e que nenhum arquivo pendente foi aplicado fora dele.
- As sete tabelas novas de bookkeeping devem continuar vazias se estavam ausentes e não houve ativação concorrente. Preservar contagens anteriores se algum componente já existia; não zerar dados para obter esse resultado.
- Confirmar preservação de preferências, usuários, dispositivos, elenco, saldo, pontuação e cron. Validar que a API publicada ainda grava preferências/idioma e registro com a identidade correta.
- Conferir contrato de erro: ensaio desabilitado retorna 503; rota de lembrete GET retorna 405; POST com gate OFF retorna 503 e não admite/envia. GET 405 não comprova auth; `idle` 200 não comprova entrega.
- Ausência de schema, fonte, VAPID ou contexto válido deve permanecer `unconfigured/unconfirmed`, sem fallback para dados inventados ou envio. Não chamar reserve/admit/scan/claim/finish/expire/sync no inventário: são mutações, mesmo que sejam usadas apenas para “testar”.

## Gates separados para ativar e comprovar entrega na QA

1. Pré-flight e schema acima aprovados, candidata correta publicada e configuração de build/servidor coerente. Leitura de flags não prova valores efetivos no deployment.
2. Uma CUSTOMER QA e uma instalação com permissão concedida explicitamente; device salvo com identidade correta. O estado remoto relatado é zero dispositivos, portanto hoje falta esse requisito.
3. Ensaio isolado: `TOUCHLINE_PUSH_REHEARSAL_ENABLED`, `..._ORIGIN`, `..._ACCOUNT_ID`, `..._INSTALLATION_ID`; par VAPID (`NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY`, `TOUCHLINE_WEB_PUSH_PRIVATE_KEY`, `TOUCHLINE_WEB_PUSH_SUBJECT`) válido e correspondente. Não criar/ler/copiar segredos neste manifesto. Chave pública é de build; mudar apenas servidor não corrige bundle antigo.
4. Uma tentativa de ensaio autorizada, com reserva/recibo correlacionados; observar a notificação real e abrir seu destino. `provider_accepted` significa aceitação pelo provedor, **não** exibição/leitura no aparelho. Desligar o ensaio ao concluir; não limpar tombstone para repetir.
5. Escalação: gate `TOUCHLINE_LINEUP_REMINDER_WORKER_ENABLED`, bearer interno `..._SECRET`, escopo competition/season, `..._MAXIMUM_AGE_MS`, lease 1–60s, lead 1–86400s, page 1–50, retry 1–3600s e VAPID coerente. Os valores operacionais devem partir da cadência real, não ser escolhidos para forçar um PASS.
6. Agendador autenticado deve fazer **POST** a `/api/notifications/lineup-reminders/dispatch`. Cron inexistente não será criado por essas migrations. O endpoint admite uma página e processa no máximo uma entrega por invocação; provar capacidade/cadência e duas execuções sem duplicar, antes do lançamento.
7. Baseline antes da janela de lembrete; provar um XI incompleto e outro confirmado, cancelamento após revogação, recibo sem duplicação e destino correto. Prova de gol/cartão não substitui lembrete e vice-versa.
8. Computador, celular e tablet devem ter recebimento observado nos navegadores suportados. SQL local, navegador simulado ou notificação em um aparelho não aprovam iPhone físico nem todos os canais do produto.

## Rollback e recuperação

Antes do commit do grupo, qualquer erro de DDL/histórico deve reverter a transação inteira. Após commit, priorizar desligar os gates e pausar o agendador autenticado; preservar schema, tentativas e tombstones para auditoria. Não usar DROP/CASCADE, apagar histórico ou liberar reenvio mediante exclusão de tentativas. Reverter código sem verificar compatibilidade de RPCs pode quebrar idioma/consumidores; manter versão compatível ou aplicar reparo forward revisado.

Se o erro estiver nos triggers de preferências/dispositivos, desligar o worker não elimina esse efeito. Preparar reparo forward específico da função/trigger com a preimagem registrada, preservando revogação e RLS; não desabilitar triggers amplamente. A migration de projeção exige plano próprio caso sua substituição de `sync_gameweeks` altere regra existente.

## Provas locais já existentes, sem nova execução

Log anterior: `artifacts/local-card-integrity-20261031/consolidated-suite.log`. O arquivo contém falhas de outros setores; estes trechos não transformam a suíte inteira em PASS nem se somam a totais sobrepostos.

| Teste presente | Evidência anterior / alcance |
|---|---|
| `touchline-push-rehearsal-sql.test.mts` | Linhas 6996–7003: reserva persistente + seis subcasos; roles/RLS, binding, duplicação/cooldown, imutabilidade e transporte criptografado sintético. Não houve push físico. |
| `touchline-game-notification-ledger.test.mts` | Linha 4509: baseline, admissão única, ABA e tombstone, com SQL local. |
| `touchline-game-notification-delivery-claims.test.mts` | Linha 4508: releitura, claim/reserva/término e nonce não reutilizado. |
| `touchline-lineup-reminder-admission-scan.test.mts` | Linha 4922: paginação/cursor/retry/baseline/rollback sem transporte. |
| `touchline-lineup-reminder-composition-sql.test.mts` | Linhas 4942–4948: source-missing, normal, second-locale, finish-not-reached, finish-response-lost. SQL real do módulo com pais reduzidos e transporte sintético, não PostgREST QA nem dispositivo. |
| `touchline-notification-game-locale-sql.test.mts` | Fonte cobre oito idiomas, RLS, preferências preservadas e triggers reais com alteração apenas de locale; não foi repetido neste lote. |
| `touchline-game-locale-revision-sql.test.mts` | Linhas 4499–4507: revisão, ACL/RLS, concorrência simulada sequencial, bigint exato e preservação de preferências. Não é prova de conexões concorrentes reais. |

Os testes SQL usam `TOUCHLINE_FANTASY_PGLITE_MODULE`; sem esse opt-in os casos SQL ficam SKIP. Caso um gate futuro exija repetição por mudança de schema/consumer, usar o módulo existente e os arquivos afetados em série pelo executor Node do projeto, com `--test-concurrency=1`; não instalar módulos nem repetir a suíte inteira por causa desta documentação.

## Registro de entrega

**MISSION:** preparar a aplicação mínima de schema de ensaio push e lembretes na QA.
**SCOPE:** inspeção local e manifesto; sem alteração de produto ou dados.
**QA BRANCH / COMMIT:** candidata detached `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694`, WIP preservado.
**QA DEPLOYMENT:** não consultado nem criado neste lote.
**REMOTE BUILD BUDGET / CONSUMED:** 0 / 0.
**STABLE QA URL:** https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
**FILES CHANGED:** este relatório, manifesto JSON e SQL SELECT de pré-checagem.
**FUNCTIONAL RESULT:** planejamento concluído; instalação, ativação e entrega permanecem pendentes.
**VISUAL / RESPONSIVE / ACCESSIBILITY / BROWSER MATRIX:** não exercitados, não aprovados por este lote documental.
**SECURITY RESULT:** sem segredo lido/transferido, RLS/ACL/default-OFF preservados; retenção de avatar continua frente separada aguardando autorização específica.
**TESTS / BUILD:** nenhum novo teste/build; provas anteriores delimitadas acima.
**OBSERVABILITY:** hashes de fonte e inventário SELECT preparados; resultados QA atuais pertencem ao agente raiz.
**OPEN FINDINGS:** schema/histórico completo ainda por verificar; flags/consentimento/dispositivo/cron/entrega real e canais de produto ainda não comprovados.
**PRODUCTION:** NOT TOUCHED.

| Ferramenta / skill | Ação efetiva | Resultado |
|---|---|---|
| Supabase skill | Orientações de SQL/RLS revisadas; nenhum conector remoto usado | Não declarar leitura/aplicação QA por este agente |
| Shell/rg/leitura local | Migrations, runtime, testes e logs confrontados | Ordem e riscos de replay identificados |
| Python/patch documental | Manifesto com SHA-256 e SELECT de inventário | Artefatos preparados, não executados |

Gate de conclusão aplicado ao escopo documental: não há PASS funcional de notificações ou liberação de deploy derivada deste relatório.
