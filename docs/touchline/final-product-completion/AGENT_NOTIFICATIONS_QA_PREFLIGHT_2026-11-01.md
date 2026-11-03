# Notificações — pré-checagem QA executada em 2026-11-01

**Resultado: preflight de schema concluído; notificações operacionais ainda não aprovadas.** A leitura direta confirmou sete tabelas ausentes do caminho de lembretes/ensaio. O pipeline de eventos de partidas já existe e é distinto. Nenhuma migration, ativação, envio, alteração de usuário ou consulta a segredo foi feita neste lote.

Alvo verificado por list_projects: **xgxbwqxjssxxuihuwmgy — TouchLine Development QA — ACTIVE_HEALTHY**, PostgreSQL 17.6.1.155. Production vxireiswggllwhbsmdcj não recebeu SQL. Candidata: qa-stripe-release-20261029, HEAD 47ebfffbbda98cbb89bcd3ad08fb19efd1e50694, WIP preservado. A primeira evidência consolidada tem horário 2026-11-01 02:12:40 UTC; os complementos trazem seu próprio horário.

## Evidência reproduzível

- [Inventário QA completo, consultas e resultados](../../../artifacts/avatar-notifications-20261031/qa-notification-schema-preflight-20261101.json): estágios A–K; includes definições exatas da projeção e sync, sem linhas pessoais.
- [Distinção dos pipelines e histórico adicional](../../../artifacts/avatar-notifications-20261031/qa-notification-pipeline-distinction-20261101.json): estágios L–M.
- [Plano anterior e limites de ativação](AGENT_NOTIFICATIONS_MIGRATION_PLAN_2026-11-01.md): complementado por este inventário, não substituído nem marcado como aplicado.

As 53 colunas-base esperadas existem com tipos exatos. Há uma configuração Fantasy ativa no total e 11 geometrias publicadas; essas contagens não validam o conteúdo de cada geometria. Todas as constraints consultadas estão validadas; a de intervalo de gameweek aceita locks_at <= first_fixture_at.

## Dois pipelines diferentes: não recriar o que já existe

| Grupo | Objetos comprovadamente existentes |
|---|---|
| Preferências e histórico | notification_preferences, notification_history |
| Dispositivos e interesses | notification_devices, touchline_fixture_alert_subscriptions |
| Eventos de partidas | touchline_match_push_enrollments, touchline_match_push_identity_ledger, touchline_match_push_outbox |

Os triggers atuais de preferências/dispositivos são touch_updated_at e touchline_match_push_invalidate_enrollment, nos nomes notification_*_updated e touchline_match_push_*_epoch. Todos estão habilitados. O novo ledger de escalação adicionará outros dois triggers, com prefixo touchline_game_notification, sem substituir os de partidas.

O histórico remoto contém as migrations de match_push desde outbox até source_key_deduplication e touchline_fixture_alert_revision. Ausência de tabelas de escalação não invalida a existência do caminho de partidas; existência de match_push não comprova entrega, configuração ou dispositivos registrados.

**Ausentes, por to_regclass e inventário de catálogo:**

1. public.touchline_game_notification_enrollments
2. public.touchline_game_notification_identities
3. public.touchline_game_notification_deliveries
4. public.touchline_lineup_reminder_scan_state
5. public.touchline_lineup_reminder_admission_work
6. public.touchline_push_rehearsal_cooldowns
7. public.touchline_push_rehearsal_attempts

Também ausentes: reader de lineup, invalidate/admit/guard/lock/claim/reserve/finish/expire do game_notification, admission_scan e reserve/finish do rehearsal, nas assinaturas exatas do estágio C. Os índices actor_installation e work_due também não existem. A busca por nomes no histórico não encontrou migrations lineup_reminder/game_notification/push_rehearsal registradas com outro timestamp.

## Pré-requisitos existentes que não devem ser reaplicados

- notification_devices canônico: unique(user_id, installation_id), FK users, permissão em granted/denied/default e constraint de subscription completa. RLS habilitada e forçada, policy ALL restrita ao próprio user_id.
- notification_preferences: policies SELECT/INSERT/UPDATE restritas ao próprio usuário autenticado. O grant SELECT para anon não equivale a acesso a linhas; não há policy anon no inventário.
- Locale: game_locale e game_locale_revision existem; RPC touchline_set_game_locale(text,bigint) existe, invoker, search_path vazio, executável por authenticated/service_role. A antiga RPC text está ausente, como esperado.
- História: preferences foi registrada como 20260814173526 / 017_touchline_notification_preferences, e a projeção como 20261017155620 / touchline_fantasy_shared_market_window_projection. Portanto, ausência do timestamp local isolado nunca foi usada como prova de ausência do schema.
- Helpers fixture live/final, geometria, touch_updated_at e auth.uid existem.
- Não reaplicar repair de dispositivos: ele pode rejeitar os triggers de match_push já instalados.

## Divergência concreta da janela do mercado

A projeção remota existe, mas ainda calcula:
- fechamento = first_fixture_at - 5 minutos;
- reabertura = previous_round_completed_at + 5 minutos.

O arquivo local 20261002031429 fecha no kickoff e reabre na finalização confirmada. A comparação do corpo SQL encontrou **exatamente três linhas diferentes**, todas relativas aos cinco minutos. O corpo de touchline_fantasy_sync_gameweeks() é idêntico ao local e usa essa projeção.

Preimagens atuais de pg_get_functiondef:
- projection: md5 e40b5f762d9b065331e3b26a24a3dff6.
- sync_gameweeks: md5 a54aed23cad04215235eeef009a7072d.

**Ação específica:** preparar uma migration forward, com nova versão, que substitua somente touchline_fantasy_market_window_projection(timestamptz) por CREATE OR REPLACE usando o corpo local aprovado. Preservar assinatura, STABLE, invoker, search_path vazio e ausência de EXECUTE para public/anon/authenticated/service_role. Não executar o arquivo histórico inteiro: ele contém CREATE de uma função já existente e reescreve sync_gameweeks sem necessidade.

Essa correção afeta mais que notificações; deve passar pelo teste focado de fronteira de mercado e revisão independente do agente raiz antes de aplicação. O leitor de lembrete deve usar a mesma regra corrigida. Nenhum sync_gameweeks foi invocado por este agente.

## Manifesto mínimo para a próxima ação da raiz

Os seis arquivos abaixo não estão aplicados na QA. A ordem é de dependência; não é autorização para db push geral. Os hashes são do arquivo atual, não do commit-base.

| Ordem/grupo | Arquivo em supabase/migrations | SHA-256 |
|---|---|---|
| Ensaio 1 | 20261002221350_touchline_push_rehearsal_reservation.sql | e17103f7ec671d2f6b3cbb076b997dc3c61d197a97cfbf48834b9fff3e43d23a |
| Ensaio 2, mesmo commit transacional | 20261003224152_touchline_push_rehearsal_installation_guard.sql | 51c894ad6e5a1d3ce66cb293f99358b8942b896964546730eea0d854f34952ca |
| Escalação 1 | 20261002032250_touchline_fantasy_lineup_reminder_read.sql | 77fa5cdbbc923916397902950d605046a1054f922c5ecf1f9392024696a9e25d |
| Escalação 2 | 20261002033308_touchline_game_notification_ledger.sql | d223de204a10ee478cfb633d1da00b4d066e6448b18689017cd9d0d540de3c82 |
| Escalação 3 | 20261002035727_touchline_game_notification_delivery_claims.sql | aec556fa6fd7a0138e2153b2fb12c2bbe36faaa277d58080adf9fe4db8ec5359 |
| Escalação 4 | 20261002045327_touchline_lineup_reminder_admission_scan.sql | b8212798d4937b165264cce5399887e9fb16e0cacb7c7a409e5ce9f468e20de7 |

**Próxima ação pronta para decisão técnica:** a raiz pode preparar o lote de ensaio com esses dois arquivos, em transação única gerenciada que registre o histórico junto, mantendo o gate OFF. Ele não depende da mudança de janela do mercado. Em paralelo, deve criar e revisar a forward de projeção; após esse gate, aplicar os quatro arquivos de escalação, também em lote transacional gerenciado. Não incluir locale, devices, match_push, registro de geometrias, criação de preferências ou alterações em sync_gameweeks.

Antes de efetivar cada lote: conferir novamente o projeto QA, hashes, ausência exata dos objetos esperados e histórico; drift obriga reconciliar o plano. Uma falha deve desfazer integralmente DDL e registro de migration. Não marcar histórico aplicado antes da DDL. O processo deve preservar as duas contas CUSTOMER QA e o ADMIN separados.

## O que transforma schema em notificações funcionando

Após schema, repetir A–C + índices/triggers e contagens das sete tabelas novas, sem criar inscrições durante o inventário. Conferir:
- novas tabelas RLS habilitada/forçada, sem acesso anon/authenticated;
- tabelas de ensaio service_role SELECT/INSERT/UPDATE, sem DELETE/TRUNCATE;
- tabelas de escalação service_role somente SELECT direto e mutações pelo conjunto de RPCs protegido;
- nenhum novo grant para helpers internos;
- preferências e registro de dispositivo continuam funcionando, pois triggers começam a agir imediatamente mesmo com worker OFF;
- o corpo de sync_gameweeks permanece a preimagem e a projeção muda somente conforme o forward aprovado.

Depois, executar em QA publicada a sequência operacional prevista no plano anterior: sessão CUSTOMER real, registro de dispositivo com permissão e consentimento, VAPID válido sem expor segredo, uma tentativa de ensaio reservada persistentemente, recebimento observado no aparelho e abertura correta. Só então ativar trabalhadores/agendamento autenticado por POST, baseline antes da janela de lembrete e cenários de confirmação/revogação/deduplicação.

provider_accepted não prova exibição no telefone. Um schema instalado não prova cron, consumo por telas, entrega de gol/cartão ou lembrete de XI. Este lote não releu flags, VAPID, contagens de dispositivos ou cron; os números do relatório anterior continuam evidências de outro lote, não medidas novas.

O ensaio é limitado a uma instalação/conta e uma tentativa persistente; não apagar tombstones nem trocar identidade para repetir. O worker de escalação processa uma página de admissão e no máximo uma entrega por chamada; a cadência precisa cobrir esse limite.

## Registro de entrega

MISSION: remover incerteza de schema de notificações na QA e fornecer aplicação mínima.
SCOPE: leitura de catálogo, histórico, definições e fonte local; escrita apenas deste relatório e dois JSONs.
QA BRANCH/COMMIT: candidata qa-stripe-release-20261029, detached 47ebfffbbda98cbb89bcd3ad08fb19efd1e50694; WIP preservado.
QA DEPLOYMENT: nenhum criado/inspecionado por este lote; zero builds remotos.
FUNCTIONAL RESULT: preflight concluído; 7 tabelas ausentes identificadas; 6 migrations + forward específico definidos. Sem aprovação de envio.
VISUAL/RESPONSIVE/ACCESSIBILITY/BROWSER MATRIX: não exercitados.
TESTS/BUILD: nenhum novo teste pesado ou build; comparador local de corpos SQL somente leitura.
SECURITY: nenhuma chave/subscription/linha pessoal lida; nenhum RPC mutante invocado; Production NOT TOUCHED.
OBSERVABILITY: queries e respostas completas sanitárias preservadas nos artefatos.
OPEN FINDINGS: aplicar schema, corrigir timing, configurar/runtime/consentimento/cron e provar entrega física.

| Ferramenta | Execução efetiva | Evidência |
|---|---|---|
| Supabase skill | instruções de segurança aplicadas | somente catálogo/histórico/preimagem |
| Supabase list_projects | identidade do alvo | QA saudável e referência exata |
| Supabase execute_sql | SELECTs A–M na QA | 53 colunas compatíveis, 7 tabelas ausentes, pipelines distintos e drift da projeção |
| Shell/Python | leitura e comparação de arquivos | hashes e 3 linhas diferentes; sync idêntico |
| apply_patch | documentação/artefatos próprios | nenhuma alteração de produto/teste/migration |

Conclusão deste escopo não libera deploy nem autoriza declarar notificações 100% funcionais.
