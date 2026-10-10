# Sportmonks — autoridade única QA/Production
2026-10-10 19:21 UTC — B01: teste TCP/TLS local com pg8.16.3 real reproduziu2FAIL: port rejeitava abort/deadline mas socket aguardava timeout2.5s. Corrigido close de cliente dedicado com destroy do transporte antesend, sem query/retry/alteração de COMMIT.11focaisPASS0SKIP989ms; revisão independente semP1/P2 e robustezfragmentaçãoTCP incorporada. Reexecução socket+CLI7PASS0SKIP1145ms (deadline613ms/abort7ms). Native27 operador→SQL real1PASS152ms/RSS157.83MiB/pressão1/swap2924.12estável, servidor encerrado; wrapper expõeconnectionreal para exercerclose. Typecheck restrito5raízes661fontes0/RSS465.94MiB,ESLint0/diff0. Não provaTLS/certificado/remoto nemfullsuite. B02: teste browserNextreal preparado em tests/browser/touchline-clubhub-next-refresh.test.mts, NÃOexecutado; exigefixturelocaldeterminística para2RSCidênticos,cleanup eSSRUTC→Malta. Próximo auditoriaB04/B06 e gatesremotos/recursos. NenhumaAPIreal/DBremoto/ativação/deploy/limpeza.
2026-10-10 19:05 UTC — B09: oito locales canônicos passaram controller/rota/SQL nativo, gate draft explícito e consentimento integral preservado; run26=6PASS/5cenários/0SKIP339ms, RSS191.16MiB/pressão1/serverstopped, lint0. B01: auditoria descobriu redirect automático gerando HTTP extra não admitido; provider guardado agora redirect:error (legado preservado), 302/307 recusados com recibo desconhecido/sem dados/cache. B02: contrato antigo de helper renomeado corrigido com epoch comportamental em três fusos.22focaisPASS0FAIL0SKIP3255ms/lint0/diff0, revisão root. B20: diagnóstico803arquivos semSQL interrompido no browser match-card;2904PASS1FAIL342cancelled5SKIP115s, picoRSS597.20MiB/pressão2. Falha real do helper reparada e retestada; cancelamentos não são PASS. Mac recuperou pressão1/swap2932.12/disk8.23GiB. Gates globais/QA continuam abertos; nenhum deploy, API real, escrita remota ou exclusão.
2026-10-10 18:47 UTC (horário do registro corrigido) — B01/B02: Live entrypoint completo até snapshot, sem seams de provider/persistência, com HTTP/admin sintéticos: duas admissões/recibos antes de escrita; ACK válido publica4, ACK ausente mantém1; finalização única. Resultado partial deliberado por ranking indisponível, não prova pontuação completa. Novo teste2PASS; junto checklist6PASS0SKIP257ms, ESLint0/diff0. Revisão root sem P1/P2; inventory revisado independentemente sem P1/P2. Próximo ensaio requer11 atletas elegíveis para seleção/ranking completos, não relaxar regra. Tipagem/globalgates/SQL e QA remotas pendentes. September confirmou caffeinate display30787 até03:32UTC/05:32Malta, system9906 preservado; não remove bloqueio manual/senha/reinício. Nenhuma exclusão/ativação/escrita remota/deploy.
2026-10-10 18:38 UTC — B01/B02 🟢 agenda entrypoint real sem provider/persistSchedule injetados: HTTPcentral/auth/gateway/store + provider/fixturestore reais, transportessintéticos; epochprioritário/London13:30→UTC12:30/UTCexplícito sobTZSãoPaulo;3completionsantesupserts,deny429lostcomplete0futebolwrite,persistfailureerror/coachnãoexecutado. Live P1 reproduzido snapshotpublicava4apesarfalhaDB(scorecanônico1); agora sópersistence.merged alimentadistribuição. Store sóack1row comproviderIDcorreto;zero/null/múltiplo/IDerrado→write-unconfirmed. TestesmistoAack4/Bfalha0mantêmparcialsemrollbackA.65PASS0FAIL0SKIP450ms,tscfocal722fontes0(heap384),lint0/diff0;revisãoindependente semP1/P2 e reforçosadotados. 🟡 ProviderSQL/transporte remoto/Liveentrypointtotal/pontos/completiondurável/fullgates/QA não comprovados porharness. PróximoGoldenBootcentralentrypoint;FulltsccontinuaOOM512pendente. NenhumaAPIreal/DBremoto/ativação/deploy/cleanup.
2026-10-10 18:35 UTC — B01 integração dos jobs: P1 reproduzido e reparado no roster20, que ainda consultava checkpointquota local após migração central. Removida dependência do ledger de conteúdo; guardgetSquad agora recusa extended negado/429/completionperdida antes de retorno/persistência. EntryPointreal→factory→auth/gateway/store comtransportessintéticos:40tentativas/1aplicaçãoatômica/replaysemwrite,negativosiniciais/finais eQA/Prod.23focaisPASS1025ms+17regressõesPASS1753ms;tscfocal658fontes0(heap384),lint0/diff0;rootrevisou rostersemP1/P2. Teste foundationlegado2FAIL reproduzidos,migradoparacentral2PASS;revisãoindependentependente. Fulltsc982raízes falhouOOMheap512,picoRSS597.58MiB;focal256tambémOOM antes384PASS. NÃO fullgateverde. Saúdepressão2→1/swap2996→2988MiB;processosencerrados. Manifestodirty319arquivos11.4MB registrado no coordenador, incluiartefatosgerados(.tsbuildinfo/next-env) para exclusão do futurostaging,não limpeza;nãoémanifestoaprovado/SHAlimpo. PróximosLive/agenda/GoldenBootentrypoints,CLI/TLS/config/SQLremoto/fullsuite/build/QA. Nenhuma APIreal/SQLremoto/ativação/deploy/cleanup.
2026-10-10 18:23 UTC — B01 🟢 corrigido isolamento QA que rejeitava oito nomes privados CENTRAL/AUTHORITY mesmo OFF e causaria503. Allowlist exata, autoridade vinculada ao refQA, isolated/recovery/unknown continuam bloqueados; proxyreal→POST comHTTPsintético:21PASS0FAIL0SKIP375ms; tsc543fontes0,ESLint0,diff0. Auditoria remota somente leitura via CLIs autenticadas: QA/Prod ACTIVE_HEALTHY; schema central ausente em ambos; QA quota_scopes0/enabled0/pending0,cron5/6OFF; Prod sem cron.job (não prova ausência de outros schedulers). Vercel preview/qa sem nomes CENTRAL/AUTHORITY. 🟡 Configuração/instalação/ensaio remoto/fullgates/deploy pendentes. Nenhum segredo exposto, escrita remota/ativação/deploy/limpeza. Caffeinate9906 ativo, ~9h11 restantes às18:21; Mac acordado não significa desbloqueado. September mantém exclusividade de saúde/iCloud.

## Adaptador operador e CLI — 18:12 UTC

CRITICAL ENGINEERING local: recuperação privada SQL017 agora tem adapter real pg.Client dedicado em `tools/quota-recovery/operator-port.mjs`. Nenhuma função foi concedida a workers/service_role. A configuração do cliente é explícita, TLS verifica certificado/hostname, direct ou session pooler porta5432; sem URL livre, fallback, segredo no argv/log ou herança PGOPTIONS. A admissão aguarda COMMIT síncrono com fsync e então outra conexão/PID confirma lease/request/owner/case/scope OFF/estado esperado antes de devolver autorização HTTP. Conclusão aguarda COMMIT; resposta perdida permanece incerta mesmo se o banco gravou.

Manifesto: package.json/package-lock.json/config.mjs/measure.mjs/operator-port.mjs no pacote operacional; testes config/port e native operator. `pg@8.16.3` instalado isoladamente com `npm ci --ignore-scripts --no-audit --no-fund --prefix tools/quota-recovery`, sem mudar dependências do app. Node24 é necessário. A pasta node_modules é ignorada.

CLI: `node --conditions=react-server --experimental-strip-types tools/quota-recovery/measure.mjs --check` valida somente configuração offline. Não conecta nem certifica senha/TLS/DB. Execução explícita: mesmo comando com `--measure-single --case UUID --worker ID --path /teams/19`, apenas depois de incidente/drenagem/reset/preparação aprovados; path deve corresponder à entidade pendente. Uma medição por invocação/caso/entidade, sem repetição automática. Não prepara/finaliza/ativa nada. Saída recorded significa recibo persistido, não quota utilizável/recuperação concluída.

Variáveis exclusivas: TOUCHLINE_RECOVERY_OPERATOR_ENABLED=true, TOUCHLINE_RECOVERY_CENTRAL_PROJECT_REF, TOUCHLINE_RECOVERY_DB_MODE (direct/session), TOUCHLINE_RECOVERY_DB_HOST, TOUCHLINE_RECOVERY_DB_PORT=5432, TOUCHLINE_RECOVERY_DB_USER, TOUCHLINE_RECOVERY_DB_PASSWORD, TOUCHLINE_RECOVERY_ACCOUNT_SCOPE, TOUCHLINE_RECOVERY_SPORTMONKS_TOKEN; TOUCHLINE_RECOVERY_DB_CA_PEM opcional para CA confiável. Nenhuma variável real foi configurada. Segredos devem vir do mecanismo operacional protegido, nunca argumentos ou commit.

Evidência:16focais PASS/0SKIP376ms,4finais config114ms; import real executor/operator sob react-server confirmado. Native22 PostgreSQL17.9 com pg do pacote:1PASS0SKIP188.85ms/total286ms, RSS150.41MiB,pressão1/swap3132.12estável/disco9.312GiB,servidorencerrado. Confirma invisibilidade antesCOMMIT e visibilidade antesHTTP,commitrejeitado/perdido/completionperdida/role/scopeincorretos,semativação. Runs19/20 falharam por import CJS incorreto no harness;21/22 passaram após correção. Typecheck550fontes0,ESLint0,diff0; revisão independente semP1/P2.

Limites: CLI --measure-single ponta a ponta, TLS/identidade remota/credenciais reais, cancelamento de conexão TLS lenta, configuração/deploymentprotection/QA não comprovados. Próximo: verificar disponibilidade segura do destino/credenciais da autoridade, ensaiar CLI e recuperação na QA gated, sem usar HTTP201 da Management API como prova de COMMIT. Referências: [conexões Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), [TLS pg](https://node-postgres.com/features/ssl), [transações pg](https://node-postgres.com/features/transactions). Rollback local é remover somente estes novos artefatos do manifesto se necessário; nenhuma alteração remota ocorreu.

## Executor de recuperação e prova de commit — 18:03 UTC

CRITICAL ENGINEERING. Manifesto: `lib/football-data/recovery-measurement-server.ts`, `tests/touchline-recovery-measurement.test.mts`, `tests/native/touchline-recovery-executor-sql.test.mts`; runner coordenador acrescenta este ensaio à allowlist. Rollback somente estes deltas locais, sem excluir recibos. Não expõe recuperação às RPCs públicas nem aos workers.

Executor captura configuração e métodos antes de await, valida case/worker/token/path, fixa host e GET/per_page1, recusa includes/query/redirect e limita corpo a128KiB. Cada objeto é consumido antes do primeiro await; autorização HTTP é consumida antes de fetch. SQL017 impede nova autorização da mesma entidade mesmo recriando objeto. Reutiliza HTTP enforcement e normalização de quota, sem retry/cache/fallback. Retorna somente requestId/estado/observação allowlisted após confirmação de gravação; nunca footballpayload/token/URL/erro cru. `recorded` significa recibo gravado, NÃO saldo livre nem recuperação resolvida. Não prepara/finaliza/ativa automaticamente.

Contrato obrigatório do port operador: acessar autoridade central explícita, manter escopo/identidade e confirmar COMMIT antes de resolver admissão. Nenhuma transação externa pode permanecer aberta enquanto HTTP é emitido. O adapter operacional/CLI ainda precisa ser implementado; o port injetado do teste não é uma integração remota pronta.

Revisão P2: abort durante reader.read pendente não cancelava stream. Reparado com listener explícito, cancel não aguardado, race da leitura com abort, dupla checagem e remoção do listener. Teste usa read e cancel hook não cooperativos e exige cancel1/completion0/HTTP1, sem publicação tardia. Revisão final semP1/P2.

7 focais PASS/0FAIL/0SKIP177.63ms. Native PostgreSQL17.9 run18:1PASS0SKIP124.68ms,total252.71ms,picoRSS144.58MiB,pressão1/swap3132.12MiBestável. Outra conexão/backend observa tentativa owned+globallease já committed ANTES do HTTP sintético. Prova success/429/lost admission afterCOMMIT/lost completion/oversize; novo objeto não repete HTTP e finalização mantémOFF. Tsc3raízes547fontes0,ESLint0,diff0. Nenhuma chamada Sportmonks/Supabase real, env/credencial/ativação/commit/deploy.

Próximo: adapter operacional com destino explícito e confirmação de commit, conexão ao executor e ensaio sem bypass; depois configuração/drain/five-job integration/proxy/fullsuite/build/exactSHA/QA. Preservar gates remotos separados. Monitor September18:01 pressão1,swap3.06GiB,disco9.62GiB,caffeinate9906ativo,parte iCloud uploadedmetadata,0bytesremovidos. RuntimePG/data-*preservado; servidor do ensaio encerrado.

## Recuperação SQL preparada e ensaiada — 17:57 UTC

**CRITICAL ENGINEERING**, local apenas. Manifesto: `015_touchline_central_recovery_cases.sql` (UTC explícito), novos `016_touchline_central_recovery_prepare.sql`, `017_touchline_central_recovery_measurement.sql`, testes nativos `touchline-central-recovery-prepare-sql.test.mts` e `touchline-central-recovery-measurement-sql.test.mts`; allowlist do runner coordenador. Não publicar/aplicar esses scripts automaticamente em bases de conteúdo. Rollback dos instaladores é transacional; nunca apagar recibos para reparar quota.

Fluxo: record → prepare → admit/complete por entidade → finalize. Tudo privado, SECURITY INVOKER e revogado inclusive service_role; workers normais continuam usando apenas wrappers013. Prepare exige scopeOFF/unknown, todos workersOFF, lease expirada identificada em tentativa owned, drenagem posterior à atividade/deadline e reset atestado posterior à drenagem com5s de margem e até5min de idade. Referências externas são atestações do operador, não prova automática de reset/drain. Snapshot original revalidado sob locks; conjunto conservador inclui TODAS entidades do incidente. Casos vazios/inexplicados recusados. Quarentena relaciona tentativas originais por FK sem preencher observation/completedAt fictícios.

Digest privado SHA256 do scope, workers e histórico detecta alterações durante o protocolo; operações raras de recuperação leem o histórico sob lock, não devem ser usadas como polling. Admit consome autorização única por entidade/caso junto de tentativa/owner/globallease, prazo1–20000ms, janela de recuperação5min. A função NÃO realiza HTTP. Complete verifica case/worker/request/endpoint/token antes do core014 e mantém falhas registradas. Finalize exige todas entidades, receipt válido/timely/latest e nenhuma pending não quarentenada; pode reconciliar429 ou reserva esgotada SEM autorizar tráfego: scope e workers ficamOFF, cooldown preservado. Abort recusa lease válida/margem5s; mesmo após expirar mantém token/attempt/unknown para novo drain/reset. Replay de caso fechado é só confirmação histórica.

Revisão identificou dependência indevida do fuso na serialização JSON: corrigida com SET timezone UTC em record/prepare/digest e funções017. Forward ALTER no016 fixa record anterior; snapshots já existentes não são reescritos silenciosamente. Caso antigo incompatível fica recusado e deve ser encerrado auditavelmente/regravado com evidência nova. Nenhuma instalação remota015 existia nesta execução.

**Provas nativas:** run12 preparo81.01ms; apósUTC run13 70.72ms com registroUTC e preparo/replayMalta+digestigual. Run14 protocolo197.24ms; run15 reforços5424.21ms; run16 final5416.55ms,1PASS/0FAIL/0SKIP,total5499.59ms,RSS149.39MiB. Inclui ACL, rollback após tentativa via triggerP0001, dois backends realmente bloqueados→uma lease/perdedor semtoken, owner/case/token/endpoint incorretos, replay,2entidades, missingquota/reset,503,wrongentity,completionlate,429/reserva,normalpolicy sob service_role apenas após ativação sintética explícita, drift e receipt superado mesmo com digest atualizado no teste, abort após expiração real5.2s preservando lease e exigindo novo drain. Run17 regressão015 UTC52.55ms,1PASS/0SKIP. Tsc3raízes544fontes0, ESLint0,diff0. SQL/revisão inicial semP1/P2 apósUTC; reforços finais encaminhados ao revisor.

Revisão final dos reforços recebida: nenhum P1/P2. Rollback por falha, receipt superado, abort preservando lease, novo drain obrigatório e service_role positivos/negativos confirmados por inspeção independente. Fatia SQL local fechada; não é recuperação operacional/QA.

**Não concluído:** falta executor operador que emita exatamente1HTTP por autorização, sem retry/reutilização, teste integrado desse executor e destino/config/drain/5jobs/proxy/fullsuite/build/manifesto/SHA/QA remota. Nenhuma API real, segredo/env, Supabase, ativação, commit ou deploy tocado. Pressão1/swap3164.12MiBestável,disco9.87GiB; servidoresPG encerrados; dados tmp protegidos. Engenharia não realizou limpeza.

## Registro de recuperação — 17:44 UTC (local, não recuperação concluída)

CRITICAL ENGINEERING. Manifesto: `supabase/qa/015_touchline_central_recovery_cases.sql`, `tests/native/touchline-central-recovery-case-sql.test.mts`; runner coordenador acrescenta esse ensaio à allowlist. Objetivo: congelar evidência auditável antes de qualquer futura recuperação. Não objetivos: liberar cota, concluir recibos perdidos, limpar leases, habilitar workers, chamar fornecedor ou alterar ambiente remoto. Rollback desta preparação: transação SQL; não apagar registros de incidente já aplicados.

Operador registra referências de drenagem/reset (atestações externas, não comprovação automática), estado do scope, workers e tentativas pendentes/último recibo owned por entidade. ACL nega anon/authenticated/service_role. Ordem de locks workers→scope→attempt; lock global breve impede registro concorrente de worker. Mesmo par de referências retorna o caso original, NÃO recertifica estado atual; futura recuperação deve comparar estado sob lock. Nenhum token é copiado.

Native PostgreSQL17.9: run9 inicial PASS56.69ms; run10 reforçou Player antigo200 versus squadExtended novo0 e playerSearch semowner, PASS50.87ms; run11 adicionou dois backends operadores realmente esperando Lock e recebeu um único caso durável, PASS59.13ms,1teste/0FAIL/0SKIP,total171.22ms. PicoRSS136.38MiB,pressão1,swap3172.12MiBestável,disco10.19GiB. Todos servidores próprios encerrados, dados tmp preservados. Typecheck restrito542fontes0; ESLint/diff0. Revisão independente base/seleção semP1/P2; delta concorrência aguardava revisão neste registro.

Revisão final do delta concorrência recebida: sem P1/P2, controle positivo de contenção e persistência confirmados por inspeção. Encerra a ressalva de concorrência do registro, não prova recuperação futura.

Próximo bloco: protocolo de recuperação com tentativas perdidas preservadas/quarentenadas, medição única auditável por entidade e finalização que só reconcilia após recibo válido. Scope e workers ficam OFF até ativação separada. Não usar reset de flag ou bootstrap para contornar recibo desconhecido. Provar erro/timeout/429/lease/stale identity/replay/concorrência antes de QA. Nenhum deploy/build remoto consumido; QA/SHA limpo/fullsuite/proxy continuam pendentes.

## Exportador SQL e rota configurável — 17:36UTC

Manifesto desta fatia: `tests/native/touchline-central-exporter-sql.test.mts`, `lib/football-data/configured-fixture-authority-server.ts`, `app/api/internal/football-data/quota/route.ts`, `tests/touchline-central-authority-route.test.mts`, `.env.example`. CRITICAL: conectar autoridade explicitamente mantendo defaultOFF. Sem ativação, catálogo, login, credenciais reais ou deploy. Rollback somente delta local; não remover recibos/migrações.

Native run8 com PostgreSQL17.9/Unixsocket/data-8:1PASS0FAIL0SKIP90.28ms,suite210.99ms,picoRSS158.59MiB,pressão1,swap3244.12MiBestável,disco9.844GiB. Exportador real→HTTPguard→gateway/auth/store→SQL sob service_role. Duas páginas concluídas (ordem6eventos),3recibosownedqa-export incluindo429,consulta seguinteapenasadmitnegado,leasevazio/cooldownverdadeiro. HTTP/PostgREST/provider sintéticos; não comprova vinteclubes ou rede. Servidor paroufast,cluster/runtimepreservados. Tsc566fontes0 comallowJs/checkJsfalse,lint0/diff0/revisão semP1/P2.

RotaNext POST existe, runtimeNode/force-dynamic. Configuração `TOUCHLINE_QUOTA_AUTHORITY_*` é EXCLUSIVA do hostcentral, não deriva de SUPABASE_URL/serviceRole do site. Somente literaltruehabilita;demaisvalores503. WorkersJSON16KiB/1–32entradas/schemaexato+validadorescanônicos/credenciaisdistintas. Reconstrói a cada request;OFF/rotação afetam novasrequisições, não cancelaminflight (drainobrigatório).

22testesrota/server/gatewayPASS594.35ms;4finais143.32ms após acrescentar33workers/duplicados/tipos/envinválidos, comcontadoreszeroHTTP (não sóthrowmock). Tsc553fontes0/lint0/diff0; revisão independente semP1/P2. TesteimportaPOSTdiretamente, NÃO provaNextproxy/deploymentprotection/HTTPpublicado. Proxyfoiinspecionado: preservarpolíticaisolatedPreview/audit/offline/canonicalhost, semexceçãogeraladicionada. QA deve provar roteamento real e evitarredirect (transporte rejeita).

Nenhumenvreal ouconfig remota alterada. Não copiar chaveProductionparaQA. Próximo recoveryunknown/leaseperdido auditável; destino/workers/centralproject precisamgates, fullsuite/build/cleanSHA/QA. Gate nativoexportador é separado obrigatório, não ignorar porque globdefault nãoinclui tests/native.

## Exportador manual migrado localmente — 17:27UTC

CRITICAL: remover último HTTP direto executável identificado sem alterar catálogo. Manifesto `scripts/central-roster-page.mts`, exportador MJS, `lib/football-data/http.ts` (injeção fetchImpl interna, não enviada emRequestInit), teste roster. Helper reutiliza transporte/authworker/guard/httpenforcement canônicos. Cada página squad/PlayerTeam recebe UUID próprio, admit,GET e completion obrigatória antes de expor dados; um attempt, sem retry/cache/fallback. Includes/projeção/paginação preservados. Falha de recibo descarta sucessoHTTP. Quota ausente continua bloqueada pela política central real, não inferida no exporter.

Configuração read-only exige centraltrue/URLHTTPSrotafixa/token32+/scope/segredosdistintos, APIoriginexata semuserinfo/port/query/hash. Invocação: `node --conditions=react-server --experimental-strip-types scripts/export-sportmonks-twenty-club-rosters-readonly.mjs --check`; --write-new somente após autoridade/QA validada. Read-only refere-se ao catálogo, não aos recibos da autoridade. Sem flags Node o guardserver-only falha fechado; prova nativa de import/OFFzeroHTTP executada sem mocks de resolver.

53PASS0FAIL0SKIP3395.99ms regressõesHTTPretry/status/enforcement/centralworker/roster. Após sugestãorevisor, teste positivo inclui rate_limit válido e sequência6eventos para2páginas;7PASS86.55ms. Denial/OFF/429/completionfalse cobertos sem dados secretos. Typecheck3raízes560fontes0 com allowJs true/checkJsfalse para inferênciaMJS (tsconfig original não inclui os testes MJS); JSDoc ambiente explícito corrigiu inferênciaProcessEnv. ESLint0/diff0. Revisão semP1/P2implementação, prova reforçada. SQLreal doexportador aindaOPEN; não é provaQA/ativação ou suíteglobal. Rollback sódeltamanifesto, nenhuma limpeza.

Próximo ensaio nativo do exportador (clusteríndice8+), recuperação unknown/lease, rota/config/workers e gates remotos. Search-and-build-card é dormente410 comprovado, não religar. Nenhum dado remoto,APIreal,flag,commit/build/deploy realizado.

## Auditoria de consumidor dormente — após17:21UTC

SUPERSEDED a classificação de search-and-build-card como bypass executável atual. O POST autentica e retorna410 editorial incondicional antes de ler corpo/banco/provider. Teste em `tests/search-and-build-card-response-boundary.test.mts` transpila e executa módulo inteiro: autenticação fornecida 401/403 preservada; autorizado410private-no-store e contadoresbody/DB/fetchzero. Autenticador mockado, não prova sua implementação. Código legado permanece dormente e NÃO autorizado a reativar.

14focaisPASS0FAIL0SKIP402ms,tsc543fontes0,lint0,diff0,revisão independente semP1/P2. Nenhuma alteração de comportamento de produto; proposta raw descartada após evidência do gate. Exportador manual ainda executável porCLI --write-new, fetch direto porpágina: próxima migração exige central admit/complete porpágina, preservar envelope/paginação/redação, OFFsemHTTP, cancelamentoe429 duráveis. A configuração read-only atual não equivale a quota coordenada. Não ativar a integração nem executar exporter real antes desses gates.

## Runtime central nas factories — 17:21 UTC

CRITICAL ENGINEERING: migrar a construção usada pelo site para a autoridade única. Não objetivos: ativação, dados remotos, troca de conta, UI ou deploy. Rollback somente delta explícito, nunca restaurar fallback sem quota em ambiente ativo.

Manifesto: `central-provider-server.ts`, `provider-factory.ts`, `fixture-provider-server.ts`, `.env.example`, `tests/touchline-central-runtime-binding.test.mts`, `tests/native/touchline-central-runtime-sql.test.mts`, `tests/fixtures/legacy-fixture-provider.ts`, `tests/touchline-fixture-provider-sql.test.mts`. Factory histórica isolada no fixture de regressão, sem mudança nas asserções; TS7006 reparado com tipo explícito endpoint.

- Configuração worker server-only: CENTRAL_ENABLED somente true/false; scope obrigatório quando ON, destino/token explícitos. Sem fallback para RPC do banco de conteúdo. Singleton removido; novas construções honram OFF/rotação, instâncias já em execução exigem drenagem.
- Geral e factory dos cinco jobs passam pelo mesmo construtor central. Isso NÃO prova execução individual dos cinco corpos de jobs. Search-and-build-card e exportador manual ainda precisam migração; não ativar.
- 15 testes focais PASS/0FAIL/0SKIP,3104.60ms. Native run6 passou; revisor identificou falta de causalidade na segunda chamada, teste reforçado e run7 passou1/0/0,290.87ms (suite404.45ms),RSS162.8MiB,pressão1,swap3276.12MiBestável.
- Runtime factories → transporte → gateway/auth/store → SQL real sob service_role:429 persistido bloqueia segunda factory. Deltas exatos uma autoridade/umaRPC e último admit negado; zero segundoHTTP ao provider. HTTP central/PostgREST/provider simulados, NÃO rede real ou disponibilidade QA.
- Typecheck6raízes610fontes0diagnósticos;ESLint0;gitdiffcheck0;revisão independente sem achado remanescente após reparo. SQL servers temporários encerrados, runtime preservado.
- OFF significa leituras externas novas bloqueadas, não login desativado; implantar sem configuração pronta causaria indisponibilidade dessas leituras. Exigir cutover drenado e gates de configuração/QA; nenhuma flag real alterada.

QAHEAD permanece8cd7eae dirty, sem commit/fullsuite atual/build/deploy. Próximo: consumidores HTTP diretos, recuperação auditada unknown/lease perdido, rota autenticada/configuração e QA remota. Mission Completion Gate ainda aberto.

## SQL014 e concorrência reais comprovados localmente — 17:12 UTC

SUPERSEDED o bloqueio "014 não executado" dos registros históricos abaixo. PostgreSQL17.9 oficial/SHAconferido foi compilado serialmente em prefixprivado `/tmp/touchline-pg-native-sbvcel/install`. Previewpróprio3318 consumia1.42GiB; encerrado apenaslauncher96468TERM/filhosconfirmadosfora, preservandoSafari/Codex/sessões/caffeinate. Pressão1 e swap3.37GiB/disco9.58GiB apósalívio, semcleanup.

Ensaio014 real descobriu42702 na seleçãodeentity variável/coluna. Corrigido `policy.operation/policy.entity`, revisorconfirmou. Mesmo teste ampliado014 rodou em PostgreSQL17.9 nativo, via adapterpg8.16.3 somenteUnixsocketprivado0700, dataDir/db/user/listen/versionverificadosantesSQL. Resultado1PASS0FAIL0SKIP120.19ms,RSS135.80MiB. Bases013+014instaladasemclusterdescartável;23tuplas/floor/grants/429/reset/ACL/rollback/diagnóstico/retirement exercitados.

Novo `tests/native/touchline-central-quota-concurrency.test.mts` é gate nativo obrigatório separado do globdefault, semSKIP.3backendsdistintos, controlepositivo2workersbloqueados emlock, exatamenteumaadmissão,1grantconsumido,foreigncompletionpreservalease,identidadedurável/replayidem/alteradonegadosemnovachamada. Final1PASS0FAIL0SKIP59.53ms,picoRSS57.39MiB,swapestável. Provaentreconexões, NÃO reiníciodeservidor. Revisorrecomendouclearstatisticsnapshot/asserçõesgrant/foreignstate, incorporadosantesPASSfinal. Typecheckfocal546fontes0 apósreparobranchmorto no teste; ESLint/diff0. Nenhuma interfacevisual alterada.

Manifesto:014(aliasSQL),teste014(adapterselecionávelexplícito) e testeconcorrência. Harness/fontes/logs/driver/runtime/evidência no coordenador `outputs/card-review-20260921/native-postgres-qa-20261010.md`; todos serversparadosfast, nenhumTCPexposto. Rollback local somenteestesdeltas; não apagar runtime necessário nemárvorealheia. QAHEAD8cd7eae detacheddirty,semcommit/build/deploy/orçamentoconsumido; PRODUCTION NOT TOUCHED.

Próximo: recoveryunknown/leaseperdido auditável; migrar todosconsumidores; confirmarconfiguraçãoúnica eprovaQAremota. Fullsuite/build/candidatalimpa/QAcontinuaOPEN; sucessoSQLnativonãoéativação.

## Bootstrap expirado: ciclo auditável preparado — 17:01 UTC

CRITICAL ENGINEERING. Revisão independente identificou P2: o índice de grants não consumidos incluía expirados; admissão recusava a linha mas outro grant colidia para sempre. Corrigido em014 (ainda não aplicado): campos `cancelled_at/cancellation_evidence_ref`, constraints de expiração/não consumo, índice e admissão excluindo cancelados. Função privada invoker `retire_expired_bootstrap(uuid,text)` revogada inclusive de service_role; somente operador proprietário, lock scope→grant, evidência obrigatória, não sobrescreve aposentadoria. Não altera scope, cooldown, unknown, lease ou tentativa, não cria grant novo e não apaga história.

Manifesto desta fatia: `supabase/qa/014_touchline_central_entity_policy.sql`, `supabase/qa/diagnose_central_quota_readonly.sql`, `tests/touchline-central-entity-policy.test.mts` e registros. Diagnóstico separa aposentados/expirados pendentes/válidos. Teste preparado mantém grant expirado, comprova colisão com savepoint, aposentadoria explícita, preservação do scope/auditoria, ausência de permissão implícita, grant substituto separado, lease único e ACL. Node sintaxe, ESLint e diff-check exit0; revisor reinspecionou sem novo achado. **SQL não executado: nenhuma prova de instalação/concorrência/persistência atual.**

Alternativas locais verificadas: PostgreSQL não encontrado no PATH/locais comuns pelo agente; Docker CLI existe mas daemon não responde, não foi iniciado. Mac16:58 pressão2/swap6.13GiB/disco8.10GiB, sem repetir PGlite. Rollback somente este delta não aplicado, preservar árvore acumulada. QA HEAD detached8cd7eae, sem commit/deploy/build/alteração remota. Orçamento QA um build após gates, consumo0. UI/responsividade/browser não tocados; segurança revisão estática somente; fullsuite/build/QA/persistência/concorrência continuam abertos. PRODUCTION NOT TOUCHED.

## Experimento de menor custo WASM — interrompido, não é SQL PASS

Probe próprio do coordenador `outputs/card-review-20260921/probe-pglite-low-memory-20261010.mjs`: init+SELECT1 in-memory, sem rede. Node heap128MiB; WASM máximo4096páginas(256MiB por memória, crescimento acima testado e rejeitado), compilação1/Liftoff-only/semTierUp, watchdogRSS450MiB50ms/saúde200ms/30s. Estratégia distinta do ensaio padrão, mas NÃO hardcapRSSglobal. Única execução exit2/SIGKILL do filho ao medir511.22MiB, antes de qualquer resultadoSELECT1. Swap6201.38→6265.62MiB(+64.24),pressão2/disco7.734GiBestáveis. Nenhumapp/preview/arquivoafetado. Não repetir nem chamarSQL014executado. Resultado reduz incerteza:mesmo estratégia limitada excede o orçamento atual; exige capacidade segura/alternativa real. AvançouB02independente sem cargaSQL.

## Worker central e prova integrada — 10 outubro, 16:47 UTC

MISSION: CRITICAL ENGINEERING local. Manifesto desta fatia: novos `lib/football-data/central-provider-server.ts` e `tests/touchline-central-provider.test.mts`; delta restrito em `providers/sportmonks.ts` (namespace de cache) e `fixture-authority-gateway-server.ts` (propriedade explícita em Rejected, mesmo comportamento, compatível com Node strip-only). Preservadas as demais alterações acumuladas.

FUNCTIONAL: configuração explícita OFF cria binding inválido permanente e retorna falha antes de HTTP. ON compõe provider real→guard→HTTP→gateway/auth/parser/store→RPC central. Só os dois destinos HTTP são simulados; a identidade é real do módulo, não um stub de authenticator. Credenciais de worker, banco e Sportmonks são distintas e ficam nos respectivos destinos. Nenhum SupabaseClient de conteúdo ou fallback está presente na nova factory.

CACHE: digest SHA256 de versão de política, URL canônica, scope e token do worker separa cache central de legado e de outra configuração. Nenhum segredo bruto é usado no cache. Namespace opcional hex64 é validado/capturado pelo provider. Alteração de política central mantendo URL/token exige deliberadamente incrementar `touchline-central-policy-v1`; cache não comprova persistência de quota nem substitui admissão para novo HTTP.

TESTS: primeiro ensaio apontou parameter-property não suportada pelo runner strip-only; trocada por propriedade explícita sem mudar semântica. Em seguida 46 PASS/0 FAIL/0 SKIP em seis arquivos (1362ms), incluindo cache legado, enforcement, gateway e servidor central. Revisão independente sem P1/P2 propôs negativos adicionais: resultado final do novo arquivo 10 PASS/0 FAIL/0 SKIP,3002.78ms. Inclui OFF, ordem admit/provider/complete, recusa, timeout real do transporte2500ms sem Sportmonks/retry, completion negada sem cache, 429 com estado simulado compartilhado, cache legado positivo e recusa central, mudança de URL/token/scope, namespace inválido e mutação de configuração. Teste429 prova ordem/composição, NÃO durabilidade SQL ou concorrência global.

GATES: typecheck restrito com tsconfig real/next-env, três raízes/562 fontes transitivas/0 diagnósticos; ESLint focal0/diff0. Revisão independente executada por leitura, não teste remoto. Ferramentas efetivas: fonte, apply_patch, Node serial192MiB, TS, ESLint, diff e revisor. Não houve API real, SQL, navegador, build ou exclusão. VISUAL/RESPONSIVE/ACCESSIBILITY: NA sem UI; BROWSER: não executado. QA COMMIT: HEAD8cd7eae mais árvore acumulada, sem commit limpo. QA DEPLOYMENT: nenhum; orçamento um Git-native após gates, zero consumido nesta fatia; alias não revalidado. PRODUCTION: NOT TOUCHED.

OPEN: factory geral e cinco jobs protegidos ainda usam caminho legado; não marcar migração concluída. `touchline-fixture-provider-sql.test.mts` continua prova legada (saldo100, semfloor500/013/014), não foi trocado por mocks. Próximo ensaio central013/014 com workers/bootstrap reais e recuperação auditada, depois migrar callers sem fallback, configuração única e gates QA. RAM2 continua sem margem comprovada para PGlite1.1GiB. Rollback só novos arquivos/deltas desta fatia, nunca reset da árvore.

## Composição explícita implementada — 10 outubro, 16:42 UTC

MISSION/SCOPE: CRITICAL ENGINEERING local, dois arquivos novos `lib/football-data/fixture-authority-server.ts` e `tests/touchline-fixture-authority-server.test.mts`. Configuração única cria auth→gateway→store→RPC central; OFF por padrão funciona sem segredo. Não lê env, não publica rota, não ativa sync nem escolhe projeto automaticamente. Workers QA/Production compartilham scope/destino, identidade derivada apenas do segredo próprio. Chave central fica somente no host; igualdade com qualquer bearer de worker é recusada antes da construção.

FUNCTIONAL/SECURITY: oito testes com grafo real e HTTP sintético: OFF, admissão QA/Production, forja/scope rejeitados antes do banco, recibo inválido/erro sem retry, completion recusada preservada, cancelamento propagado até fetch e imutabilidade da configuração. Revisão independente identificou P2 reuso de chave; corrigido, teste zeroHTTP para ambos workers, reinspeção sem achados. Não constitui prova de ownership SQL remoto.

TESTS: 8 PASS/0 FAIL/0 SKIP, 387.857666ms. Typecheck restrito tsconfig real, duas raízes (next-env e composição), 550 fontes transitivas, zero diagnósticos após reparo. ESLint e diff-check exit0. Não chamar isso de full-app typecheck ou suíte completa. Ferramentas efetivas: leitura de fonte, apply_patch, Node teste com rede proibida, compilador TS, ESLint, diff e revisão independente.

QA BRANCH/COMMIT: HEAD detached8cd7eae com alterações acumuladas, sem commit limpo. QA DEPLOYMENT: não executado. REMOTE BUILD BUDGET/CONSUMED: um build Git nativo autorizado após gates, zero consumido nesta fatia. STABLE QA URL: não revalidada nesta fatia. BUILD/fullsuite/SQL014/concorrência/recuperação unknown/consumidores completos/configuração real/QA persistência: pendentes. VISUAL/RESPONSIVE/ACCESSIBILITY/BROWSER: não aplicáveis ao módulo sem UI, não foi emitido PASS de tela. OBSERVABILITY: erros genéricos, sem segredo em resposta. PRODUCTION: NOT TOUCHED. Rollback local: remover apenas os dois arquivos novos desta fatia e seus registros, sem reset da árvore.

## Verificação conjunta local — 10 outubro, 16:39 UTC

Nove testes de autoridade central/provider executados serialmente com heap JS192MiB: 62 PASS, 0 FAIL, 0 SKIP, 1765ms. Typecheck restrito dos oito módulos e next-env usando as opções do tsconfig real: 560 fontes transitivas, zero diagnósticos. A tentativa CLI inicial sem aliases/Next RequestInit não era um verificador válido; substituída pela configuração real, sem alteração de produto. Esta evidência não cobre a aplicação inteira, SQL014, persistência central real ou deploy. Próxima composição mantém tudo OFF e sem exposição de rota até os gates.

## Diagnóstico operacional preparado — não é recuperação/ativação

`supabase/qa/diagnose_central_quota_readonly.sql` preparado para o operador da autoridade após013/014. Exige scope aprovado existente; transação REPEATABLE READ READ ONLY, timeouts5s/1s, rollback. Mostra flags independentes, lease presente/expirado, tentativas incompletas/proprietários, último recibo por entidade com a mesma ordem de014 e grants válidos. Não expõe tokens/segredos/observações completas, não concede quota nem remove leases. Revisão independente semP1/P2; isolamento reforçado para evitar consultas de snapshots diferentes.

Ensaio014 ampliado para scope não preenchido, relatório de mismatch real, ausência de campos secretos e preservação de estado. Apenas sintaxeNode/diff verificados; SQL deste diagnóstico NÃOexecutado. Interpretação:scopeOFF exige revisar implantação/configuração; leasependente exige conciliar tentativa original, nunca presumir que expiração libera consumo; ownerrevogado exige investigação de segurança; blocked_unknown exige evidência confiável e recuperação auditada separada; saldo<=500 respeita reserva; resetconhecido só permite medição serial já prevista014. Um grant de bootstrap não contorna unknown nem transforma erro503 em saldo conhecido. Não editar recibos históricos para reabrir serviço.

Avaliação16:30:44doagenteMac identificou runtimepróprio3318, RSS17.2MiB. Não foi encerrado: economia observada pequena não resolve picoPGlite1.1GiB; sessões e preview preservadas. Nenhuma limpeza/banco/API/deploy nesta fatia. Próximo ensaio014 apenas com margem de memória; recuperação executável e integração ainda pendentes.

## Ensaio SQL013 executado, orçamento de memória excedido

10outubro ~16:29UTC: após reavaliação do agenteMac, executado somente `touchline-central-quota-ownership.test.mts` com PGlite descartável em memória, Nodeheap192MiB, `--test-isolation=none`, concorrência1, teste25s/watchdog30s. Runtime explícito `/private/tmp/touchline-sql-runtime.xCdJ7Y/node_modules/@electric-sql/pglite/dist/index.js`. Nenhuma conexão de banco remoto, escrita de conteúdo ou API.

**Resultado funcional:1PASS/0FAIL/0SKIP,1206ms**, processo do teste exit0. SQL013 efetivamente instalado e exercitado: drain antesDDL, rollback da instalação e ownership, owner nulo histórico, workers/ambientes/revogação/replay, ACL e wrappers service_role. Não prova concorrência PostgreSQL multiconexão nem SQL014.

**Resultado operacional:REPROVADO**, watchdog agregado exit2 por RSS450MiB excedido; pico amostrado1109.05MiB. Swap5985.69→6571.75MiB. O teste terminou durante a reação do watchdog, sem processo remanescente. Limite do heapJS NÃO limita WASM/RSS e amostragem200ms NÃO é hardcap. Não usar este runner como garantia de segurança de memória.

Agente16:29:07pressão2/swap6499.75MiB/disco7.12GiB confirmou recuperação apenas parcial, nenhum ensaio ativo; SQL014 não iniciado. Não repetir imediatamente, aumentar teto ou fazer limpeza destrutiva para forçar PASS. Inspeção do runtime mostra memóriaWASM inicial128MiB e uma instância auxiliar de initdb antes da principal; pico não pode ser deduzido do heap. PostgreSQL nativo não encontrado no PATH. Próximo: reduzir/provar consumo em ambiente com margem ou aguardar recuperação; SQL014, recuperaçãounknown, multiconexão, integração/configuração eQA permanecem gates abertos.

## Transporte exclusivo para o banco central — preparado localmente

CRITICAL B01: `lib/football-data/fixture-authority-central-rpc-server.ts` e `tests/touchline-fixture-authority-central-rpc.test.mts`. Objetivo: implementar a dependência RPC do store existente, não ativar serviço. Destino derivado de projectRef explícito validado, HTTPS Supabase, apenas wrappers centrais admit/complete, scope fixo, headers server-only, redirect:error, no-store, sem retry/fallback/descoberta de env. Request/response8KiB, deadline e abort inclusive no body; resposta tardia cancelada. OFF por padrão. Credencial central pertence somente ao host da autoridade, nunca ao worker ou ao browser. Configuração real/credencial/ACL ainda não comprovadas.

Aceite local executado:16focais adapter+store PASS/0FAIL/0SKIP589.04ms, serialheap192MiB; composição dos dois módulos reais com HTTP sintético, recusa de campo inesperado, resposta/stream tardios e casos sem rede. ESLint0. Primeiro teste de construção falhou porque faltava fetch no sandbox; corrigido harness com fetch que sempre recusa rede, não relaxado oráculo. Revisão independente semP1/P2; sugestões de timeout no body/cancelamento tardio incluídas e testadas.

Rollback restrito aos dois novos arquivos se necessário, preservando demais deltas. Não conectado a gateway/env/factory; sem banco/API/deploy. SQL013/014, recuperação de estado unknown, exclusividade de todos consumidores, typecheck/fullsuite/build/QA continuam pendentes. Mac16:23UTCpressão2/swap5.66GiB/disco8.05GiB mantém ensaioSQL bloqueado operacionalmente; agenteSeptember acompanha sem remoção. Próxima fatia é recuperação auditável/ensaioSQL assim que capacidade permitir, não ativação automática.

## Checkpoint: política central 014 preparada, ainda sem execução SQL

Reinspeção independente final confirmou os dois reparos (delimitador e recibo efetivamente selecionado) sem novo achado no delta. A conclusão é estática; execução SQL continua pendente.

`supabase/qa/014_touchline_central_entity_policy.sql` sucede 013 somente na autoridade central e exige scopes desabilitados/sem tentativas pendentes. Não altera migrações aplicadas nem instala automaticamente nos bancos de conteúdo. Contrato privado de 23 tuplas é usado por admissão e conclusão; wrappers de ownership de 013 continuam sendo a única interface.

Regras preparadas:

- Consultar o último recibo **da entidade**, não apenas do endpoint: busca de jogador e squad estendido compartilham Player. Uma falha recente não permite voltar a um sucesso antigo.
- Manter a reserva mínima de 500 chamadas para cada entidade; o lease da conta serializa todas as tentativas e retries até registro durável. Não há orçamento independente QA/produção.
- Sem histórico owned, negar por padrão. Inicialização exige autorização operacional registrada em grant privado de uso único, validade máxima de cinco minutos; script não cria grants, scopes ou workers. Grant é consumido na mesma transação que lease e ownership, não injeta saldo fictício.
- Após um reset conhecido, esperar margem de cinco segundos e permitir somente uma consulta de medição sob lease. O saldo novo vem da resposta; não atribuir 2.000 automaticamente. Isso depende de todos os consumidores migrarem para a autoridade, relógios verificados e observações reais.
- Entidade divergente, saldo/reset ausente, relógio fora da janela e conclusão tardia mantêm bloqueio. Recuperação de unknown/owner revogado é operação separada ainda pendente, não resolvida com grant de bootstrap.

`tests/touchline-central-entity-policy.test.mts` prepara ensaio real PGlite para instalação/rollback, equivalência das23tuplas comTypeScript, floor500/501 compartilhado, bootstrap ausente/futuro/expirado/TTL, rollback de grant quando ownership falha, reset medido,429/cooldown, relógio, entidade incerta e ACL. Testes de reset selecionam explicitamente o recibo-alvo pela mesma ordenação da política; não aceitam saldo antigo como prova.

**Evidência atual:** sintaxe do teste Node `--check` e ESLint exit0; `git diff --check` exit0. Revisão estática detectou P1 delimitadorSQL e P2 prova de reset; corrigidos localmente. **SQL ainda não executado**, não é PASS de instalação, concorrência ou recuperação. Mac16:00UTC pressão2/swap5,68GiB/disco8,32GiB impede PGlite/build nesta rodada. Nenhuma chamada Sportmonks, alteração remota, ativação ou deploy.

## Checkpoint: cobertura do adaptador, 10 outubro — local somente

SUPERSEDED a limitação de 11 tuplas **no TypeScript**: contrato e classificador agora cobrem 23 endpoints emitidos pelo adaptador. SQL continua com 11; isso bloqueia conexão/ativação das novas famílias até migração e ensaio, não é autorização implícita. Factories legadas e HTTP direto ainda precisam ser conectados à autoridade central.

- Mapeamentos adicionais: Player (id/busca e pool compartilhado com squadExtended), Team, Coach, Standing, Transfer (jogador/clube), listas League/Season, Resource e Enrichment. Nome de entidade não é prova de saldo nem de reserva compartilhada implementada.
- Fontes primárias: [limites por entidade](https://docs.sportmonks.com/v3/api/rate-limit), exemplos oficiais [Standing por temporada](https://www.postman.com/sportmonks-api/sportmonks-api-s/request/fvdp312/standings-by-season-id), [Transfer](https://www.postman.com/sportmonks-api/sportmonks-api-s/documentation/1fsq8yq/api3?entity=request-11949411-602bf7ae-5c1b-4a69-9537-53374460f4a9), [Coach](https://www.postman.com/sportmonks-api/sportmonks-api-s/documentation/1fsq8yq/api3?entity=request-11949411-7dd00a0f-cefb-4603-b65d-d3a97bd6ae14) e [Enrichment](https://www.postman.com/sportmonks-api/sportmonks-api-s/documentation/1fsq8yq/api3?entity=request-11949411-b04e8605-91f4-4fcc-ac94-d2bf985694f1). Os valores de quota desses exemplos NÃO são os da conta TouchLine.
- Classificação rejeita URL/origem, query/hash, whitespace, escapes inválidos, separadores/travessia e IDs não canônicos; busca aceita nomes Unicode codificados. Preserva datas reais e intervalo ordenado.
- Prova executada com provider real e HTTP sintético: cada nova família exige admissão, observa a entidade e termina o recibo; recibo recusado não vira sucesso/cache. Cache legado aquecido não contorna admissão Team. `my/resources` e `my/enrichments` seguem na raiz `/v3/my`, não `/football/my`.
- Comando: `node --max-old-space-size=192 --experimental-strip-types --test --test-concurrency=1 tests/sportmonks-prequery-endpoints.test.mts tests/sportmonks-foundation-prequery.test.mts tests/touchline-fixture-authority-command.test.mts tests/sportmonks-fixture-authority.test.mts`: **25 PASS, 0 FAIL, 0 SKIP, 666.86 ms**. ESLint focal exit0; diff-check0. Revisão independente estática do classificador/provider sem P1/P2; não equivale à revisão SQL.
- Sem API real, alteração remota ou deploy. Mac às15:53UTC ainda pressão2, portanto PGlite/fullsuite/build não executados. Próximo: política SQL por entidade e cobertura das novas tuplas; recuperação/bootstrap, concorrência, configuração e QA permanecem obrigatórios.

## Decisão e limite de autorização

Em 10 outubro, o owner confirmou: “Sim, preparar integração; ativar só após QA”. A assinatura é compartilhada; Sportmonks permanece a única fonte externa. Este documento prepara a integração, não habilita workers, scopes, migrations remotas, credenciais ou Production. Deploy QA depende dos gates da candidata. Production continua bloqueada até validação QA e preflight específico.

## Implementação preparatória 14:53 UTC — transporte, não gateway

Adicionados `lib/football-data/fixture-authority-http-server.ts` e `tests/touchline-fixture-authority-http.test.mts`. Módulo server-only recebe configuração explicitamente, sem ler env nem conectar factories. Endpoint HTTPS fixado na construção, sem query/credenciais na URL, redirect:error, cache:no-store, cookies omitidos. Somente admit/complete, scope conferido, token exclusivo no header, request/response <=8KiB, prazo máximo5s. Timeout/abort libera o chamador mesmo se transporte injetado ignorar sinal; isso não garante encerrar implementação externa que deliberadamente ignore cancelamento. Erros sempre sanitizados, sem retry/fallback.

12 testes seriais PASS (6 novos+6 adapter), incluindo adapter real com tokenUUID/recibo e rejeição de token inválido, resposta tardia, corpo pendurado,401/429/503, payload excessivo e cancelamento. ESLint focal exit0 após corrigir tipo explícito do harness; diffcheck0. Revisão independente semP1/P2 no escopo do transporte. Não é prova de autorização HTTP, concorrência global nem idempotência remota. TypeScript/fullsuite/build desta nova fatia pendentes por pressãoRAM2; a suíte4918verde é o checkpoint ANTERIOR a estes dois arquivos novos.

Próximo bloco: gateway autenticado, identidade/scope/recibo vinculados pelo servidor e armazenamento único, testes de dois workers e consumidores legados. Não conectar esse transporte à factory antes de provar essas fronteiras. URL/token usados nos testes são sintéticos; nenhum destino/segredo real configurado e nenhuma chamada externa.

Gate: CRITICAL ENGINEERING local, HEADdetached8cd7eae/árvoresuja preservada; sem nova branch/commit/deployment, orçamento remoto1QAapósgates/consumido0; funcionallocalparcial, visual/responsivo/a11ynãoalterados, browsernãonecessário para móduloisolado, segurança revisada limitada,12focaisPASS/lint0/diff0,buildnãoexecutado. Production NOT TOUCHED. Rollback somente os dois arquivos novos e seus registros; não resetar alterações acumuladas.

## Defeito que precisa ser eliminado

### Entrada HTTP preparada e composição local verificada

`fixture-authority-gateway-server.ts` cria handler não exposto em rota, OFF por padrão. POST/path fechado, autenticação antes de ler body, JSONUTF8semcompressão,8KiB debytesreais,deadline/abort até5s,erros genéricos/respostas fechadas/no-store. Cancela stream sem aguardar cancel hook não cooperativo. `execute` recebe somente comando do parser com identidade autenticada; não expõe RPC genérica nem lê env automaticamente.

`touchline-fixture-authority-gateway.test.mts`:10PASS0FAIL0SKIP613ms,Nodeheap192MiB/concurrency1,semDB/browser/provider. Usa autenticação/parser/store/transporteHTTP reais do projeto com RPC final sintética; prova zeroRPC semauth, bodyexcessivo/lento/encoding/schema,aborto durantebody/execute,deny e malformedresponse sem vazamento. Revisão independente estática semP1/P2; negativos sugeridos incorporados. ESLintfocal0/diff0. Não é provaSQL/concorrência nemHTTP publicado; não há rota/configuração/destino ativados.

Próximo: executarSQL013 em banco descartável quandoRAMnormal, provar concorrência/recovery, confirmar destino/política dequota da autoridade, integrar clientfactory com todos consumidores protegidos e obterQAremoto. Nenhuma RPClegada deve virar fallback de produção.

### Adaptador do gateway para RPC central — prova unitária local

`fixture-authority-store-server.ts` recebe exclusivamente comandos internos já autenticados/validados e RPC explicitamente injetada da base central. Traduz para as duas novas funções `touchline_central_quota_admit/complete`, incluindo identidade worker/environment; nenhum nome deRPC/destino é recebido do payload. Ativação explícita, scope fixo, erros sanitizados, resposta fechada e cancelamento/prazo até5s. Nunca repete admissão perdida nem faz fallback para base do worker; resposta perdida pode ter reservado quota e exige reconciliação durável.

Seis testes focais passaram com Nodeheap192MiB/concurrency1 em349ms, semDB/browser/provider. Cobrem campos/identidade,negação,defaultOFF,scope,pré-abort,erroDB,shape fechado,deadline/late response e cancelamento. Diffcheck0; revisãoindependente solicitada. Essa prova não valida implementaçãoSQL, factory, rota, configuração central nemQA. SQLPGlite/fullsuite/build continuam pendentes porRAM2; somente ensaio unitário pequeno foi executado.

Revisão independente do store concluída sem novosP1/P2 no contrato autenticado. Acrescentados positivos deallowed:false/persisted:true,negação deextra fields e limitesdeconfig:8focaisPASS0FAIL0SKIP661ms. ESLintfocalexit0,diff0. Fluxoauth→parser→store integrado e gatewayHTTP permanecem próximos gates; resultadoSQL/concorrênciaremota não inferidos.

### Preparação local do ownership durável — 10 outubro

Script manual `supabase/qa/013_touchline_central_quota_ownership.sql` preparado exclusivamente para a futura base central selecionada, não para aplicação automática nas bases de conteúdo. Exige drain, recuperação e gates antes de instalar. Conserva a lógica existente em schema privado, revoga acesso às duas RPCs antigas inclusive service_role e às tabelas operacionais. Registro privado de workers vem vazio/desabilitado por padrão; tentativas históricas conservam owner nulo, não são atribuídas automaticamente.

Wrappers usam identidade fornecida pelo gateway autenticado, validam worker/ambiente/scope persistidos, bloqueiam worker→scope→tentativa e gravam owner dentro da mesma transação da admissão. Falha no vínculo levanta exceção e deve reverter lease e tentativa. Conclusão verifica owner antes de executar política ou replay. Somente o gateway terá credencial privilegiada; workers de QA/produção não recebem acesso direto a essa base.

Ensaio real preparado em `tests/touchline-central-quota-ownership.test.mts`: rollback final da instalação, identidade inválida/desabilitada, lease compartilhado, conclusão/replay cruzados, falha injetada no vínculo e revogação de privilégios. Sintaxe TypeScript e diff-check passaram; **SQL ainda NÃO executado** por pressãoRAM2. Revisão independente solicitada. O ensaio de único runtime tampouco prova concorrência multiconexão remota, que continua gate separado. Nenhum destino, worker, segredo ou banco remoto configurado. Não conectar factories enquanto persistência/gateway/integracão não forem comprovados.

Revisão estática encontrou P2: o primeiro script não impunha drain e poderia deixar recibo legado sem finalização após retirar as RPCs antigas. Corrigido com locks de tabela scope→attempt no início e aborto antes deDDL se qualquer scope estiver enabled, tiver active_token ou houver tentativa não concluída. Testes preparados agora cobrem instalação recusada preservando funções/dados, owner históricoNULL, parâmetrosNULL, revogação durante lease, mutação direta e ACL de ambas operações. Nenhum desses testes SQL foi executado ainda.

Recuperação de worker revogado com lease pendente: manter scope fechado; não limpar lease, reatribuir owner, presumir expiração como saldo ou reativar automaticamente. Operador deve primeiro avaliar se há credencial comprometida e obter observação confiável da tentativa. Rotação autenticada preservando a identidade original pode permitir conclusão somente após revisão e trilha de auditoria; sem essa prova, recuperação administrativa separada permanece pendente e ativação é NO-GO. O teste que reabilita worker faz isso só no banco descartável, não é comportamento do produto.

Reinspeção estática confirmou reparoP2 sem novosP1/P2 nos deltas. Acrescentado controle positivo de conclusão sob service_role, além da admissão já coberta. Ensaio SQL real e concorrência multiconexão continuam pendentes; não declarar ownership operacional validado.

### Continuação local — identidade e comando, 10 outubro

Manifesto adicional: `lib/football-data/fixture-authority-worker-auth-server.ts`, `lib/football-data/fixture-authority-command-server.ts`, `tests/touchline-fixture-authority-worker-auth.test.mts`, `tests/touchline-fixture-authority-command.test.mts`. Nenhuma rota foi criada ou configurada; estes módulos ainda não atendem tráfego do site. Isso não desliga o login existente.

Autenticador: ativação explícita, tokens distintos comparados por SHA256/timingSafeEqual, principal imutável resolvido no servidor. Parser: só admit/complete, campos fechados, conta igual à identidade autenticada, limites numéricos, observação vinculada a request/attempt/operação e preservação de entidade desconhecida para bloqueio pela autoridade. Resultado carrega worker/ambiente obrigatoriamente; NÃO verifica propriedade de recibo sem banco. Revisor encontrou UUID uppercase e ano ISO expandido aceitos pelo parser mas incompatíveis com SQL; agora rejeitados antes de admissão.

Comando executado: `node --test --test-concurrency=1 tests/touchline-fixture-authority-command.test.mts tests/touchline-fixture-authority-worker-auth.test.mts tests/touchline-fixture-authority-http.test.mts tests/sportmonks-fixture-authority.test.mts`:25PASS/0FAIL/0SKIP,1777ms. ESLint focal0 e diffcheck0; reinspeção independente sem novo achado. Typecheck completo, suíte completa, build e integração SQL desta fatia permanecem pendentes, não herdados do baseline anterior.

Próximo passo técnico exato: persistência deve vincular atomicamente worker+ambiente ao recibo sob o mesmo lock de account_scope usado por admit/complete. A RPC atual não tem esse vínculo; não encaminhar chamadas autenticadas diretamente a ela e não usar Map em memória como controle durável. Depois, fronteira HTTP com corpo limitado/auth primeiro, destino central explícito, ensaio concorrente QA/Production sintéticos e implantação QA pelos gates. Nenhuma escrita remota foi feita.

Gate da fatia: CRITICAL ENGINEERING; ferramentas shell/apply_patch/test runner/ESLint e revisão independente executadas; browser/visual/a11y não aplicáveis a módulos isolados. Segurança local parcial, persistência/remoto NÃO provados. QA branch/SHA/deployment novos inexistentes;1build QA autorizado apósgates/0consumido; rollback apenas manifestoadicional, sem reset de alterações. PRODUCTION NOT TOUCHED. Missão geral em andamento.

`createGuardedFixtureProvider` executa as RPCs de admissão/recibo usando o `admin` da base chamadora. O mesmo nome de account scope em duas bases não compartilha locks nem recibos. Logo configurar esse nome em QA e Production não resolve concorrência global.

A abstração `FixtureAuthorityCall` já permite separar transporte da implementação Sportmonks. Reaproveitar validação de UUID, endpoint, observação, cancelamento e recibo, sem duplicar a lógica. As migrations atuais negam admissão desconhecida e expiração sem recibo; preservar essa proteção. Os consumidores sem guarda também precisam entrar no inventário antes da ativação.

## Contrato de arquitetura proposto

1. Uma autoridade durável por assinatura; apenas ela possui a base de locks/recibos que regula as chamadas. O destino não pode ser inferido da base de conteúdo do worker.
2. QA e Production usam identidades de worker distintas, revogáveis e restritas. Nenhuma chave service-role de Production entra no Preview. O worker não escolhe sua conta, ambiente ou política no corpo da requisição; a autoridade os resolve pela identidade autenticada.
3. Preferir uma fronteira de servidor dedicada com operações fechadas de admissão/conclusão, não um proxy RPC genérico. Validar tamanho, esquema, prazo, endpoint permitido, identidade do recibo e propriedade da tentativa. Não aceitar URL de provider fornecida pelo cliente.
4. Um único registro global serializa cada tentativa HTTP, inclusive retry; cache hit não consome nova tentativa. Estado desconhecido, indisponibilidade ou prazo vencido bloqueiam novas chamadas, sem fallback para orçamento local nem provider desprotegido.
5. A reserva de QA deve impedir que ensaios consumam a disponibilidade da operação principal. Definir limites conservadores após verificar a unidade/janela real do plano; “2.000 chamadas” isoladamente não prova orçamento diário, horário ou por entidade. Não inventar essa unidade.
6. Credenciais e receipts ficam exclusivamente no servidor. Logs mostram worker, request ID, endpoint, estado, timestamps e categoria de falha; nunca token, URL com segredo ou payload de conta.
7. Provider continua responsável por dados externos; pontos, preço dos cards, planos e UUIDs internos não mudam. Futura API usa contrato/adaptador e ensaio próprios, sem mistura automática de fontes.

## Inventário obrigatório antes de habilitar

### Evidência documental e lacunas de cobertura — 10 outubro

Consulta oficial aberta: https://docs.sportmonks.com/v3/api/rate-limit (seçõesplanos,entidades eMySportmonks). Starter documentado com2.000chamadas porentidade/hora,janela iniciada pela primeira requisição; endpoints da mesma entidade compartilham quota. https://www.sportmonks.com/glossary/football-api-rate-limits-design/ confirma esse modelo. Isso resolve a unidade documental, NÃOprova saldo atual, extras contratados ou recibos de execução desta conta. Referências antigas com3.000genéricos não substituem o plano atual. Última consulta não chamou aAPI nem consumiu quota daassinatura.

A expressão autoridade global significa coordenação única entreambientes para cada pooldeentidade, não um único contador faturável para todasasentidades. A leaseglobalatual é serialização conservadora, não comprova o orçamento completo porentidade. Valores remaining/reset/requested_entity da resposta real continuam sendo a evidência operacional; não abrir saldo após relógio presumido ou erro semquota.

Leitura atual confirmou `fixtureEndpoint` cobre só11tuplas. Estão fora da allowlist de admissão:players/search,players/id,teams/id,coaches/id,standings/seasons,transfers/players,transfers/teams,seasons/leagues,listasseasons/leagues,my/resources,my/enrichments. A tabela oficial documentaPlayer/Team/Coach/League/Season eResourcepararesources; osdemais precisamdetupla comprovada. NÃOtrocar factorylegadapor guard e declarar integração completa: o guard atual negaria essas funcionalidades.

Entradas adicionais confirmadas:
- `app/api/football-data/validate/route.ts`: GETcomownersession/validationsecret →sync-engine→factorylegada; a validação consomeprovider, não éconsulta gratuita.
- `app/api/football-data/sync-starter/route.ts`: capacidades e qa_country_sync usamfactorylegada, embora outros scopes usemguard. Authdeowner/secret e restriçãoQA não equivalem àcoordenaçãoquota.
- `app/api/players/search-and-build-card/route.ts`: `sportMonksGet` fazfetchdiretoplayers/id,players/search,teams/id,até3tentativas; cadaHTTPprecisaadmissão, não sóprimeiratentativa. Mantidoinalterado nesta auditoria para não fingirguard incompleto.
- `lib/touchlineArena/player-profile-official.ts` e `provider-diagnostic/route.ts`: enriquecimento/diagnóstico continuamnafactorylegada.

Ferramentas Supabase/SQL e Vercel não estavam disponíveis no inventário desta rodada; nenhuma configuração remota foi lida ou alterada. Não reaproveitar leitura histórica como confirmação atual decron/env/quota. Próximo: cobertura porentidade no provider/SQL e inventário deexecução, antesdeativação conjunta. Planodeinstalação central ainda não aplicado.

Revisão independente não encontrou P0/P1/P2 no contrato preparatório. Alternativa a avaliar antes de implementar o transporte: um único serviço de ingestão conserva o token Sportmonks e atende ambos os ambientes por snapshots versionados; ensaios QA com dados atuais passam pelo mesmo serviço com reserva própria. Isso reduz credenciais e protocolo distribuído, mas replay deve ser rotulado e nunca servir como prova de atualização real. A escolha final deve preservar separação dos dados de usuário e não criar nova infraestrutura paga sem autorização.

Decisões de operação ainda necessárias: residência/disponibilidade da autoridade, unidade real de quota por grupo de endpoints e procedimento autenticado de recuperação de tentativa sem recibo. Expiração sozinha não libera uma tentativa de consumo desconhecido.

- Guardados hoje: live-sync, fixture-schedule, starter, golden-boot-refresh, qa-twenty-club-roster.
- Revisar rotas pelo factory genérico: capability-sync, provider-diagnostic, sync-engine, qa-country-sync e player-profile-official.
- Revisar HTTP direto: search-and-build-card.
- Incluir ferramenta manual `scripts/export-sportmonks-twenty-club-rosters-readonly.mjs`: o gate read-only evita escrita de produto, mas a paginação faz chamadas Sportmonks e consome a mesma assinatura. Não executada nesta auditoria.
- Presença no código não significa execução ativa. Para cada entrada, registrar scheduler/rota/identidade, endpoints, política de cache/retry, ambiente, frequência e gate. Nenhum consumidor ativo pode ficar fora da autoridade.
- Confirmado no construtor: `new SportmonksFootballProvider()` sem opções usa comportamento legado sem guarda; somente binding explicitamente inválido produz `null` e bloqueio. Não confundir a existência do adapter com proteção de todas as chamadas.

### Evidência por ponto de entrada

| Consumidor | Arquivo | Integração necessária |
|---|---|---|
| Live | `lib/football-data/live-sync.ts` | Trocar autoridade local pela compartilhada, preservar finally/recibos e lock do writer. |
| Agenda | `lib/football-data/fixture-schedule-sync.ts` | Mesma autoridade, sem segundo orçamento independente. |
| Starter | `lib/football-data/starter-sync.ts` | Mesma autoridade e orçamento do ensaio. |
| Golden Boot | `app/api/touchline-awards/golden-boot/refresh/route.ts` | Preservar gate e snapshot; quotas de entidades precisam de confirmação. |
| Elencos QA | `lib/football-data/qa-twenty-club-roster-sync.ts` | Guardar os dois tipos de squad; sem corrida com ferramenta manual. |
| Diagnóstico | `app/api/football-data/provider-diagnostic/route.ts` | Múltiplas factories legadas; diagnóstico também deve consumir quota controlada. |
| Perfil oficial | `lib/touchlineArena/player-profile-official.ts` | Identidade/transferências usam factory legada; não presumir whitelist de fixtures suficiente. |
| Busca de card | `app/api/players/search-and-build-card/route.ts` | HTTP direto com até três tentativas: cada tentativa precisa de admissão. |
| Exportação manual | `scripts/export-sportmonks-twenty-club-rosters-readonly.mjs` | Paginação direta, mesmo sem escrita de produto. |

Os caminhos foram conferidos por leitura, sem executar providers. Inventário de execução remota/frequências permanece pendente.

## Testes de aceite antes de QA

- Dois workers de bases diferentes disputam o mesmo scope: apenas um recebe permissão enquanto houver tentativa pendente.
- Replay não produz segunda autorização HTTP; conclusão idempotente aceita somente o mesmo recibo, nunca de outro worker.
- Timeout, abort, 429, remaining zero, observação inválida, assinatura errada e autoridade indisponível não liberam chamadas extras.
- Payload não consegue trocar account scope, método RPC, ambiente, destino ou dono da tentativa.
- Cancelamento interrompe transporte; retries entram novamente pelo gate; cache continua rastreável sem contar como nova chamada.
- Contratos SQL, adapter e integração HTTP verificam os mesmos limites. Teste de fonte não substitui concorrência real.
- Provar atualização de fixture, eventos, placar e pontos com identidade estável e segunda reconciliação idempotente. Horário local é projeção de UTC, não correção manual de fixture.

## Sequência de implantação e recuperação

Preparar código/configuração OFF → revisão independente e testes locais → escolher destino da autoridade e política de identidade sem copiar segredo → ensaio QA com quota limitada e recibos → smoke e prova de dados atuais → gate separado de Production. Se falhar, desabilitar consumidores e preservar último snapshot com estado de desatualização; nunca reativar caminho sem guarda para “recuperar”.

Pendente: implementação do transporte/autenticação central, vinculação de todos os consumidores, destino remoto e provas acima. Nenhuma infraestrutura foi criada e nenhuma integração central foi declarada pronta.
2026-10-10 18:47 UTC — B01 recuperação: CLI --measure-single executada em subprocesso real até config/operator/measurement, apenas driver PostgreSQL e HTTP sintéticos.5PASS0SKIP452ms:success/deny/commitadmissãoperdido/leaseexpirada/commitcompletionperdido; comprova exitcode, ordem commit→observador→HTTP→completion, no máximo1HTTP, ausência de retry e segredos/payload não expostos. ESLint0/diff0. Novos testes/fixture; sem alteração funcional. Revisão independente e tipagem pendentes. NÃO prova TLS/COMMIT remoto nem recuperação real; ensaio SQL nativo anterior separado permanece válido no seu escopo. Próximo: pontuação/ranking integrado11atletas e configuração/gates QA.
