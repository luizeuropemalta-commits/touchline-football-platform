# Diagnóstico de treinadores — implementação local delimitada

Data: 2026-11-01. Subagente: `publication_current_data`. Candidata: `qa-stripe-release-20261029`, base `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694`.

**Verde local funcional; publicação e inspeção visual continuam pendentes.** O congelamento de fontes foi liberado pelo agente principal. A proposta anterior foi aplicada e ampliada para os dois pipelines. Nenhum ponto, catálogo, dado remoto, SQL, flag ou gate de publicação foi alterado.

## Resultado

O motivo confirmado pela reconciliação agora é preservado no fluxo Live e no fluxo de calendário: temporada indisponível, atribuição da partida pendente, identidade editorial pendente ou resultados indisponíveis. Transporte ambíguo e motivo desconhecido continuam não confirmados. Os gates existentes continuam recusando publicação nos mesmos casos.

O admin protegido recebe somente motivo fechado e contagens limitadas. Mostra explicação PT/EN e acesso ao catálogo quando há pendência editorial; não mostra IDs, payload bruto ou texto arbitrário do fornecedor. Recibos antigos sem o diagnóstico não recebem uma causa inventada.

## Manifesto dos arquivos de produto/teste

1. `lib/football-data/coach-reconciliation-diagnostic.ts` — parser compartilhado e resumo restrito.
2. `components/admin-coach-sync-diagnostic.tsx` — apresentação protegida PT/EN.
3. `lib/football-data/live-sync.ts` — motivo e recibo privado preservados.
4. `lib/football-data/fixture-schedule-store.ts` — paridade com Live.
5. `lib/football-data/fixture-schedule-sync.ts` — mantém diagnóstico no resultado e recibo persistido.
6. `app/(app)/admin/football-data/page.tsx` — lê a projeção privada e exibe o componente após proteção existente.
7. `tests/coach-reconciliation-diagnostic.test.mts` — parsers e falhas de confiança.
8. `tests/coach-reconciliation-pipelines.test.mts` — pipeline real de calendário em harness isolado.
9. `tests/admin-coach-sync-diagnostic.test.mts` — SSR, idiomas, autorização e ausência de IDs/raw.
10. `tests/touchline-live-sync-outcome.test.mts` — motivos exatos e publicação ainda bloqueada.
11. `tests/helpers/admin-football-page-fixture.mts` — suporte ao componente no harness existente.

Há WIP anterior na página e no helper; foi preservado. O patch inicial de seis arquivos e seu fingerprint são históricos: **não reaplicar o builder/patch antigo sobre a implementação presente**.

## Evidência

Comando focado, serial e sem serviço remoto:

```sh
node --test --test-concurrency=1 --experimental-strip-types \
  tests/coach-reconciliation-diagnostic.test.mts \
  tests/coach-reconciliation-pipelines.test.mts \
  tests/admin-coach-sync-diagnostic.test.mts \
  tests/touchline-live-sync-outcome.test.mts \
  tests/admin-football-live-sync.test.mts \
  tests/touchline-admin-football-language.test.mts
```

- Resultado após revisão independente: **113 PASS / 0 FAIL / 0 SKIP**, cerca de 20,2 segundos. A revisão identificou que envelopes com `ok` ausente/não booleano ou contraditório com `ranking.ok` poderiam apresentar uma causa como confirmada. O parser agora retorna diagnóstico não confirmado e contagens nulas nesses casos; o novo teste cobre seis variantes. Os predicados de publicação existentes permaneceram intactos.
- A execução anterior de 112 testes passou antes desse teste adicional. Não somar suas contagens à reexecução de 113.
- A primeira execução apresentou sete falhas no fixture sintético do harness de calendário: faltava `source` nas equipes e havia comparação de arrays entre contextos VM. Foram corrigidas no harness. Não somar os 105 sucessos iniciais ao resultado final.
- ESLint dos 11 arquivos: exit 0, sem erros/avisos.
- TypeScript restrito aos arquivos deste lote e `next-env.d.ts`: 12 entradas, zero diagnósticos nesses arquivos. As dependências foram resolvidas, mas seus diagnósticos foram excluídos. **Não é TypeScript global**.
- `git diff --check` dos seis arquivos rastreados deste lote: exit 0.
- Checklist React: componente servidor, sem estado/hook/efeito/fetch adicional; autorização precede leitura; labels/links presentes. Não equivale a inspeção de aparência, contraste ou aparelho real.

Logs: `artifacts/coach-diagnostics-proposal-20261101/focused-initial.log`, `focused-final.log`, `focused-after-review.log`, `eslint-focused.log`, `typecheck-focused.log`; executor restrito em `typecheck-focused.mjs`. Após o endurecimento do parser, `typecheck-after-review.log` confirmou novamente 12 entradas e zero diagnósticos restritos; `eslint-after-review.log` e `git diff --check` confirmaram exit 0 no delta. A revisão independente terminou sem bloqueador concreto remanescente; recibo em `independent-review-20261101.json` no mesmo diretório.

## Pendências preservadas

1. Gates globais pelo agente principal, após coordenação de recursos. A revisão independente deste lote foi concluída.
2. Build, publicação QA, leitura do recibo produzido no servidor e inspeção real PT/EN do admin.
3. Staging de treinadores ainda procura nome em `source.raw.coaches`, removido pela sanitização. Este lote explica a pendência, não fornece a identidade ausente.
4. Nome oficial e nomeação atual do treinador histórico 30314 continuam sem confirmação. Não remapear identidade nem associação atual por suposição.
5. Normalização editorial e publicação apenas histórica têm proposta separada em `AGENT_PRIVATE_COACH_IDENTITY_PROJECTION_2026-11-01.md`; protótipo isolado com 20 testes passou, sem integração no produto. Nenhum gate foi removido para liberar Live/pontos.

## Registro da missão

MISSION: diagnóstico real de reconciliação dos treinadores, com paridade Live/calendário.
SCOPE: parser, recibos privados, admin PT/EN e testes locais isolados.
QA BRANCH: candidata detached `qa-stripe-release-20261029`.
QA COMMIT: base `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694`; alterações não commitadas.
QA DEPLOYMENT: nenhum.
REMOTE BUILD BUDGET / CONSUMED: 0 / 0 neste lote.
STABLE QA URL: https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
FILES CHANGED: 11 arquivos acima e documentação/artefatos deste subagente.
FUNCTIONAL RESULT: 113 testes passaram; gates, placares e pontos preservados no harness.
VISUAL RESULT: não inspecionado em navegador; pendente.
RESPONSIVE RESULT: pendente.
ACCESSIBILITY RESULT: marcação SSR verificada; teclado/contraste/aparelhos pendentes.
SECURITY RESULT: autenticação mantida; resumo sem IDs/raw; parser fechado; nenhum acesso remoto neste lote.
BROWSER MATRIX: não executada por coordenação de recursos.
TESTS: 113 PASS / 0 FAIL / 0 SKIP; lint e TS restritos passaram, incluindo rechecagem após o último delta do parser.
BUILD: não executado; reservado ao principal.
OBSERVABILITY: diagnóstico estruturado e logs locais preservados.
OPEN FINDINGS: integração remota, visual, staging editorial e fonte oficial ausente.
PRODUCTION: NOT TOUCHED.

| Ferramenta / skill | Ação real | Resultado / evidência |
|---|---|---|
| Shell / Node / TypeScript / ESLint | Edição e verificações focadas | Logs no diretório de artefatos |
| Supabase skill | Fronteiras e fluxo SQL existentes revisados | Sem chamada/mutação remota neste lote |
| React best practices skill | Revisão do componente e página servidor | Sem fetch/estado adicional; UI real ainda pendente |
| Navegador / build / deploy | Não executados | Não reivindicados como PASS |

O agente principal recebeu o manifesto e resultados para conciliar `CURRENT_STATE.md` e o ledger sem edição concorrente desses documentos.
