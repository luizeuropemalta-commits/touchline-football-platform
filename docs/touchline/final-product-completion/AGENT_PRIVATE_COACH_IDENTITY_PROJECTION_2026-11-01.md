# Identidade oficial dos treinadores após sanitização — proposta executável

Data: 2026-11-01. Subagente `publication_current_data`. Escopo desta etapa: **proposta e protótipo isolado**, sem alteração do pipeline de identidade, SQL, flags, catálogo, pontuação ou dados QA.

## Problema confirmado no código

O fluxo grava o feed sanitizado em `football_fantasy_fixture_feeds`. A sanitização remove `source.raw`, corretamente. O staging atual `touchline_coaches_private.stage_fixture` procura o nome em `fixture_payload.source.raw.coaches`; portanto, a única fonte de nome que ele lê já foi removida. Aprovação exige `display_name` não vazio.

As relações oficiais treinador/partida/equipe sobrevivem em `coachAttribution`; elas não contêm nomes e não devem ser reescritas para solucionar apresentação. A identidade oficial de 30314 continua pendente: este documento não atribui nome, clube atual ou equivalência com outro ID a essa pessoa.

## Decisão técnica mínima proposta

Extrair uma projeção privada de nomes do retorno oficial que já está em memória, antes de descartar `raw`, e entregá-la ao staging protegido após confirmar a gravação daquele mesmo feed. **Não acrescentar nomes não aprovados ao DTO público de fixture nem às assignments de pontuação. Não reintroduzir raw.**

Projeção fechada:

```ts
type PrivateFixtureCoachNames = {
  version: 1;
  source: "sportmonks.fixture.coaches";
  fixtureProviderId: string;
  competitionProviderId: string;
  seasonProviderId: string;
  identities: Array<{
    coachProviderId: string;
    clubProviderId: string;
    location: "home" | "away";
    displayName: string | null;
  }>;
};
```

São exatamente duas relações já validadas pelo normalizador existente `mapSportmonksFixtureCoaches`. O nome vem somente de `display_name` ou, se ausente, de `name` do objeto oficial que corresponde exatamente a `id`, `meta.coach_id`, `meta.fixture_id` e `meta.participant_id`. Nome inválido permanece nulo. Não buscar nome pelo clube, não aceitar `Coach <id>` gerado como fallback, não escolher `teams[0]`, não incorporar país/documento/data de nascimento/mídia/token.

### Prova local delimitada

Protótipo fora do produto:
- `artifacts/coach-diagnostics-proposal-20261101/coach-editorial-projection.prototype.ts`.
- `artifacts/coach-diagnostics-proposal-20261101/coach-editorial-projection.prototype.test.mts`.
- Log `coach-editorial-projection.prototype.test.log`: **20 PASS / 0 FAIL / 0 SKIP**.

Ele importa o normalizador de atribuição e o sanitizador reais. Os testes cobrem allowlist, falta de nome, nome inválido, Unicode, IDs/meta divergentes, duplicação, privacidade, `team_id` contraditório ignorado, preservação das assignments e remoção contínua de raw. Os nomes/IDs de teste são sintéticos. Esses 20 testes **não comprovam persistência SQL, integração do provider, fonte real de 30314 ou publicação**.

## Vínculo a uma importação confirmada: obrigatório antes de integrar

Já existe histórico imutável em `public.football_feed_revisions`; não criar um segundo histórico paralelo. O trigger `touchline_capture_feed_revision` guarda o conjunto normalizado de fixture, lineups, formations, sidelined e events. Dados idênticos podem reutilizar a última revisão — não há nova revisão a cada consulta.

Hoje `persistFantasyFixtureFeed` devolve somente `persisted/reason`, e `persistTouchlineRecoveryFeed` recebe da RPC um booleano de reconciliação. Só passar o ID da partida ao staging permite ler um feed posterior e atribuir o nome da resposta anterior a ele. A correção precisa do seguinte contrato:

1. O caminho normal confirma o upsert com retorno restrito de `id` e `last_synced_at`. Esse instante é o da importação realmente gravada, não um timestamp inventado para alterar cadência.
2. O caminho de recuperação preserva seu lease/reservation/fence e devolve um recibo equivalente dentro da mesma transação, em um comando versionado. Preservar separadamente `persisted` e `reconciliationReady`; `false` na reconciliação não significa necessariamente que nenhum feed foi gravado.
3. Um staging V2 **service-role only**, com concessões explícitas e sem rota pública de entrada de nomes, recebe: fixture ID, recibo confirmado, payload normalizado esperado e a projeção fechada de nomes. O handler não aceita esses nomes de um browser.
4. No SQL, adquirir o lock do feed; conferir ID, `last_synced_at`, provider, fixture, competição, temporada e igualdade exata do conjunto normalizado esperado com o gravado. Comparar também a revisão imutável mais recente com o feed atual e exigir `origin=observed_import`, seguindo o padrão já usado por `touchline_read_fixture_coach_evidence`.
5. Conferir as duas identidades contra `coachAttribution`, tipos, limites e tamanho; reconstruir a projeção com os campos permitidos. Não inserir JSON arbitrário. Uma divergência rejeita o staging, deixando a pendência visível e a reconciliação protegida.
6. Registrar o `source_feed_revision_id` na observação privada. Calcular no banco o hash canônico de revisão + projeção validada. O hash atual só da fixture não detectaria uma correção de nome quando o restante do feed é idêntico.
7. Usar a data real de importação confirmada para `observed_at` e a data da fixture gravada para `fixture_at`. Não tratar nenhum desses instantes como prova de nomeação atual. Repetição da mesma revisão/projeção é idempotente; novo nome oficial cria observação nova e invalida aprovação antiga.

O recibo de `last_synced_at` e a comparação completa evitam misturar respostas concorrentes mesmo quando o ID da partida é o mesmo. Se outra gravação vencer a corrida, não tentar corrigir timestamps nem forçar a observação: o staging permanece pendente para a próxima importação legítima.

## Arquivos e operações previstos para a próxima implementação

1. Módulo server-only de projeção (`lib/football-data/coach-editorial-evidence.ts`, a criar), usando o normalizador existente; saída estritamente privada. O protótipo é uma especificação testável, não deve permanecer como código de produto duplicado após integração.
2. `lib/football-data/fantasy-store.ts`: projetar enquanto `feed.fixture.source.raw` existe em memória; manter `sanitizeProviderPayloadForPersistence`; obter o recibo confirmado e chamar staging V2. Nenhum nome inserido no payload público.
3. `lib/football-data/fixture-backlog-recovery.ts`: mesma projeção; usar versão fenced com recibo. Não consultar provider novamente nem gastar quota extra só para nome.
4. `lib/touchlineArena/coach-catalogue-server.ts`: staging com recibo/expected payload/projeção; erro estruturado sem vazar nome/raw em log. Preservar flags fail-closed.
5. `lib/football-data/live-sync.ts`: retirar a chamada duplicada ao staging antigo quando a responsabilidade migrar para a persistência confirmada, tanto normal quanto recovery.
6. **Uma migração forward nova**, sem reescrever migrations aplicadas: recibo versionado da persistência recovery; staging V2 restrito; vínculo da observação à revisão imutável; índices/idempotência e grants. Não aplicar em QA antes dos testes locais SQL e revisão independente.

Não é necessário modificar a fórmula dos treinadores, o player rating, as assignments, os pontos dos contratos, o gate compartilhado ou o catálogo atual para transportar essa evidência.

## Testes de integração obrigatórios antes de aplicar/publicar

| Caso | Prova necessária |
|---|---|
| Provider real em harness | A única requisição guardada existente traz coaches; nome/meta válidos são projetados; nenhum HTTP extra |
| Sanitização e persistência normal | Feed armazenado sem raw/nomes privados; observação recebe somente projeção; receipt confirmado |
| Recuperação fenced | Lease/reservation inválidos não gravam observação; escrita válida preserva `reconciliationReady` |
| Concorrência | Resposta A não pode anexar nomes ao feed B; mismatch de recibo/payload rejeitado |
| Revisões | `source_feed_revision_id` pertence à mesma importação confirmada; baseline antigo não é prova nova |
| Idempotência | Replay não duplica observação/candidato; nome corrigido com feed equivalente cria revisão editorial |
| Atomicidade | Falha ao criar observação/candidato desfaz toda a gravação editorial; não altera pontos |
| Aprovação expirada | Observação nova invalida aprovação prévia; publicação usa revisão esperada |
| Segurança | Browser/anon/customer recusados; service role restrito; extras/raw/mídia/segredos rejeitados |
| Histórico | Nenhuma observação histórica altera `current_assignments`, contratos ou elenco atual |
| Não regressão | Checksum/assignments e histórico de pontuação continuam com a fonte original |

## Publicação histórica continua uma etapa diferente

Transportar o nome permite criar/revisar uma observação, mas o comando `publish` atual também atualiza `current_assignments`. Portanto, **não usar esse comando para preencher o nome de um treinador histórico sem prova de nomeação atual**.

É necessário um comando auditado específico de publicação de identidade histórica (ou fonte oficial atual que legitime o caminho de nomeação atual). O comando histórico deve preservar as 20 associações atuais, registrar identidade permanente e publicação append-only, permitir o consumo dessa identidade pelos rankings históricos e deixar contratos/pontos inalterados. Sua aprovação depende de observação oficial válida; não pode cadastrar 30314 por nome presumido.

## Entrega e limites

MISSÃO: proposta mínima de transporte privado de identidade oficial após sanitização.
ESCOPO: protótipo puro e testes sintéticos; sem implementação em produto.
RESULTADO: mecanismo e fronteiras definidos; 20 testes do protótipo aprovados.
SQL / QA / FLAGS / PONTOS / PUBLICAÇÃO: não alterados.
BUILD / BROWSER / DEPLOY: não executados nesta etapa.
PENDÊNCIAS: implementação e testes SQL/fenced/concorrência; fonte oficial real; publicação histórica separada.
PRODUCTION: NOT TOUCHED.

Esta proposta complementa `AGENT_COACH_DIAGNOSTICS_IMPLEMENTATION_2026-11-01.md`. Não converte o diagnóstico local verde em automação editorial completa.
