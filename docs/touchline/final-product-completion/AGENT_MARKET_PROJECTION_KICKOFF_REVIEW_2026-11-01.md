# Revisão independente — alinhamento do mercado ao início da partida

## Estado atual após conciliação

A duplicata 091500 foi retirada pela raiz de `supabase/migrations` e preservada, byte a byte, em `artifacts/sync-read-followup-20261101/market-projection-regression-fixture.sql`. O teste aponta agora para esse artefato. Não há aplicação operacional pendente desta duplicata. A raiz confirmou por novo SELECT os hashes QA e9776c6f9df37360660a3e56e4a827d8 / a54aed23cad04215235eeef009a7072d; este agente não repetiu a consulta.

## Resultado histórico da revisão

Nenhum bloqueador concreto encontrado no delta revisado. Revisão somente de fonte; nenhum teste de produto, navegador, chamada remota ou alteração de banco executado por este revisor.

O forward `20261101091500_touchline_market_projection_kickoff_alignment.sql` contém exatamente o segmento da projeção histórica `20261002031429_touchline_fantasy_shared_market_window_projection.sql`, incluindo o REVOKE, após normalizar CREATE para CREATE OR REPLACE. Não redefine nem chama `touchline_fantasy_sync_gameweeks` e não atualiza pontos, elencos, calendário ou flags. Mantém SQL STABLE, SECURITY INVOKER e search_path vazio.

O teste focado reproduz o fechamento antecipado de cinco minutos e a reabertura atrasada, aplica o arquivo real, verifica abertura no apito final confirmado, fechamento no kickoff, sincronizador inalterado, reaplicação e EXECUTE negado para anon, authenticated e service_role. A execução de 1 PASS / 0 FAIL / 0 SKIP foi informada pela raiz; não foi repetida nesta revisão.

## Limites e entrega

- A prova focada não cobre todo o calendário nem os consumidores autenticados/publicados. Os testes históricos adicionais foram lidos, não executados.
- O REVOKE reproduz a fronteira privada histórica; o teste não compara todos os metadados pg_proc/OID/owner/ACL antes e depois. CREATE OR REPLACE preserva a identidade existente, mas permissões extraordinárias de outros papéis não fazem parte do cenário sintético.
- Este forward normal não incorpora guard de alvo QA/preimagem. Antes de aplicação, a raiz deve manter o destino e o mapeamento de versões. O forward QA guardado anterior `20261101052804` já aplicado não deve ser reaplicado sobre a projeção corrigida.
- Nenhum gate de release, QA publicada ou validação visual foi promovido por este recibo.

Recibo com hashes: `artifacts/release-gap-validation-20261031/market-projection-kickoff-independent-review-20261101.json`.

## Reconciliação posterior — evitar aplicação duplicada

O preflight com a margem de cinco minutos é anterior ao recibo de aplicação já existente. `QA_MARKET_TIMING_APPLIED_2026-11-01.md:3–7` registra a migration local `20261101052804` aplicada como versão remota `20261101053339`, com o SHA acima e pós-imagem e9776c6f9df37360660a3e56e4a827d8. O CURRENT_STATE já registra a correção em 7128 e o LEDGER em 6152; os blocos de preflight anteriores e a nova preparação 091500 não foram conciliados com esse evento.

A pré-imagem bruta está preservada com horário 02:35:57 UTC. O pós-flight remoto foi descrito no relatório de aplicação da raiz; não localizei um JSON bruto separado dessa resposta e não fiz nova consulta remota. Portanto, a conclusão é histórica/documental: há registro de aplicação bem-sucedida posterior ao preflight, não uma nova afirmação sobre o estado remoto atual. Não aplicar 091500 operacionalmente apenas por reler o preflight antigo.

Encadeamento, hashes e linhas conflitantes: `artifacts/release-gap-validation-20261031/market-projection-prior-application-reconciliation-20261101.json`. O manifesto de preparação anterior permanece preservado como registro histórico, sem ser silenciosamente transformado em recibo de aplicação.
