# Capacidade para navegador isolado — revisão somente leitura

## Resultado delimitado

Há uma alternativa já implementada para o teste social focado: reserva de disco escolhida **por processo local no macOS**, sem editar a guarda e sem executar Next/build. A proposta é `TOUCHLINE_LOCAL_BROWSER_DISK_RESERVE_MIB=1024`, mantendo a verificação de memória ativa. Não é uma aprovação de execução sob qualquer pressão, nem medição do pico de consumo. Nenhum navegador ou teste foi iniciado nesta revisão.

O lançamento deve exigir pelo menos **1536 MiB disponíveis**, pressão do kernel **1**, memória livre **>=25%**, e exclusividade dos recursos para um navegador. Durante a execução, monitorar a cada aproximadamente 10 segundos e interromper o processo próprio se o disco atingir **1024 MiB**, a pressão deixar de ser 1 ou a memória livre cair abaixo de 25%. Não iniciar o próximo caso sem nova leitura. Não há monitor contínuo embutido na guarda atual: ela só valida quando chamada.

## Evidência atual

- Candidata: `qa-stripe-release-20261029`, HEAD `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694`, WIP compartilhado preservado.
- Primeira leitura `df -k`: **1.899.340 KiB = 1854,82 MiB**, aproximadamente 1,81 GiB.
- Nova leitura `statvfs`, em 2026-11-01T06:54:20Z: **1.883.353.088 bytes = 1796,11 MiB**, aproximadamente 1,75 GiB. Portanto o valor de 2,2 GiB informado anteriormente já não descreve esta janela.
- `memory_pressure` retornou **38%** livres.
- A primeira leitura de `sysctl` foi negada pelo sandbox; a repetição autorizada, somente leitura, retornou **pressão 1**. Nenhuma configuração foi alterada.
- Inventário de processos por `ps` foi negado pelo sandbox; não foi demonstrada ausência de processos concorrentes. O coordenador precisa preservar a exclusividade antes de executar.

Essas leituras não são simultâneas nem constituem garantia de estabilidade futura. A diferença de disco também inclui outras atividades do Mac.

## O que a guarda permite hoje

`tests/helpers/touchline-browser-capacity.mts` usa `statfs.bavail*bsize` e exige espaço estritamente maior que a reserva. Em macOS local, fora de CI, aceita `TOUCHLINE_LOCAL_BROWSER_DISK_RESERVE_MIB` entre 250 e 5120 MiB. Sem override, o padrão é 5 GiB; `allowLowDarwinDisk` seleciona 500 MiB. Linux e CI mantêm 5 GiB independentemente desse override local.

Existe outro override, `TOUCHLINE_LOCAL_IGNORE_MEMORY_GATE=1`, mas **não faz parte desta proposta**. A verificação de pressão precisa permanecer ativa. O teste social chama a guarda sem `darwinFreePercent`; por isso a pré-checagem operacional adicional precisa chamar a mesma guarda com `{ darwinFreePercent: true }` antes do teste.

O histórico deste lote já registra uso autorizado de 500 MiB no teste social (`artifacts/social-search-repair-20261101/browser-by-engine-receipt.json`), sem bypass de memória. A proposta de 1024 MiB mantém uma reserva maior. A autorização do usuário para reduzir bloqueios não transforma falha de recurso em PASS.

## Consumo conhecido e limites da estimativa

| Harness/evidência | Trabalho e armazenamento observados |
|---|---|
| `clubowner-public-browser.test.mts` | Um caso por engine; 8 fluxos por caso, 2 contextos por fluxo; fecha contextos e navegador; bundling em memória; nenhum Next, download de pacotes ou servidor real. WebKit grava 16 PNGs; não configura vídeo/trace. |
| Saída social antiga `touchline-public-owners-pyTuAb` | 1156 KiB alocados, aproximadamente 1,13 MiB, para capturas dos 24 fluxos. A execução foi cancelada por timeout: tamanho de saída não converte o resultado em PASS. |
| Ranking/pódio `touchline-ranking-podium-6pwhQo` | 3660 KiB alocados, aproximadamente 3,57 MiB, para JS/CSS/manifesto da fixture. |
| Ranking/zoom `touchline-ranking-zoom-LFbnnL` | 3456 KiB alocados, aproximadamente 3,38 MiB. |
| Compilador de ranking | Processo filho de TypeScript/PostCSS termina antes do Chromium; reduz sobreposição, sem build de Next. |
| Comparação histórica WebKit | Preflight de 23:41:30Z tinha 2.489.188 KiB livres; após tentativa, 23:44:04Z, 2.293.516 KiB. Queda sistêmica de 195.672 KiB, cerca de 191,09 MiB. Não mede pico nem atribui todo consumo ao browser. |

Os artefatos persistidos ocupam poucos MiB. **O pico de RAM, o perfil temporário do navegador e o crescimento de swap não foram medidos.** Não inferir que o consumo total equivale ao tamanho dos PNGs/JS. A reserva proposta é um limite operacional conservador para uma tentativa curta monitorada, não uma garantia de ausência de OOM.

Os testes de ranking/pódio e ranking/zoom lidos não chamam essa guarda por conta própria. Se forem escolhidos pelo coordenador, devem receber a mesma pré-checagem e monitoramento externo; configurar a variável sozinha não lhes adiciona proteção. Eles não comprovam a pontuação real da QA.

## Execução sugerida ao coordenador — não executada aqui

1. Confirmar exclusividade: nenhum outro browser de teste, PGlite, typecheck global, build ou suíte concorrente. Preservar as sessões abertas do usuário.
2. Conferir novamente disco >=1536 MiB, pressão 1 e memória >=25%. Se a pressão não puder ser lida, não substituir por suposição.
3. Usar o override apenas no processo do teste, mantendo `TOUCHLINE_LOCAL_IGNORE_MEMORY_GATE` ausente. Fazer pré-checagem com `requireBrowserCapacity(process.cwd(), { darwinFreePercent: true })`.
4. Executar **somente um caso de engine**, por exemplo `node --experimental-strip-types --test --test-concurrency=1 --test-name-pattern='in chromium$' tests/clubowner-public-browser.test.mts`, com `TOUCHLINE_RUN_CLUBOWNER_PUBLIC_BROWSER=1` e a reserva local de 1024 MiB. Não remover asserts, reduzir a matriz do caso ou reutilizar resultado de código anterior.
5. Monitorar o piso de 1024 MiB e os limites de memória durante a execução. Preservar logs/erro original se interrompido. Repetir os outros engines separadamente quando houver capacidade; casos filtrados continuam pendentes.
6. Para o social em evolução, congelar o manifesto final antes de rodar. Os tamanhos e resultados anteriores não cobrem código que outro agente ainda está alterando.

## Caches: apenas reconciliação do inventário

O inventário anterior listava quatro caches gerados de webpack/turbopack. O recibo `generated-cache-cleanup-20261101.json` registra a remoção desses quatro caminhos às 00:10:31Z. `generated-current-cache-cleanup-after-build-20261101.json` registra outra remoção delimitada às 02:23:03Z. Portanto, não somar esses caches como espaço recuperável ainda disponível e não repetir exclusões baseadas no inventário antigo. Esta revisão não removeu nada. Fonte, `.git`, `.env`, assets, runtime, navegador, iCloud e evidências continuam preservados.

## Fechamento da missão

MISSION: revisão de fonte do foco em recibos e capacidade de navegador isolado.
SCOPE: somente leitura de produto/ambiente; atualização de recibo e documentação próprios.
QA BRANCH / COMMIT: candidata detached mencionada acima; nenhum commit novo.
QA DEPLOYMENT: nenhum; REMOTE BUILD BUDGET / CONSUMED: 0 / 0.
STABLE QA URL: https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
FILES CHANGED: este relatório e `artifacts/coach-diagnostics-proposal-20261101/exchange-visual-final-review-20261101.json`.
FUNCTIONAL / VISUAL / RESPONSIVE / ACCESSIBILITY: correção `tabIndex={0}` do summary confirmada por fonte; teste de teclado posterior não executado aqui. Não é aprovação visual.
SECURITY: nenhum segredo, guard, flag, configuração persistente ou dado de conta alterado.
BROWSER MATRIX / TESTS / BUILD: não executados nesta missão.
OBSERVABILITY: fontes, recibos anteriores, leituras de disco/memória e hashes da revisão preservados.
OPEN FINDINGS: pico real de recursos não medido; exclusividade não demonstrada por `ps`; prova runtime e QA continuam separadas.
PRODUCTION: NOT TOUCHED.

| Ferramenta | Ação real | Resultado |
|---|---|---|
| Shell/Python | Leitura de fontes, recibos, hashes, df/statvfs/du | Inspecionado e delimitado acima |
| memory_pressure/sysctl | Diagnóstico somente leitura | 38% livres; pressão 1; primeira negativa de sandbox preservada |
| Playwright/Next/Supabase/Vercel | Não executados | Nenhum PASS ou mutação atribuído |
