# Inventário leve de caches TouchLine — 2026-11-01

Somente leitura. Inspecionados 34 diretórios TouchLine conhecidos (worktrees do projeto e diretórios imediatos `touchline*` em Developer), sem varredura de HOME, dados de Safari, iCloud, documentos pessoais, credenciais ou novos testes. Nenhuma remoção, processo encerrado ou configuração alterada.

| Candidato reproduzível | Tamanho alocado | Git / processo observado |
|---|---:|---|
| `/Users/luizlopez/Documents/Codex/2026-09-05/touchline-prompt-formalizer/worktrees/qa-final-20261027/.next/cache/webpack` | 706.06 MiB | `.next` ignorado; zero rastreados no cache pai; `lsof +D` sem descritores visíveis |
| `/Users/luizlopez/Developer/touchline-release-candidate-20261007/.next/dev/cache/webpack` | 300.18 MiB | `.next` ignorado; zero rastreados no cache pai; `lsof +D` sem descritores visíveis |
| `/Users/luizlopez/Developer/touchline-release-candidate-20261007/.next/dev/cache/turbopack` | 293.02 MiB | `.next` ignorado; zero rastreados no cache pai; `lsof +D` sem descritores visíveis |
| `/Users/luizlopez/Developer/touchline-qa-release-20261022/.next/dev/cache/webpack` | 392.39 MiB | `.next` ignorado; zero rastreados no cache pai; `lsof +D` sem descritores visíveis |

Total dos quatro candidatos: **1691.66 MiB (1.652 GiB)**. Apenas os três caches webpack somam 1,366 GiB; turbopack acrescenta 293,02 MiB. A medição é espaço alocado por `du`; liberação efetiva pode diferir em APFS e deve ser medida depois, se a remoção for autorizada/executada pelo agente raiz.

Os três caches pais encontrados: qa-final 706,07 MiB; release-candidate-20261007 599,07 MiB; qa-release-20261022 393,13 MiB. A candidata ativa tinha apenas 0,84 MiB e deve ser preservada. Preservar também `fetch-cache`, `images`, saídas de build além do cache, código, artes, dependências, arquivos Git e evidências.

`lsof` retornou exit 1, stdout/stderr vazios nos três caches pais e nos quatro candidatos; o snapshot de cwd não encontrou uso nos três checkouts. Isso indica **nenhum uso observado**, com os limites de visibilidade da ferramenta; não garante inatividade futura. Antes de qualquer remoção, o dono operacional deve confirmar que não há servidor/build nesses checkouts e repetir a checagem exata. Não precisa remover `.next` inteira.

A opção de menor alcance é o webpack de `qa-final-20261027` (706,06 MiB), já conhecido pelo agente raiz. Caso insuficiente e com inatividade confirmada, os outros dois webpack somam 692,57 MiB. O turbopack antigo é uma terceira opção reproduzível; não pressupor autorização por estar em cache. Os caches serão reconstruídos no próximo build/dev.

O snapshot inicial de `df` foi 1.846.916 KiB livres (~1,76 GiB), depois da interrupção relatada pelo agente raiz; não substitui o registro de 257 MiB no instante da falha. Recibo com medição final e caminhos: `artifacts/avatar-notifications-20261031/next-webpack-cache-inventory-20261101.json`.
