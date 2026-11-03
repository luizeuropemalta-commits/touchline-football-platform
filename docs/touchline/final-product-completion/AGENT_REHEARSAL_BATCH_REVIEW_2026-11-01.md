# QA — lote atômico de schema do ensaio de push

Estado atual: **SCHEMA APLICADO NA QA PELO ROOT E POSTFLIGHT SOMENTE LEITURA APROVADO** em 2026-11-01T05:27:37.470663Z. Versão gerenciada `20261101023725`, nome `touchline_push_rehearsal_atomic_qa_20261101`. Este agente não fez mutações remotas; o gate de entrega permanece separado e pendente. As seções de preparação abaixo preservam a evidência anterior; o adendo final é o estado atual.

## Alvo e pacote exato

- QA: `xgxbwqxjssxxuihuwmgy`, TouchLine Development QA, confirmada no inventário remoto desta missão.
- Production excluída: `vxireiswggllwhbsmdcj`.
- Candidata: `qa-stripe-release-20261029`, HEAD `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694`; WIP existente preservado.
- Nome proposto para `apply_migration`: `touchline_push_rehearsal_atomic_qa_20261101`.
- Arquivo do lote: `artifacts/avatar-notifications-20261031/rehearsal-managed-batch-20261101.sql`.
- SHA-256 do lote: `b70952d4d22aa2aa29e8dfea94f360e2f5e94357c25b4340d28884ce97e44349`.
- Manifesto: `artifacts/avatar-notifications-20261031/rehearsal-managed-batch-20261101.manifest.json`.

Somente os dois arquivos abaixo estão embutidos, **byte a byte**, em strings SQL protegidas por tags próprias. O lote recalcula SHA-256 antes de executá-los. A igualdade com os arquivos originais também foi verificada fora do banco.

| Ordem | Arquivo original | Bytes | SHA-256 |
|---|---|---:|---|
| 1 | `20261002221350_touchline_push_rehearsal_reservation.sql` | 6673 | `e17103f7ec671d2f6b3cbb076b997dc3c61d197a97cfbf48834b9fff3e43d23a` |
| 2 | `20261003224152_touchline_push_rehearsal_installation_guard.sql` | 3793 | `51c894ad6e5a1d3ce66cb293f99358b8942b896964546730eea0d854f34952ca` |

Todos permanecem em `supabase/migrations/`, sem edição. Não estão incluídos locale, devices, match_push, game_notification, lineup_reminder, projeção de mercado ou sync_gameweeks. Dos sete objetos ausentes no inventário anterior, este lote instala somente `touchline_push_rehearsal_cooldowns` e `touchline_push_rehearsal_attempts`.

## Ausência e pré-condições obrigatórias

O envelope é **um único DO**, sem COMMIT interno. Executa as duas fontes e as asserções na mesma instrução. Erro em qualquer ponto desfaz a instrução inteira. O runner gerenciado deve ainda manter a instrução e sua própria linha de histórico na mesma transação.

Antes da DDL, o SQL exige:

1. Guard canônico existente e literal QA correto, além de advisory lock transacional exclusivo para este lote.
2. As duas tabelas e o índice `touchline_push_rehearsal_attempts_actor_installation_idx` ausentes. Qualquer overload de `touchline_reserve_push_rehearsal` ou `touchline_finish_push_rehearsal` causa aborto.
3. Histórico gerenciado existente, sem versões originais e sem qualquer nome contendo `push_rehearsal`. Isso detecta execução prévia, parcial ou rebatizada para reconciliação, sem esconder drift com `IF NOT EXISTS`.
4. Colunas-base de users/devices com tipos e nulabilidade esperados; PK de users, unique user/installation de devices, RLS habilitada/forçada e constraint canônica de subscription validados.
5. Papéis anon/authenticated/service_role existentes; service_role com BYPASSRLS, USAGE no schema, SELECT e UPDATE em devices, necessários ao caminho invoker e lock de dispositivo.
6. Hashes exatos das duas fontes preservadas.

**Limite do guard:** a definição atual de `touchline_assert_qa_fixture_target(text)` compara somente o argumento recebido com o literal QA; não lê a identidade real do servidor. Portanto, ele não autoriza aplicar o lote em um projeto arbitrário. A raiz deve fixar `project_id: xgxbwqxjssxxuihuwmgy` na ferramenta e confirmar novamente o nome/ref do projeto. Nunca substituir por uma credencial ou conexão de Production.

A leitura adicional de papéis confirmou na QA: service_role BYPASSRLS=true, USAGE=true, devices SELECT/UPDATE=true; anon sem acesso a devices; authenticated com SELECT/UPDATE sujeitos à RLS. Evidência: `rehearsal-managed-batch-20261101-role-preflight.json`. Nenhum valor de subscription foi lido.

## Permissões e segurança contra repetição

As duas tabelas têm RLS ENABLED e FORCED, nenhuma policy e nenhuma escrita de cliente. Grants herdados são revogados explicitamente para PUBLIC, anon, authenticated e service_role antes de conceder apenas SELECT/INSERT/UPDATE a service_role. DELETE/TRUNCATE/REFERENCES/TRIGGER não são concedidos a esse papel. O envelope confere privilégios efetivos, acesso por coluna e grantees inesperados.

As duas RPCs são SECURITY INVOKER, search_path vazio e lock_timeout=500ms. Só service_role recebe EXECUTE, além dos poderes inerentes do proprietário/superusuário. O envelope verifica assinatura, retorno jsonb/boolean, configuração, grants e zero linhas nas novas tabelas. Também verifica índice não único, unique actor/request e FK actor/users ON DELETE CASCADE. Nenhuma FK de device pode apagar uma tentativa histórica.

A reserva obtém primeiro o lock da conta. Dentro dele verifica request_id já consumido e **qualquer tentativa anterior da mesma instalação**, antes do cooldown. A checagem não filtra por expiração, resultado, subscription ou dispositivo recriado. A combinação lock da conta + unique(actor_id,request_id) impede duas reservas válidas concorrentes pelo caminho RPC; lock disputado devolve unavailable. O índice de instalação é deliberadamente **não único**: a migration histórica deve preservar múltiplas tentativas antigas, se existirem, sem apagar nem deduplicar dados. Neste lote a expectativa é schema ausente, portanto as duas tabelas começam vazias.

O fingerprint não é aceito sozinho como autorização: a reserva confere ator, installation_id, device_id, permission=granted e igualdade do JSON da subscription sob lock. A validade máxima é de 30 segundos. Finish só finaliza pending, repete o mesmo resultado de forma idempotente e rejeita troca posterior de resultado. Uma tentativa unknown continua consumida.

**Limites explícitos:** service_role possui INSERT/UPDATE direto e, portanto, este desenho não é imutável contra adulteração privilegiada. A garantia de repetição vale pelo fluxo servidor/RPC revisado; não é prova de concorrência real feita por este lote. A remoção da conta users pode apagar suas tentativas pela FK actor; remover apenas o dispositivo não pode. Não chamar reserve/finish durante a instalação ou a pós-checagem.

## Histórico gerenciado e mapeamento

`apply_migration` deve receber somente o nome acima, o ref QA fixo e o conteúdo integral do lote. Não usar execute_sql para aplicar DDL nem db push geral.

A ferramenta gera **uma versão remota para o lote**. Após sucesso, registrar a versão e o nome efetivamente retornados/consultados no manifesto, mapeando ambos os arquivos originais a essa mesma versão (`covered by`). Não inventar timestamps, não criar manualmente duas linhas de histórico retroativas e não apagar históricos aplicados. Ausência das versões originais isoladas após esse lote não significa schema ausente. O próximo release deve reconciliar esse mapeamento no controle de migrations antes de qualquer mecanismo de aplicação abrangente.

O contrato visível da ferramenta informa aplicação de DDL, mas não documenta explicitamente sua transação de histórico. O envelope remove o risco de aplicar só a primeira fonte dentro do SQL, mesmo se houver separação de comandos pelo runner; ainda é necessário confirmar o resultado/linha de histórico após a chamada. Se o retorno for incerto, **consultar antes de repetir**. Se schema e histórico divergirem, registrar drift e preparar reparo forward específico; não criar novos objetos nem apagar tentativas às cegas.

## Prova local e evidência existente

Teste existente: `tests/touchline-push-rehearsal-sql.test.mts`. Hashes das migrations continuam iguais aos do inventário. O log anterior `artifacts/local-card-integrity-20261031/consolidated-suite.log`, linhas 6995–7003, comprova o teste estático de ordem de locks e o grupo SQL com seis subcasos: ACL/RLS, autoridade/binding/expiry inválidos, reserva/cooldown/finish idempotente, tombstone após expiração/remoção do dispositivo, integração core/store/transport sintético e todos os cinco outcomes consumindo a instalação. Esses PASS não transformam toda a suíte antiga em PASS e não comprovam push físico.

Comando focado existente, se uma futura alteração justificar repetição:

```sh
node --input-type=module -e 'import {spawnSync} from "node:child_process"; import {releaseSqlEnvironment} from "./scripts/release-sql-runtime.mjs"; const r=spawnSync(process.execPath,["--test","--test-concurrency=1","--test-timeout=30000","--experimental-strip-types","tests/touchline-push-rehearsal-sql.test.mts"],{stdio:"inherit",env:await releaseSqlEnvironment()}); process.exit(r.status??1)'
```

`releaseSqlEnvironment` usa somente o runtime PGlite já instalado e valida exports/extensões locais; não instala pacotes nem abre conexão remota.

Novo harness somente em artifacts: `artifacts/avatar-notifications-20261031/prove-rehearsal-managed-batch-20261101.mjs`. `node --check` passou e hashes embutidos passaram. **Execução SQL do envelope aprovada localmente em 2026-11-01T02:32:35.412Z**, exit 0 em 3,65 segundos, após o executor de navegador liberar a janela. Nenhum navegador/teste concorreu com essa execução. Comando:

```sh
node artifacts/avatar-notifications-20261031/prove-rehearsal-managed-batch-20261101.mjs
```

Uma instância PGlite descartável, sem servidor e sem rede, comprovou: falha deliberada após as duas fontes restaura todo o catálogo; falha ao registrar histórico em transação simulada desfaz DDL+histórico; sucesso atende pós-condições sem criar dispositivos/preferências/tentativas; reaplicação falha por ausência esperada e preserva estado. Os quatro passos passaram; a evidência foi gravada em `rehearsal-managed-batch-20261101-local-proof.json`. Esse teste modela o runner e não demonstra a implementação interna do serviço gerenciado.

## Plano original de execução e rollback operacional (aplicação SUPERSEDED pelo adendo)

Ordem exata da próxima ação da raiz:

1. Conferir o PASS local do envelope e os hashes no manifesto; não repetir o teste sem mudança ou nova preocupação. A janela de execução já foi devolvida ao executor de navegador.
2. Revisão independente do envelope e hashes; confirmar novamente alvo QA e ausência. Verificar gates efetivos OFF no deployment, inclusive `TOUCHLINE_PUSH_REHEARSAL_ENABLED` e os workers relacionados. Este agente não consultou segredos nem alterou variáveis.
3. Aplicar uma única chamada `apply_migration` com o ref QA, nome e conteúdo integral do arquivo. Orçamento de builds remotos: zero; schema não exige build por si só.
4. Executar somente os SELECTs de `rehearsal-managed-batch-20261101-postflight.sql`, inspecionar valores e capturar resposta da ferramenta + versão no manifesto. Tabelas novas devem continuar com zero linhas; nenhuma reserva/envio faz parte desta missão.
5. Só depois declarar schema instalado. Entrega real, consentimento e dispositivo continuam em gates próprios, sem ativação implícita.

Antes do commit remoto, qualquer exceção no DO deve reverter toda a DDL. Após um commit bem-sucedido, a volta operacional é manter os gates OFF e preservar ledger/consumo; não executar DROP, TRUNCATE, DELETE de histórico nem reviver uma instalação consumida. Defeitos posteriores requerem correção forward, revisada e com evidência. Não injetar falhas propositais na QA; a prova destrutiva ocorre só no banco local descartável.

## Rodapé de missão

MISSION: preparar lote mínimo de schema rehearsal para revisão da raiz. SCOPE: artifacts, leitura de fonte e catálogo QA; sem mutação remota. QA BRANCH/CANDIDATE: qa-stripe-release-20261029, HEAD 47ebfffbbda98cbb89bcd3ad08fb19efd1e50694 com WIP preservado. QA DEPLOYMENT: nenhum. REMOTE BUILD BUDGET / CONSUMED: 0 / 0. STABLE QA URL: https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app.

FILES CHANGED: este relatório e seis artifacts de lote/manifesto/harness/pós-checagem/evidência de papéis/prova local. FUNCTIONAL RESULT: schema QA aplicado pelo root e confirmado pelo postflight abaixo; envio não aprovado. VISUAL/RESPONSIVE/ACCESSIBILITY/BROWSER MATRIX: fora do escopo, nenhuma tela aprovada. SECURITY RESULT: revisão invoker/RLS/grants e duplicação delimitada acima. TESTS: hashes/bytes e syntax check do harness passaram; quatro provas SQL locais do envelope passaram; evidência existente reutilizada sem somar totais. BUILD: não executado, nenhuma fonte alterada. OBSERVABILITY: respostas de SELECT e plano de pós-checagem preservados. OPEN FINDINGS: entrega real/configuração/dispositivo continuam pendentes; schema e histórico gerenciado confirmados no adendo; envelope local validado. PRODUCTION: NOT TOUCHED.

| Ferramenta | Uso real | Evidência | Decisão |
|---|---|---|---|
| Supabase connector | SELECT de papéis/permissões no projeto QA | `*-role-preflight.json`; inventário QA anterior da mesma missão | Pré-requisitos de serviço presentes; sem DDL |
| Shell/Python/Node | Leitura de fontes/log, bytes/hashes e node --check | manifesto + saída dos comandos | Fontes preservadas; harness sintaticamente válido |
| apply_patch | Artifacts e relatório próprios | arquivos acima | Produto/migrations/testes não editados |
| PGlite | Uma instância serial, 3,65s, quatro provas do envelope | `*-local-proof.json` | PASS local de atomicidade/ACL/replay; não equivale a QA instalada |
| Browser/Vercel | Não executados por este agente | não aplicável | Nenhum PASS publicado ou visual |


## Adendo — postflight remoto confirmado e próximo gate

O conector `list_projects` confirmou `xgxbwqxjssxxuihuwmgy` como TouchLine Development QA, ACTIVE_HEALTHY. Em seguida foi executado um único SELECT agregando JSON, para evitar a limitação de retorno somente da última consulta. Evidências: `artifacts/avatar-notifications-20261031/rehearsal-managed-batch-20261101-postflight-single.sql` e `rehearsal-managed-batch-20261101-qa-postflight.json`.

Confirmação em `2026-11-01T05:27:37.470663Z`:

- Devices **0**, attempts **0**, cooldowns **0**. Nenhuma reserva, registro ou envio ocorreu nesta verificação.
- Duas tabelas owner postgres, RLS ENABLED/FORCED, zero policies. Clientes sem privilégios de tabela/coluna; service_role somente SELECT/INSERT/UPDATE, sem DELETE/TRUNCATE.
- Duas funções SECURITY INVOKER, `search_path=""`, `lock_timeout=500ms`; somente owner/service_role com EXECUTE. Reserve OID 532627, MD5 `26dcd9232f44d308e8bbe94c7cb79be6`; finish OID 532628, MD5 `3ff09e2bec0799c35d963d0420a082f0`.
- Índice actor/installation não único e índice actor/request único, válidos e prontos. Constraints validadas; as duas FKs apontam para users com cascade, nenhuma FK de device.
- Único histórico pertinente: `20261101023725 / touchline_push_rehearsal_atomic_qa_20261101`. Manifest atualizado: fontes `20261002221350` e `20261003224152` cobertas pela mesma versão, sem criar histórico retroativo.
- Pipeline anterior match-push continua presente. As cinco tabelas de lineup estavam ausentes nesta fotografia; root executa essa instalação em outra frente. Não reinterpretar a ausência como falha no lote rehearsal.

Próximo gate concreto é **prontidão do build + uma instalação real**, antes de enviar: inventariar somente nomes/escopo das configurações da Preview branch qa; confirmar que o bundle serve `NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY`, que servidor possui par correspondente e subject válido, sem exportar seus valores privados. A busca em artifacts deste agente encontrou contratos e nomes exigidos, mas **não encontrou inventário atual da Vercel que comprove a presença/validade dessas configurações**. POST disabled relatado pelo root confirma gate desligado, não confirma VAPID válido, porque a rota retorna antes de executar o parser.

Configuração existente no código: `TOUCHLINE_PUSH_REHEARSAL_ENABLED`, `TOUCHLINE_PUSH_REHEARSAL_ORIGIN`, `TOUCHLINE_PUSH_REHEARSAL_ACCOUNT_ID`, `TOUCHLINE_PUSH_REHEARSAL_INSTALLATION_ID`, `NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY`, `TOUCHLINE_WEB_PUSH_PRIVATE_KEY`, `TOUCHLINE_WEB_PUSH_SUBJECT`. Auth e serviço devem apontar para QA direct, com Preview e origem HTTPS exata. Nenhuma flag foi ativada nem chave lida/copied neste lote.

Depois da validação de configuração, a página `/notifications/rehearsal` aceita preparação explícita de uma CUSTOMER QA mesmo antes de fixar installation_id; o envio permanece bloqueado até o ACK do device coincidir com a instalação configurada. Ao ativar delimitadamente a página em uma fase posterior, preparar o device por gesto do usuário, verificar identidade/permissão sem registrar endpoint/keys em logs, configurar o binding exato e obter o consentimento próprio do ensaio. Só então realizar uma tentativa única e verificar exibição/clique fisicamente. `provider_accepted` sozinho continua sem provar exibição. Manter workers de partida e lineup OFF até suas provas separadas; não ativar todos para testar um aparelho.

O passo acima está apenas proposto: zero mudanças de flags, de consentimento, de device ou transporte neste adendo. CURRENT_STATE e LEDGER ficam sob o root.
