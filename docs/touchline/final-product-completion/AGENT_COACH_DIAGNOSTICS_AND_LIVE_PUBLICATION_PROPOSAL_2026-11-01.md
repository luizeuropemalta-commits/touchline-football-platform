# Diagnóstico de treinadores, consulta pós-jogo e publicação da Live — proposta técnica

Data: 2026-11-01. Autoria: subagente publication_current_data. Missão: AUDIT, somente leitura e preparação de proposta. Candidata: qa-stripe-release-20261029, HEAD 47ebfffbbda98cbb89bcd3ad08fb19efd1e50694. Alvo das consultas: Supabase QA xgxbwqxjssxxuihuwmgy.

**Atualização de 2026-11-01:** após liberação do congelamento pelo principal, o diagnóstico foi implementado localmente, incluindo a paridade do calendário, com 113 testes focados aprovados após revisão. Evidência e manifesto atuais: [AGENT_COACH_DIAGNOSTICS_IMPLEMENTATION_2026-11-01.md](./AGENT_COACH_DIAGNOSTICS_IMPLEMENTATION_2026-11-01.md). As propostas de identidade editorial e de publicação Live abaixo continuam não aplicadas. A identidade agora tem proposta concreta e protótipo isolado em [AGENT_PRIVATE_COACH_IDENTITY_PROJECTION_2026-11-01.md](./AGENT_PRIVATE_COACH_IDENTITY_PROJECTION_2026-11-01.md).

**Registro histórico da etapa inicial:** a proposta abaixo foi preparada sem alterar produto/testes, dado, ponto, flag, migração, contrato ou gate, enquanto a suíte de navegador estava congelada. O patch/fingerprint dessa etapa são históricos e não devem ser reaplicados ao estado atual. O resultado não é aprovação de lançamento.

## Entregáveis e verificações delimitadas

- Patch para aplicar somente depois da suíte congelada: `artifacts/coach-diagnostics-proposal-20261101/coach-ranking-diagnostic-unapplied.patch`.
- Fingerprint SHA-256 dos seis arquivos de base e das versões propostas: `artifacts/coach-diagnostics-proposal-20261101/source-fingerprint.json`.
- Builder reproduzível: `artifacts/coach-diagnostics-proposal-20261101/build_patch.py`.
- Evidência SELECT reduzida, sem credenciais nem corpo bruto do fornecedor: `artifacts/coach-diagnostics-proposal-20261101/qa-readonly-evidence.json`.
- `git apply --check`: passou contra os arquivos locais presentes ao preparar esta proposta. Isto só confirma aplicabilidade textual; não aplicou o patch e não comprova compilação ou comportamento.
- Testes novos/focados, SSR, TypeScript e browser: **não executados**. A missão solicitou proposta e preservação do snapshot.
- Estado anterior complementar: `AGENT_CURRENT_PUBLICATION_QA_2026-11-01.md`, `AGENT_OFFICIAL_FIXTURE_QUERY_2026-11-01.md` e `AGENT_SHARED_PUBLICATION_PENDING_AUDIT_2026-11-01.md`.

## 1. O diagnóstico genérico perde a causa real

Em `lib/football-data/live-sync.ts:527`, o envelope confirmado da RPC contém `ranking.reason`, mas qualquer `ok !== true` vira `coach-points:attribution-pending`. A lista `coachPendingFixtures` permanece vazia quando a falha é exclusivamente uma identidade editorial não aprovada. Portanto, uma lista vazia não comprova ranking pronto.

A RPC em `supabase/migrations/20261027200540_fixture_coach_attribution_guard.sql:404` distingue:
- temporada indisponível;
- atribuição de treinador da partida pendente;
- identidade de treinador ausente do catálogo aprovado;
- resultados necessários indisponíveis.

A fotografia QA mostra 88 feeds finalizados da temporada com atribuição completa e um treinador histórico adicional, ID oficial 30314, ausente do catálogo legado de 20. Isso **sustenta a hipótese de bloqueio editorial**, mas não prova qual ramo a execução antiga percorreu: o recibo antigo não preservou `ranking.reason`. O patch não inventa retrospectivamente esse motivo.

### Patch proposto

Seis arquivos:
1. Novo `lib/football-data/coach-reconciliation-diagnostic.ts`: extrai somente enum conhecido e contagens limitadas; envelope ambíguo retorna motivo não confirmado.
2. Novo `components/admin-coach-sync-diagnostic.tsx`: texto PT/EN e acesso ao catálogo protegido, sem IDs, e-mail ou conteúdo bruto.
3. `lib/football-data/live-sync.ts`: mantém a causa confirmada no erro e no recibo privado `coachRankingDiagnostic`; não muda nenhum predicado de publicação/reconciliação.
4. `app/(app)/admin/football-data/page.tsx`: lê a projeção privada e mostra o diagnóstico.
5. `tests/touchline-live-sync-outcome.test.mts`: quatro cenários para preservar cada causa e continuar bloqueando publicação.
6. Novo `tests/coach-reconciliation-diagnostic.test.mts`: sete cenários de parsers, motivos antigos/inesperados, contagens e remoção de campos extras.

A resposta pública resumida do endpoint de sincronização não foi ampliada. IDs ficam nos registros protegidos já existentes. Os novos resumos não expõem esses IDs.

### Antes de aplicar

Comparar os hashes de base. Se qualquer arquivo mudou durante a suíte, reapresentar o patch sobre o estado novo e revisar o diff. Não aplicar às cegas. A alteração não elimina o bloqueio de pontos nem publica a Live por conta própria.

### Verificações proporcionais após aplicar

- Executar os sete testes puros novos e a suíte focada `touchline-live-sync-outcome`.
- SSR PT/EN do novo componente: motivo editorial, motivo desconhecido, zero/uma/múltiplas pendências, JSON malformado, ausência de identificação pessoal/ID oficial.
- Adaptar o harness da página admin caso intercepte imports; confirmar que a página mantém proteção de ADMIN e não leva diagnóstico para DTO público.
- Revalidar o endpoint admin sem autorização e a forma limitada da sua resposta.
- Confirmar que transporte ambíguo e motivo não reconhecido continuam fail-closed.
- Verificar TypeScript, ESLint dos arquivos e diff. Rodar navegador do admin após a publicação da candidata, com a sessão administrativa correta.

**Paridade ainda necessária:** `lib/football-data/fixture-schedule-store.ts:569` possui a mesma redução para `coach-points-reconciliation-failed:attribution-pending`. O patch entregue é o recorte do loop Live/admin; este segundo caminho deve usar o mesmo helper e ter teste focado antes de declarar todo o diagnóstico consistente. Não produzir uma segunda implementação do parser.

## 2. Catálogo de treinadores: a aprovação atual depende de um campo que é removido

Caminho existente: `/admin/coaches` → `/api/admin/coaches` → `touchline_coach_editorial_command`.
Ações existentes: bootstrap, approve, ignore, reopen, publish. O handler verifica proprietário, origem, limites de entrada, revisão esperada e idempotência.

Em QA, a configuração do catálogo estava na revisão zero, com editorial e publicação desativados. Identidades, observações, candidatos e publicações estavam vazios. O site usa o catálogo legado como fallback autorizado.

### Falha concreta no caminho de ingestão

- `lib/football-data/fantasy-store.ts:14` sanitiza antes de persistir o feed.
- `lib/football-data/provider-payload-sanitize.ts` remove recursivamente a chave `raw`.
- `touchline_coaches_private.stage_fixture`, em `20261027210242_touchline_coach_catalogue_editorial.sql:167`, procura o nome somente em `fixture_payload.source.raw.coaches`.
- A aprovação recusa observação sem `display_name` (linha 242).
- Os oito feeds consultados contendo atribuição 30314/20 têm atribuição completa e nenhum `source.raw.coaches`.

Logo, ativar flags ou apertar Aprovar não preenche esse nome: o caminho normal de persistência removeu a única fonte lida pelo staging. **Preservar a sanitização é obrigatório. Não reintroduzir raw nem preencher nome pelo clube, por ID parecido ou por pesquisa nominal.**

### Mínimo necessário e evidência oficial

O campo obrigatório ausente é `display_name`, não vazio e validado. Nacionalidade/país são opcionais nesse esquema. Também é necessária proveniência oficial consistente: ID de treinador, ID de equipe, ID/data de partida e relação oficial correspondente. O nome e a nomeação atuais de 30314 **não foram confirmados** nesta missão.

O provider já possui `getCoachById` com país/equipes, passando pelo orçamento compartilhado. Não existe hoje um escopo coach no endpoint protegido `provider-diagnostic`. A consulta de treinador teria de ser exposta por caminho server-only protegido ou consumida dentro do fluxo de ingestão existente, sem copiar token. Não tratar o fallback `Coach <id>` de `mapCoach`, nem o primeiro time retornado, como nome/nomeação oficiais.

Correção recomendada:
1. No adaptador Sportmonks, projetar somente identidade editorial mínima a partir do `coaches` oficial e da relação `meta` validada para a partida/equipe/treinador.
2. Persistir essa projeção limitada, com hash de evidência e instante de observação, mantendo remoção de raw/segredos.
3. Migração forward do staging para ler essa projeção validada; não confiar em nome enviado pelo browser.
4. Criar observação/candidato idempotente e permitir revisão humana/auditável no catálogo.
5. Em fonte sem nome ou relação divergente, manter pendente e explicar o motivo no admin.
6. Testes provando feed → sanitização → staging → revisão, além de duplicação, mudança da observação entre aprovação/publicação, campo inválido e ausência de evidência.

### Aprovar histórico não equivale a substituir treinador atual

Os oito jogos são fatos históricos. O comando `publish` existente atualiza `current_assignments` (linha 265); não oferece uma ação apenas para identidade histórica. Não é seguro trocar o treinador atual de Newcastle só para desbloquear um ranking histórico.

É necessário confirmar nomeação atual por fonte oficial antes de usar esse publish, ou adicionar um comando separado e auditado de publicação histórica:
- identidade TouchLine permanente e publicação append-only;
- associação da observação à partida histórica;
- `current_assignments` e o número de 20 clubes atuais preservados;
- controle de revisão, pedido idempotente e recibo;
- histórico aprovado consumido por `catalogueCoachAssignments`;
- contratos e contribuições antigas permanecem com suas identidades originais.

O histórico de 30314 não deve ser remapeado para o ID legado 523911. Uma identidade editorial correta não autoriza recalcular pontos por suposição.

## 3. Por que fetched=0 não significa cron sem acesso

Evidência de 2026-11-01 02:30:03 UTC, em `qa-readonly-evidence.json`:
- cron QA `touchline-qa-live-sync` ativo, a cada minuto;
- chamadas oficiais `inplay` HTTP 200 de 02:25 a 02:30 UTC;
- orçamento remanescente registrado 1969 → 1964;
- `blocked_unknown=false`, cooldown vencido, sem janela de bloqueio ativa;
- a execução anterior tinha `fetched=0`, `updated=0`, `feeds=0`, mas `snapshotFixtures=1` e cadência executada.

Em `live-sync.ts:437`, fetched é a quantidade de fixtures canônicos de entrada; não é contador de requisições HTTP. Nessa amostra, o zero não é evidência de falha de autenticação, quota ou cron parado.

### Fixture 19722185

- UUID canônico: 499756e3-cedc-43cc-8131-5c2eac95ea69.
- Última tentativa pós-jogo: 2026-10-31 15:07:05.227 UTC.
- Última sincronização: 2026-10-31 15:07:05.773 UTC.
- Partida antiga (>72h), sujeita ao intervalo diário; na amostra 02:30 ainda não era elegível pela regra temporal. Próxima elegibilidade aproximada: 2026-11-01 após 15:07 UTC, **não garantia de consulta nesse minuto**, pois fila/orçamento também se aplicam.
- Fila separada de recuperação: `needs_review`, 8 tentativas, `attempt_limit`, último registro em 27 de outubro.
- A linha oficial normalizada 14674515841 permanece sem playerId. Restaurar ID antigo ou casar pelo nome não é correção válida.

### Comandos operacionais realmente existentes

1. POST `/api/admin/football-data/sync`: proprietário autenticado e origem validada; roda pipeline normal. Não aceita override de fixture nem reabre needs_review.
2. GET `/api/football-data/provider-diagnostic?scope=fixture&fixtureId=<uuid-canônico>`: leitura oficial protegida por ADMIN QA, sujeita à quota; diagnostica sem mudar os pontos.
3. POST `/api/football-data/live-sync`, body `{"fixtureId":"19722185"}`: caminho scheduler autenticado com bearer próprio; passa forceFixtureId para o pipeline, mantendo lease/quota. Existe no código atual. Não há comando proprietário equivalente já instalado que aceite esse alvo.

A sessão ADMIN não foi preservada após reinício, segundo o agente principal; as sessões CUSTOMER não autorizam o diagnóstico. Não foi solicitado/copiado segredo e nenhum endpoint acima foi chamado nesta missão.

As funções instaladas consultadas de recuperação são claim, defer e finish. A função claim pula needs_review; defer/finish não são uma API de reabertura. **Não foi encontrada RPC oficial de enqueue/reset/reopen para essa fila.** Não alterar timestamps ou contadores diretamente para simular elegibilidade.

Próxima ação segura: recuperar uma sessão ADMIN legítima e usar o diagnóstico read-only com UUID canônico; se necessário, projetar uma ação owner-only explícita de reconsulta, com origem, revisão/idempotência, registro do motivo e quota. Enquanto isso, o cron e a janela pós-jogo continuam existentes; nenhum segredo precisa ser extraído.

### Observação de eficiência

A cadência usa a última execução integralmente bem-sucedida. Enquanto toda execução permanece partial por uma pendência histórica, a âncora fica antiga e o cron pode repetir a consulta inplay por minuto mesmo com regime matchday de cinco minutos. A amostra apresenta esse comportamento. Se corrigir, manter um recibo separado de consulta oficial confirmada para a cadência; nunca transformar partial em success ou pular a reconciliação só para economizar quota. Exige teste de falha de ranking com HTTP200 e teste de falha do próprio provider.

## 4. Desacoplar Live e pontos sem misturar snapshots — somente proposta

Hoje a publicação compartilhada imutável associa Live, pins de ranking de jogadores e pins de treinadores. A pendência de um jogador/treinador bloqueia toda a promoção. Não é seguro chamar a RPC de publicação diretamente, retirar o erro do gate ou usar tabelas mutáveis como fallback: isso torna os consumidores incoerentes.

Proposta para uma evolução deliberada do contrato:
- manifesto compartilhado versionado, promovido atomicamente, com revisões imutáveis distintas por domínio;
- domínio Live exige evidência oficial de placar/status/tempo/identidade da partida;
- domínio de pontos mantém a última revisão confirmada, com estado pendente e instante/abrangência explícitos;
- cobertura por fixture e revisão de origem liga estatísticas individuais, notas e prêmios aos dados reconciliados;
- nenhum total/prêmio antigo aparece como se incluísse uma nova partida ainda não reconciliada;
- SSR e clientes leem o mesmo manifesto/revisões; não ler ranking independente mais novo por fora;
- falha de identidade numa fixture impede as partes afetadas dessa fixture, sem inventar escalação/nome; outras fixtures com evidência completa podem atualizar o domínio Live;
- novos erros permanecem visíveis no admin, com recibos e replay idempotente.

Alternativa inicial de menor escopo: manter v1 até corrigir as duas fontes pendentes e adicionar observabilidade agora. Uma mudança de contrato v2 exige migração/compatibilidade e aceite próprio; não cabe como simples mudança de CSS ou remoção de gate.

Testes necessários para v2:
1. Live nova + pontos pendentes: placar/tempo atualizado, totais confirmados rotulados pela abrangência correta, nenhum incremento indevido.
2. Identidade inválida em uma fixture: não vaza para escalação, outras fixtures válidas avançam.
3. Atualização concorrente entre SSR e fetch: todos os pins vêm de um único manifesto.
4. Falha antes/depois de promover ponteiro: leitura anterior consistente, nada parcialmente publicado.
5. Correção pós-jogo repetida: sem duplicação em pontos, ranking, prêmios ou histórico.
6. Remoção de evento/lineup: revisão preservada e consumidores coerentes.
7. Cache/revalidação: consumidores Live, ClubHub, ClubOwner, cards e ranking concordam com a versão.
8. Dados frescos inválidos: ausência de fallback para snapshot mutável.
9. Contrato v1 antigo: leitura compatível ou falha explícita, nunca mistura silenciosa.

## Sequência executável recomendada

1. Ao terminar a suíte congelada, revisar/aplicar o patch de diagnóstico, completar paridade fixture-schedule e executar testes focados.
2. Corrigir a projeção editorial sanitizada e o staging; comprovar ingestão e fontes oficiais antes de qualquer aprovação.
3. Resolver identidade histórica por caminho específico, sem alterar treinador atual com evidência de jogo antigo.
4. Reconsultar 19722185 pelo caminho autenticado legítimo; se o fornecedor ainda não entrega playerId, manter o bloqueio específico e registrar a dependência externa.
5. Somente com fontes/gates válidos, reconciliar pelo fluxo oficial e verificar manifesto/pins/consumidores.
6. Tratar o desacoplamento v2 como alteração de arquitetura com seus próprios testes, não como atalho de publicação.

## Registro da missão

MISSION: diagnóstico QA e proposta técnica delimitada.
SCOPE: leitura de recibos/feed/catálogo; patch não aplicado; desenho operacional e de publicação.
QA BRANCH: candidata detached qa-stripe-release-20261029.
QA COMMIT: 47ebfffbbda98cbb89bcd3ad08fb19efd1e50694; WIP externo preservado.
QA DEPLOYMENT: não criado nem alterado.
REMOTE BUILD BUDGET / CONSUMED: 0 / 0.
STABLE QA URL: https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
FILES CHANGED: somente este relatório e artifacts/coach-diagnostics-proposal-20261101.
FUNCTIONAL RESULT: causas e caminhos existentes identificados; nenhuma correção aplicada.
VISUAL / RESPONSIVE / ACCESSIBILITY RESULT: não executado, nenhum PASS.
SECURITY RESULT: somente SELECT no alvo QA; sem tokens, sem raw do provider, sem bypass de sessão/lease/quota.
BROWSER MATRIX: nenhum navegador usado nesta proposta.
TESTS: patch textual aplicável; testes de comportamento preparados, não executados.
BUILD: não executado.
OBSERVABILITY: evidência reduzida, timestamps reais da consulta e fingerprint preservados.
OPEN FINDINGS: diagnóstico a aplicar, staging incompatível com sanitização, identidade oficial de 30314 pendente, publicação histórica ausente, fixture sem playerId, sessão ADMIN ausente, gate compartilhado continua fechado.
PRODUCTION: NOT TOUCHED.

| Ferramenta | Execução | Resultado | Evidência |
|---|---|---|---|
| Supabase skill + connector | SELECT QA de recibos, observações e função instalada | Dados/procedimentos reais inspecionados; sem mutações | qa-readonly-evidence.json |
| Shell/Python/Git | Leituras, geração de patch isolado, git apply --check | Patch não aplicado e aplicabilidade textual comprovada | patch + source-fingerprint.json |
| Browser/provider direto | Não executado | Sessão ADMIN indisponível; sem tentativa de credenciais | comunicação do principal e registro de escopo |
