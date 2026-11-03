# Notificações — cadeia de entrega e gates QA

Data: 2026-11-01. Auditoria somente leitura do código local na candidata `qa-stripe-release-20261029`; nenhuma configuração consultada por valor, credencial obtida, envio, alteração remota, nova suíte ou build. A existência do código não confirma que a implantação pública contenha esta versão.

## Conclusão operacional

Há implementação de transporte Web Push, consentimento, registro de dispositivo, produtor de gol/cartão vermelho e lembretes de escalação. **Entrega real continua pendente.** Há uma rota de ensaio isolada em uma conta/instalação QA para verificar transporte antes de ativar eventos do jogo. Ela não deve ser confundida com a cadeia completa de eventos, nem enviada sem a etapa de consentimento própria.

O resultado `provider_accepted` comprova aceitação HTTP pelo serviço de push. **Não comprova exibição, leitura nem clique no dispositivo.** O service worker chama `showNotification`, mas não envia ACK de exibição/leitura ao backend. Não há base para rotular um registro de outbox como “lido” ou “recebido no celular”.

## Caminho exato da partida

| Etapa | Fonte local | Evidência necessária em QA |
|---|---|---|
| Evento oficial atual | `lib/football-data/live-sync.ts:569` | Feed Sportmonks do ciclo corrente persistido, reconciliação sem erros, revisão canônica publicada. Recuperação histórica não produz entrada aqui. |
| Observação/estabilidade | `lib/football-data/confirmed-event-observer.ts` | `confirmedEventObservation.status=completed`; observação canônica torna o evento CONFIRMED, sem inventar gol/evento de teste nos dados reais. |
| Admissão por usuário/dispositivo | `lib/football-data/match-push-producer.ts` | Interesse no fixture, push permitido, `goalsAndEvents`, frequência realtime, consentimento válido, fora do horário silencioso, dispositivo com fingerprint e geração atuais. Primeira inscrição cria baseline e não dispara eventos antigos. |
| Outbox | RPC `touchline_match_push_enrollment` | `stored-or-existing`, identidade exata de evento/dispositivo/revisão, fonte e prazos válidos; repetir observação não duplica evento inicial. |
| Claim | POST `/api/notifications/match-push/dispatch` → `runMatchPushWorker` | Bearer interno correto; um item por chamada; lease atual de `touchline_claim_match_push_batch`. GET retorna 405 e não prova autorização de POST. |
| Revalidação/reserva | `match-push-single-claim-server.ts`, `match-push-claimed-source-server.ts` | Releitura de origem, consentimento, geração, subscription, idioma da conta e claim antes e depois da reserva atômica `touchline_reserve_match_push_attempt`. Sem envio após resultado incerto. |
| Transporte | `match-push-transport.ts` | Web Push criptografado, sem redirects, endpoint de navegador permitido, TTL limitado pela fonte/lease e máximo 300s. Só HTTP 201 vira `provider_accepted`; timeout/429/5xx são incertos, sem retry automático. |
| Recibo persistido | `touchline_finish_match_push_attempt` | Estado final `provider_accepted`, `cancelled`, `failed` ou `uncertain`, ligado à mesma tentativa; recibo perdido não permite reenvio automático. |
| Dispositivo | `public/touchline-push-sw.js` | Notificação realmente visível, identidade/copy corretas; clique abre destino da mesma origem, preserva aba de elenco em edição. `showNotification` não é ACK servidor. |

A configuração do worker não ativa o produtor por si só: o JSON privado precisa de `enrollment.enabled=true`. A leitura de prontidão de fixture é observacional e retorna deliberadamente `operational: unknown`, `delivery: unconfirmed`, `active: false`. Seu campo `configuration: configured` verifica worker/segredo/VAPID/idade, **não** atesta opt-in enrollment, scheduler ou entrega.

Limites presentes, a avaliar antes de lançamento: produtor máximo 10 fixtures, 50 pares dispositivo/fixture, 500 eventos/linhas e 50 admissões dentro de 10s. Exceder o total de pares retorna `limit-exceeded`, não pagina automaticamente. Worker processa um item por invocação. Não basta configurar uma chamada esporádica: volume, cadência e prazo de fonte precisam ser compatíveis, e `limit-exceeded` precisa aparecer como falha operacional, nunca sucesso silencioso.

## Configuração necessária (somente nomes, não valores)

| Área | Configuração / requisito |
|---|---|
| Conta/Storage | Clientes Auth e serviço apontando para `xgxbwqxjssxxuihuwmgy` e mesmo ambiente; schema/RPC atuais presentes. Não reutilizar Production. |
| Registro do navegador | `NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY` válido no build; HTTPS, ServiceWorker, Notification e PushManager disponíveis; permissão concedida pelo gesto do usuário. Registro em `notification_devices` pertence à conta/instalação confirmada. |
| Chave do transporte | `TOUCHLINE_WEB_PUSH_PRIVATE_KEY`, `TOUCHLINE_WEB_PUSH_SUBJECT`; parser deriva ponto público P-256 e exige par correspondente. Chave pública alterada requer reinscrição explícita; não basta gravar chave diferente no servidor. |
| Interesse por partida | `TOUCHLINE_FIXTURE_ALERTS_ENABLED=true`, subscription própria em `touchline_fixture_alert_subscriptions`; GET readiness não grava nem envia. |
| Worker de partidas | `TOUCHLINE_MATCH_PUSH_WORKER_ENABLED=true`, `TOUCHLINE_MATCH_PUSH_WORKER_SECRET` com 32–512 caracteres, agendador autenticado para POST. |
| Idade/enrollment | `TOUCHLINE_MATCH_PUSH_SOURCE_AGE_POLICY`: quatro inteiros positivos em **ms** (`eventSyncedAt`, `settlementSyncedAt`, `fixtureUpdatedAt`, `lastObservedAt`); bloco `enrollment` com `enabled=true`, `maximumEventLagSeconds` e `maximumSourceAgeSeconds` positivos em **segundos**. Valores dependem da cadência real e política editorial; não inventar janela para forçar envio. |
| Lembretes de escalação | `TOUCHLINE_LINEUP_REMINDER_WORKER_ENABLED`, `TOUCHLINE_LINEUP_REMINDER_WORKER_SECRET`; `TOUCHLINE_LINEUP_REMINDER_MAXIMUM_AGE_MS`; `TOUCHLINE_LINEUP_REMINDER_LEASE_SECONDS` 1–60; `TOUCHLINE_LINEUP_REMINDER_COMPETITION_ID` e `TOUCHLINE_LINEUP_REMINDER_SEASON_ID` UUIDs QA; `TOUCHLINE_LINEUP_REMINDER_LEAD_SECONDS` 1–86400; `TOUCHLINE_LINEUP_REMINDER_PAGE_SIZE` 1–50; `TOUCHLINE_LINEUP_REMINDER_RETRY_SECONDS` 1–3600. VAPID igual ao registro. |
| Ensaio isolado | `TOUCHLINE_PUSH_REHEARSAL_ENABLED`, `TOUCHLINE_PUSH_REHEARSAL_ORIGIN`, `TOUCHLINE_PUSH_REHEARSAL_ACCOUNT_ID`, `TOUCHLINE_PUSH_REHEARSAL_INSTALLATION_ID`, além do VAPID. Página permite preparar registro antes de fixar instalação; POST só envia com a instalação configurada exata, conta autenticada autorizada, QA direct e origem HTTPS exata. |

`NEXT_PUBLIC_*` é configuração de build: presença no painel não confirma que o JS servido contém a chave pública esperada. Confirmar a candidata e o bundle efetivo sem expor material privado.

O `vercel.json` atual só declara região `fra1`, sem `crons`; os workflows inspecionados não agendam os endpoints de push. Isto **não prova ausência de um agendador externo ou cron no banco**. Verificar nome do job, frequência, alvo QA, autenticação e duas execuções registradas; não imprimir comandos que possam conter bearer.

## Lembretes e outros canais não são o mesmo sistema

- Escalação usa `touchline_lineup_reminder_admission_scan`, `touchline_game_notification_enrollments`, `touchline_game_notification_identities` e `touchline_game_notification_deliveries`, seguido de claim/reserva/finish próprios. Confirmar baseline antes da janela de lembrete e a condição real de XI/treinador; conta com XI já confirmado não deve receber lembrete indevido.
- O produtor automático de partida inspecionado admite apenas `GOAL_CONFIRMED` e `RED_CARD_CONFIRMED`. Helpers de resultado final e módulos de enqueue não demonstram, sozinhos, conexão com um scheduler ativo; as referências runtime procuradas não mostraram produtor de resultado final nesse caminho.
- A Central de Notificações oferece categorias, canais in_app/push/email e periodicidades. O ato de salvar ali grava preferências; não executa `Notification.requestPermission` nem registra dispositivo. O controle do mercado e o ensaio têm preparação explícita de dispositivo. Esse caminho precisa ficar claro ao cliente e ser testado no fluxo publicado.
- A auditoria de `app`, `lib` e `scripts` não encontrou consumidor/produtor runtime da tabela `notification_history`. Inbox da Central possui modelo próprio, e não deve ser usado como evidência dessa tabela.
- Não foi encontrado envio de e-mail/digest de alertas do jogo nos módulos/rotas de notificações inspecionados. SMTP/Resend para confirmação e recuperação de conta é outro fluxo. Preferência de e-mail salva não comprova email de gol, oferta, promoção ou lembrete.
- Portanto, não declarar todas as dez categorias, três canais e digest horário/diário funcionais com a prova de um push. A cobertura de produtores por categoria/canal precisa ser fechada ou sua disponibilidade apresentada com honestidade ao cliente.

## Sequência mínima para comprovar, sem ativação ampla

1. **Inventário somente leitura**: identificar deployment SHA/branch QA e estado real de schema, flags sem valores secretos, VAPID correspondente e scheduler. O arquivo SQL de apoio junto deste relatório não executa nada e não deve rodar contra Production. Confirmar banco antes de cada consulta.
2. **Conta/dispositivo único**: usar uma CUSTOMER QA e uma instalação; preparar permissão e registro explicitamente. Confirmar ACK de conta/instalação e `permission=granted`, sem copiar subscription/keys para evidência pública. O serviço de leitura de readiness deve distinguir preferências, inscrição e configuração sem afirmar entrega.
3. **Ensaio de transporte**: somente após o passo de consentimento próprio, enviar uma única notificação silenciosa pela página `/notifications/rehearsal`; registrar tentativa/reserva/outcome e observar fisicamente exibição + clique. O payload diagnóstico é propositalmente identificado como teste, oculto fora da conta QA configurada. Não o transformar em mensagem pública de produto. `provider_accepted` sem observação continua pendência de dispositivo.
4. **Evento real corrente**: inscrição/baseline antes do próximo evento oficial elegível. Correlacionar fixtureProviderId/eventProviderId, snapshot/revisão, enrollment, outbox, lease, tentativa e recibo. Scheduler precisa concluir dentro das janelas. Não fabricar evento na fonte real nem reenviar jogo antigo para satisfazer teste.
5. **Não duplicação/revogação**: nova observação igual não cria novo inicial; revisão usa tag do evento e `renotify=false`. Com preferência pausada/interesse removido, fila deve cancelar sem transporte; repetir dispatch não deve reabrir tentativa terminal. Resultado incerto exige investigação, não replay.
6. **Lembrete separado**: cenário canônico de XI incompleto dentro da janela e outro já confirmado. Provar producer→delivery própria→notificação→link do mercado, respeitando início oficial e fuso. Isto não é coberto pelo teste de gol.
7. **Dispositivos**: computador, celular e tablet com suporte real observado; registrar navegador/OS, permissão, instalação, exibição e destino. Browser sintético não comprova push físico no iPhone. Não enviar para outros usuários nem alegar que recebimento em um aparelho cobre todos.
8. **Automação**: duas execuções reais de scheduler (uma processada e uma sem duplicar), observabilidade de atraso/falha e procedimento de pausa. Desativar ensaio quando terminar; produção exige configuração e gates próprios.

## Testes locais existentes para rerun apenas após mudança correspondente

Não foram repetidos neste lote, pois não houve alteração de fonte. O recibo anterior `artifacts/avatar-notifications-20261031/delivery-avatar-public.log` registra 94 PASS de subset; não equivale a prova física e não se soma a outros totais sobrepostos.

- Identidade/dispositivo: `touchline-push-device-handler`, `touchline-push-registration-client`.
- Status sem falsa promessa: `touchline-fixture-alert-status`, `touchline-fixture-alert-status-server-auth`, `touchline-fixture-alert-status-presentation`.
- Produtor/SQL: `touchline-match-push-producer-sql`, `touchline-match-push-runtime-enrollment-sql` e fixtures com gate SQL explicitamente habilitado; ausência do opt-in é SKIP, não PASS.
- Claim/transport: `touchline-match-push-worker-server`, `touchline-match-push-worker-route`, `touchline-match-push-claimed-source`, `touchline-match-push-dispatch`, `touchline-match-push-transport`.
- Ensaio: `touchline-push-rehearsal-handler`, `touchline-push-rehearsal-server`, `touchline-push-rehearsal-sql`.
- Receptor: `touchline-push-worker` (harness, não dispositivo físico).
- Lembretes: admission-scan, worker, claimed-source, delivery-policy e rota correspondentes.

Todos são `tests/<nome>.test.mts`. Usar o executor oficial e somente os testes afetados, respeitando recursos e evidências anteriores. Não executar uma bateria só por ter escrito este relatório.

## Limite do diagnóstico remoto

O relatório anterior registrou 0 dispositivos/histórico/outbox e 3 preferências em uma leitura de 2026-10-31. **Não foi refeita consulta remota neste lote**, portanto esses números são uma fotografia anterior, não o estado atual. Esta auditoria não habilitou nenhum flag, scheduler ou destinatário. O binding de retenção de avatar continua sendo frente separada sob o agente raiz.

## Artefatos deste lote

- `artifacts/avatar-notifications-20261031/notifications-delivery-audit-source-manifest.json`: SHA-256 das fontes inspecionadas e dos dois artefatos de entrega.
- `artifacts/avatar-notifications-20261031/notifications-qa-readonly-inventory.sql`: consultas agregadas preparadas, **não executadas**; dividir pelos estágios indicados e confirmar relações antes das consultas dependentes. Não imprime subscription, endpoint, chaves, e-mail ou comando de cron.
