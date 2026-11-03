# Reconciliação dos 90 skips — 01/11/2026

## Resultado delimitado

O indexador foi corrigido e executado sem iniciar navegadores, testes do produto, build ou operação remota. Ele agora usa o arquivo do teste, hash do teste, log, hash do log, comando, ambiente, snapshot e resultado contidos **no mesmo recibo**. Não junta um log pelo título com um manifesto independente.

Unidade de contagem: cada um dos 90 casos principais originalmente ignorados. Engines, tentativas repetidas e subtestes não aumentam essa contagem.

| Classificação atual | Casos, sem sobreposição |
|---|---:|
| Execução local vinculada, título exato e hash atual do arquivo de teste | 38 |
| Tentativas vinculadas que não comprovam o caso | 28 |
| Apenas logs históricos positivos, sem vínculo completo de execução | 23 |
| Sem execução vinculada ou log positivo exato localizado | 1 |
| Total | 90 |

São **38 comprovados localmente no escopo restrito + 52 pendentes**. Nenhum dos 90 recebe aprovação de lançamento por esta reconciliação. O último grupo é o caso 90, utilitário Swift; ausência de recibo localizado não prova que nunca foi executado.

Separadamente, 309 objetos de recibo, incluindo cópias do relatório consolidado, foram deduplicados em 114 invocações. Destas, 41 têm execução positiva íntegra e 73 não passam pelos critérios. As 41 invocações cobrem 38 casos; estes números não devem ser somados.

## O que mudou no critério

O resultado anterior era 22 casos com “log positivo + hash de manifesto”, 40 com log sem hash correspondente e 28 sem log positivo. Os 22 foram preservados integralmente no histórico. Como seus hashes e logs não estavam vinculados no mesmo recibo, agora ficam no grupo dos 23 registros históricos sem prova completa. Isso não apaga os testes anteriores nem afirma que falharam: corrige a força atribuída à evidência.

Os recibos de `serial-plan-runs` e os objetos completos de `BROWSER_COMPLETION_REPORT_20261101.json` são lidos individualmente. Uma cópia repetida do mesmo recibo não conta duas vezes. Versões conflitantes para o mesmo log são recusadas. Campo ausente não equivale a `null` ou `false` registrados.

Para admitir um caso, o indexador confere:

- caminho exato do teste, comando de execução e entrada correspondente no plano preservado;
- identidade da invocação derivada do hash do plano, teste, argumentos, ambiente e fingerprint do runtime;
- hash atual do arquivo de teste e hash do log efetivamente preservado;
- saída zero, status PASS, sem sinal, timeout, interrupção, erro de spawn ou drift registrado;
- totais completos do próprio log iguais aos do recibo, sem falhas, skips, cancelamentos ou TODO;
- título completo de sucesso no nível principal, sem aproximação, sufixo, alias ou subteste;
- estabilidade dos hashes dos arquivos de teste durante a leitura desta reconciliação.

Um hash atual do teste **não comprova** que todos os módulos, CSS, imagens, assets ou runtime importados continuam iguais. `fullDependencyFingerprintVerified` permanece `false`. `internal-matrix` não é expandido em engines por suposição. PASS em Chromium não fecha falha em WebKit. Não há aprovação de Safari nativo, iPhone físico ou QA publicada.

## Evidência e reprodução

Diretório: `artifacts/release-gap-validation-20261031/`.

- `skip-coverage-current.json`: partição dos 90 casos e vínculos para todas as tentativas.
- `skip-linked-receipts.json`: fontes indivisíveis, hashes, comando, ambiente, plano, estado e motivos de recusa.
- `skip-coverage-summary.json`: contagens, hashes dos recibos de entrada e limites de prova.
- `SKIP_COVERAGE_CURRENT.md`: índice legível dos 90 casos.
- `skip-reconciliation-checkpoint-20261101.json`: manifesto dos arquivos próprios e checkpoint.
- `skip-reconciliation-synthetic-tests-20261101.log`: **23 testes sintéticos PASS, 0 FAIL**, somente arquivos temporários de recibos/logs; nenhuma execução de produto.
- `skip-reconciliation-execution-20261101.log`: execução real do indexador.

Comandos, a partir da candidata:

```sh
python3 -B artifacts/release-gap-validation-20261031/test_skip_coverage_reconciliation.py
python3 -B artifacts/release-gap-validation-20261031/index-skip-coverage.py
```

Os casos sintéticos cobrem hash divergente, log alterado, falha/skip/cancelamento/TODO, títulos parecidos, subtestes, resumo duplicado ou incoerente, outro arquivo com o mesmo título, recibos parciais que não podem ser combinados, conflito de cópias, campos ausentes, comando/ambiente/engine diferentes, escape por caminho/symlink, duplicação entre relatório e recibo individual, preservação histórica e contagem por caso.

Antes da alteração, o script e as saídas originais foram copiados, com hashes, para `reconciliation-history/20261101T090306Z/`. Cada nova execução do indexador também preserva as saídas anteriores antes de substituí-las. Os recibos de execução originais não foram alterados.

## Próxima ação

Para os 23 históricos, localizar um recibo original que ligue teste, log e execução ou planejar nova execução proporcional quando houver capacidade. Não criar retrospectivamente uma alegação de hash no momento da execução. Para os 28 com tentativas não comprovadas, usar os motivos e logs individuais antes de escolher um retry; falha de launcher/guard não é automaticamente defeito visual. Antes de reutilizar os 38 locais na candidata final, validar dependências e completar os gates de integração e release.

Revisão independente do indexador solicitada ao agente `conditional_browser_completion`; recibo será ligado ao checkpoint quando concluída. Não foi solicitado novo browser.

## Registro de entrega

MISSION: corrigir a reconciliação documental de evidência dos 90 skips.

SCOPE: somente artefatos próprios e este relatório; fontes de produto/testes de produto preservados.

QA BRANCH/COMMIT: candidata compartilhada `qa-stripe-release-20261029`, HEAD registrado no manifesto; WIP preservado; nenhum commit.

QA DEPLOYMENT / REMOTE BUILD BUDGET CONSUMED: nenhum deployment ou build remoto.

FUNCTIONAL RESULT: indexador executado, 23 provas sintéticas aprovadas e partição exata de 90 casos; provas de produto não ampliadas.

VISUAL/RESPONSIVE/ACCESSIBILITY/BROWSER MATRIX: não aplicável à mudança documental; nenhum novo PASS visual.

SECURITY: sem leitura de segredo, acesso remoto, alteração de conta, consentimento ou dados; caminhos e hashes dos recibos verificados.

TESTS/BUILD: testes sintéticos do reconciliador e compilação sintática Python; TypeScript/ESLint/build de produto não executados porque não houve alteração de produto.

ROLLBACK: recuperar o script e as saídas da cópia preservada; manter todos os recibos originais e a trilha de reconciliação.

PRODUCTION: NOT TOUCHED.
