# Consulta oficial preparada — fixture 19722185 e treinador

Data: 2026-11-01. Estado: **PREPARADO, NÃO EXECUTADO NA REDE**.

Escopo: localizar e reutilizar a integração protegida existente para verificar a fonte antes de mudar a política de publicação. Não houve leitura de credenciais, consulta remota, mutação de futebol/pontos, teste pesado ou mudança nas fontes de produto congeladas.

## Evidência anterior e limite

`STATUS_RETOMADA_2026-10-31.md:69–75` registra Sunderland × Fulham, fixture canônica `499756e3-cedc-43cc-8131-5c2eac95ea69`, Sportmonks `19722185`, leitura de 31/10 às 15:07:05.773Z. A linha `14674515841`, equipe `11`, não tinha `playerId`. É uma evidência histórica; este recorte não confirma que a fonte ainda esteja assim.

O mesmo registro menciona atribuição de treinador pendente, mas não identifica todas as partidas afetadas. Consultar os treinadores de `19722185` não prova que não exista outra partida com pendência. O operador deve correlacionar os IDs do recibo de sincronização atual, sem inferir treinador pelo catálogo atual.

## Caminho já existente

1. `lib/football-data/fixture-provider-server.ts` usa `createConfiguredCentralFootballDataProvider`, sem fallback de quota para o banco de conteúdo.
2. `lib/football-data/central-provider-server.ts` vincula o worker já configurado à autoridade central, com admissão e conclusão. Flag ausente/desligada impede novas consultas oficiais.
3. `lib/football-data/providers/sportmonks.ts:getFixtureFantasyFeed` lê `/fixtures/{providerId}` com `participants;coaches;...;lineups.player;...`; o modo diagnóstico aceita orçamento de 5 segundos, uma tentativa e política própria de cache.
4. `lib/football-data/fixture-coach-attribution.ts` exige dois participantes e dois treinadores, `meta.participant_id` correspondente, `meta.coach_id === coach.id` e `meta.fixture_id === fixture.id`. Clube atual, nome ou evento não substituem esse vínculo da partida.
5. A autoridade central pode gravar os recibos de admissão/conclusão de quota. A leitura preparada não instancia cliente Supabase de conteúdo nem altera estatísticas, publicação, notas, saldo ou ranking.

Existe também o endpoint `app/api/football-data/provider-diagnostic/route.ts`, `scope=fixture`, restrito ao proprietário e à QA dedicada:

```text
/api/football-data/provider-diagnostic?scope=fixture&fixtureId=499756e3-cedc-43cc-8131-5c2eac95ea69
```

Ele usa a sessão já autenticada e `lib/football-data/fixture-read-diagnostic.ts`, valida competição/temporada canônicas antes da consulta e devolve apenas eventos/lineups normalizados. Limitações: não projeta treinadores e rejeita uma lineup sem identidade antes de devolver a lista; portanto serve como diagnóstico protegido, mas não basta para explicar a causa exata dos dois bloqueios. Não foi acessado neste lote; sua presença na candidata não confirma que já esteja publicado.

## Artefato executável separado

Arquivo: `artifacts/official-fixture-read-20261101/read-fixture-19722185.mjs`.

SHA256: `a22cc0998c04d6dbb645a2443f0e02c0323356e975c5df3b85e280e1503fe851`.

O padrão e `--inspect` somente imprimem o contrato estático, sem descobrir ambiente, importar a integração ou fazer rede. `--check-environment` informa presença/tipo das variáveis fixas, validações booleanas e somente hosts públicos; não importa a integração nem faz rede. `--check-loader` importa a implementação com `fetch` bloqueado e não constrói um provider. `--execute` exige configuração QA fornecida privadamente ao processo e o host da autoridade confirmado independentemente pelo operador. Não abre `.env`, não procura chaves, não imprime valores secretos, headers, URLs autenticadas, payload bruto ou mensagens de erro upstream.

Variáveis usadas por nome:

- `TOUCHLINE_QA_SUPABASE_PROJECT_REF` deve corresponder à QA dedicada.
- `NEXT_PUBLIC_SUPABASE_URL` é obrigatório e deve apontar exatamente para `https://xgxbwqxjssxxuihuwmgy.supabase.co`, sem credenciais, porta, consulta ou fragmento; o ref isolado não basta.
- `SPORTMONKS_API_TOKEN` deve já existir no processo autorizado.
- `TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED` deve ser `true`.
- `TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE`.
- `TOUCHLINE_SPORTMONKS_CENTRAL_URL`.
- `TOUCHLINE_SPORTMONKS_CENTRAL_WORKER_TOKEN`.
- `VERCEL_ENV=production` é recusado. `SPORTMONKS_BASE_URL`, se definido, deve ser o endereço oficial da API de futebol.

Não foi localizado um caminho atual verificável de ambiente QA privado. O root confirmou que a consulta anterior pode ter usado ambiente temporário/conector. **Não criar nem copiar segredos para este artefato.** As verificações do script não substituem a conferência pelo root de que o worker fornecido é o worker QA autorizado. O host de quota exibido pelo check também não é prova de autorização; `--execute` exige `--approved-authority-host=HOST_CONFIRMADO`, que deve coincidir com a configuração. Não preencher esse pin por cópia automática do próprio ambiente.

Comando preparado, a executar apenas dentro do processo já provisionado pelo mecanismo privado autorizado:

```sh
cd /Users/luizlopez/Documents/Codex/2026-09-05/touchline-prompt-formalizer/worktrees/qa-stripe-release-20261029
node --experimental-strip-types --conditions=react-server artifacts/official-fixture-read-20261101/read-fixture-19722185.mjs --execute --approved-authority-host=HOST_CONFIRMADO
```

O root verificou suporte da CLI Vercel 58.11 a `env run`. Comando de inspeção proposto, **ainda não executado por este agente**:

```sh
vercel env run -e preview --git-branch qa --project prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM --scope fifa-agent-plataform -- node artifacts/official-fixture-read-20261101/read-fixture-19722185.mjs --check-environment
```

Esse mecanismo injeta o ambiente no processo sem criar dotenv; a obtenção das variáveis pela CLI envolve rede com a Vercel. O modo `--check-environment` do artefato não faz chamadas à Sportmonks nem à autoridade. Confirmar o host autorizado de quota por evidência independente antes de substituir o modo por `--execute`; não inventar o host.

O operador pode guardar exclusivamente o JSON projetado em um recibo novo. Não passar tokens por argumentos, não executar `env`/`printenv`, não usar `curl -v`, não habilitar tracing de shell e não imprimir o erro bruto em caso de falha.

O transporte adicional do artefato permite apenas um GET ao fixture oficial indicado e POSTs de admissão/conclusão à autoridade já configurada. Não há retry do artefato, query direta paralela ou escrita em banco de futebol. O pacote real `server-only` é resolvido com a condição `react-server`; não se usa o stub dos testes.

## Projeção mínima e interpretação

Saída: IDs oficiais de fixture/league/season; nome/status; participantes; IDs/nomes e `meta` dos treinadores; resultado do normalizador existente; linha histórica pendente; demais lineups sem `player_id`; número de linhas; data de coleta/cache; contadores de tentativas/admissão/conclusão; hashes das fontes usadas. Estatísticas, respostas completas e credenciais não saem.

- Se a linha agora tiver `player_id`, registrar o ID oficial e depois validar seu vínculo canônico; não associar por semelhança de nome.
- Se a linha desaparecer, isso isoladamente não prova ausência esportiva nem autoriza zerar pontos: a completude do fornecedor continua não comprovada pela simples leitura.
- Se os vínculos de treinador vierem completos, o normalizador informa `complete`; ainda é necessário conferir persistência, mapeamento editorial e a execução integral da sincronização/publicação.
- Se a API ainda estiver incompleta ou a quota negar a consulta, preservar a pendência e o último estado válido. Não contornar o bloqueio publicando pontuação inventada.
- `ok: true` deste artefato significa leitura/projeção realizada. Não é autorização editorial, prova de completude estatística, recalculo ou validação de consumidores.

## Verificação efetivamente realizada

`node --check` passou (exit 0). `node ... --inspect` passou (exit 0), com `executed: false`. `node --experimental-strip-types --conditions=react-server ... --check-loader` passou (exit 0): resolução real dos imports validada, incluindo relativos sem extensão; `attemptedNetworkCalls: 0`, `providerConstructed: false`, `quotaAdmissionRequested: false`. Nenhuma execução `--execute` ou `vercel env run`; zero chamadas de rede neste lote. Fontes, testes de produto, políticas, SQL e configurações permanecem sem alteração por esta tarefa.

MISSÃO: preparar consulta oficial auditável. RESULTADO: comando e artefato revisáveis prontos. PENDENTE: obter o ambiente autorizado pelo mecanismo existente, executar uma vez, correlacionar a resposta oficial e só então decidir a correção. PRODUCTION: não tocada.
