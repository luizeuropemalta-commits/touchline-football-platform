# ClubOwner — classificação do header e pontos sazonais

Data local: 1 de novembro de 2026 (Europe/Malta). Recorte autorizado após o checkpoint do coordenador em `artifacts/local-card-integrity-20261031/checkpoint-before-ranking-20261101`. A proposta anterior `HEADER_RANKING_PATCH_PROPOSAL_2026-11-01.md` permanece como registro histórico do planejamento congelado; este documento registra sua aplicação local e a correção adicional comprovada.

## Missão e limite

CRITICAL ENGINEERING / leitura de classificação. Unificar a classificação exibida no header com a tabela pública, sem alterar notas, pontos persistidos, rodadas, contratos, planos, flags, dados pessoais, permissões ou contas. Não houve deploy, SQL remoto, migração, envio de e-mail, cobrança nem acesso à Production. Coordenador mantém CURRENT/LEDGER, auditoria global, commit, build, deploy e testes publicados.

## Causa e mudanças

1. O leitor legado do header só criava uma posição sazonal quando encontrava pontuação FINAL. A tabela pública já incluía participação/inscrição competitiva comprovada com zero e compartilhava posições nos empates. Agora ambos passam pela mesma leitura paginada e pelo mesmo projetor. As posições empatadas seguem 1, 1, 3; homônimos não identificam o dono da conta.
2. O auth ID permanece interno ao cálculo. A projeção pública devolve somente rank/name/touchlinePoints. A visão autenticada acrescenta somente isCurrentManager e usa score; não entrega IDs internos, e-mail, saldo ou contrato. O leitor público não devolve a visão personalizada.
3. A ausência de uma rodada ativa não elimina a classificação sazonal. O leitor pode receber gameweekId nulo, manter a temporada e não fabricar XI ou rodada.
4. Leitura quebrada, contagem alterada entre páginas, resultado parcial ou dados inválidos mantêm unavailable/sem posição. Uma inscrição inexistente não ganha uma linha zero sintética.
5. **Bug adicional comprovado:** a consulta privada de seasonScore não filtrava a fotografia imutável do plano da rodada. Em um histórico sintético com FINAL Beta 999, FINAL sem plano 999, Standard 10,25, VIP 1,25 e Standard PROVISIONAL 999, retornava **2.009,50**, enquanto a classificação competitiva correta era **11,50**. O teste antes da correção falhou exatamente por essa divergência. Acrescentado o mesmo filtro competitivo standard/pro/master/vip à leitura sazonal privada. FINAL continua obrigatório, a temporada e a conta continuam filtradas e erros de consulta continuam lançando TOUCHLINE_SEASON_SCORE_READ_UNAVAILABLE. Nenhum ponto gravado foi modificado.

6. **Truncamento de ranking da rodada, incluído por autorização adicional:** o leitor consultava toda a temporada sem paginação e filtrava a rodada em JavaScript. O teste com limite realista de 1.000 linhas comprovou a perda do participante atual após 1.000 antigos e o corte de 1.201 participantes atuais para 1.000. Agora a consulta filtra gameweek_id no servidor, usa páginas de 500 ordenadas por id com contagem exata e recebe identidade/score por joins na mesma consulta. Isso elimina também os cortes independentes das consultas de scores/users. Páginas parciais, contagem divergente, erro, duplicação e score inválido não publicam tabela parcial. A função de ordenação da rodada foi mantida: empates determinísticos com posição ordinal, enquanto a temporada mantém a política pública de posição compartilhada 1/1/3. Nenhuma regra de desempate foi alterada neste patch.

A leitura QA anterior de 41,19 provisórios e 0,00 sazonais permanece válida: não havia rodada FINAL dessa conta. Este patch não transforma pontos provisórios em definitivos.

## Manifesto exato

Três fontes de produto:

- `lib/touchlineArena/club-owner-standings.ts`
- `lib/touchlineArena/club-owner-standings-server.ts`
- `lib/touchlineFantasy/server.ts`

Sete arquivos de teste/harness:

- `tests/helpers/fantasy-ranking-projection.mts`
- `tests/touchline-club-owner-standings.test.mts`
- `tests/touchline-fantasy-competitive-ranking.test.mts`
- `tests/touchline-clubowner-nonretroactive-points.test.mts`
- `tests/touchline-fantasy-arena-projection.test.mts`
- `tests/clubowner-public-header.test.mts`
- `tests/touchline-fantasy-market-plan-policy.test.mts`

O harness executa os leitores reais de Fantasy e standings e o projetor real; a simulação implementa somente relações, filtros e paginação. Não mantém algoritmo de ranking alternativo. A página e o componente do header não foram alterados.

SHA-256 de cada arquivo e instante do congelamento: `artifacts/header-ranking-20261101/manifest.json`. Delta revisável contra HEAD: `artifacts/header-ranking-20261101/delta.patch`. HEAD de base `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694`; os WIPs do pacote não estão representados apenas por esse HEAD.

## Execuções e provas

| Gate | Resultado delimitado | Evidência |
|---|---|---|
| Reprodução limite PostgREST antes da paginação | 2 FAIL esperados: atual ausente e 1000 ≠ 1201 | `artifacts/header-ranking-20261101/round-pagination-before.log` |
| Reprodução Beta → pago antes do filtro | FAIL esperado: 2009.5 ≠ 11.5; 1 teste selecionado | `artifacts/header-ranking-20261101/season-beta-regression-before.log` |
| Focados finais serializados (8 arquivos) | 102 PASS, 0 FAIL, 0 SKIP | `artifacts/header-ranking-20261101/focused-final.log` |
| PGlite v4 raw-rating, runtime oficial local | 19 PASS, 0 FAIL, 0 SKIP; inclui ranking real após SQL de pontuação | `artifacts/header-ranking-20261101/pglite-v4.log` |
| TypeScript completo, binário instalado | exit 0, sem diagnósticos | `artifacts/header-ranking-20261101/typescript-direct.log` |
| ESLint nos 10 arquivos próprios | exit 0, sem diagnósticos | `artifacts/header-ranking-20261101/eslint.log` |
| Diff whitespace nos 10 arquivos | exit 0 | comando `git diff --check -- <manifesto>` |
| Revisão independente | publication_integrity_review revisou as duas etapas: sem achados bloqueantes; manifesto final entregue para vincular parecer | arquivos e hashes comunicados ao revisor |
| Browser/QA publicada | NÃO EXECUTADOS neste lote | permanece gate do coordenador |
| Full suite / build | NÃO EXECUTADOS após este patch por divisão de recursos do coordenador | não reaproveitar a suíte anterior como prova deste delta |

Os 41 testes da primeira rodada estão contidos nos focados posteriores; não somar. A primeira execução ampliada apontou duas falhas exclusivamente nas novas fixtures (config ausente no mock da página e comparação de Array de outro realm); fixtures corrigidas e os 94 casos reexecutados passaram. A ampliação de paginação adicionou 8 casos; uma expectativa antiga de source-order exigia uma segunda consulta de scores. Ela foi ajustada para a consulta com join e filtros antes de range, mantendo os testes funcionais reais, e os 102 casos passaram. Os logs acima são a última execução da respectiva rodada.

`pnpm exec tsc` tentou executar seu controle automático de dependências, falhou na consulta ao registry e abortou a instalação por ausência de TTY. Não foi autorizado nem executado install corretivo; o diretório node_modules foi preservado. O mesmo compilador já instalado foi executado diretamente com `node node_modules/typescript/bin/tsc --noEmit --incremental false`, resultando exit 0. O registro da tentativa de wrapper está em `typescript.log`.

Comandos finais:

```sh
node --test --test-concurrency=1 --experimental-strip-types tests/touchline-club-owner-standings.test.mts tests/touchline-fantasy-competitive-ranking.test.mts tests/touchline-clubowner-nonretroactive-points.test.mts tests/touchline-fantasy-arena-projection.test.mts tests/clubowner-public-header.test.mts tests/touchline-clubowner-market-header.test.mts tests/touchline-market-history-concurrency.test.mts tests/touchline-fantasy-market-plan-policy.test.mts
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js lib/touchlineArena/club-owner-standings.ts lib/touchlineArena/club-owner-standings-server.ts lib/touchlineFantasy/server.ts tests/helpers/fantasy-ranking-projection.mts tests/touchline-club-owner-standings.test.mts tests/touchline-fantasy-competitive-ranking.test.mts tests/touchline-clubowner-nonretroactive-points.test.mts tests/touchline-fantasy-arena-projection.test.mts tests/clubowner-public-header.test.mts tests/touchline-fantasy-market-plan-policy.test.mts
```

PGlite foi invocado pelo helper `releaseSqlEnvironment` de `scripts/release-sql-runtime.mjs`, fornecendo o runtime instalado, seguido de `node --test --test-concurrency=1 --experimental-strip-types tests/touchline-fantasy-v4-raw-rating-pglite.test.mts`. Apenas banco efêmero local; não foi carregado ambiente/credencial de aplicação.

## Pendências e próximo passo exato

- Parecer independente sem achados bloqueantes recebido; coordenador vincular o manifesto final e integrar ao gate global.
- Coordenador validar header e tabela /rankings da mesma temporada na candidata, incluindo QA2 com zero FINAL, depois cumprir suíte/build e deploy único.
- Na QA publicada confirmar posição consistente após refresh/navegação e ausência de IDs internos na resposta pública. Medir a latência: a fonte agora lê inscrições para refletir a política pública existente; nenhum cache de usuário foi introduzido.
- A tabela interna legada de Fantasy ainda usa o mesmo empty label para ausência e falha. O header preserva indisponível; um status tipado na tabela inteira não foi adicionado escondido neste recorte.
- A lacuna de paginação da rodada foi corrigida no mesmo lote após autorização adicional do coordenador; continua necessária a validação publicada dos leitores. Não declara auditoria de todos os rankings concluída.
- Social continua dependendo dos gates e do consentimento documentados em `AGENT_SOCIAL_ACTIVATION_READ_2026-11-01.md`. Não habilitado aqui.

## Mission Completion Gate — entrega parcial delimitada

**MISSION:** header/ranking sazonal com uma única projeção e total sazonal competitivo coerente.
**SCOPE:** três leitores/projetores e sete testes/harness; local apenas.
**QA BRANCH:** worktree qa-stripe-release-20261029, base detached 47ebfffbbda98cbb89bcd3ad08fb19efd1e50694.
**QA COMMIT:** delta não commitado.
**QA DEPLOYMENT:** nenhum neste lote.
**REMOTE BUILD BUDGET / CONSUMED:** 0 / 0 neste lote.
**STABLE QA URL:** https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
**FILES CHANGED:** manifesto acima + este relatório.
**FUNCTIONAL RESULT:** focados e SQL local aprovados nos limites descritos; não implica site todo aprovado.
**VISUAL / RESPONSIVE / ACCESSIBILITY:** nenhuma alteração de layout; SSR do header coberto; inspeção real da candidata/publicação ainda pendente.
**SECURITY RESULT:** IDs privados permanecem internos, sem escrita/permissão/credencial alterada; DTO público e homônimos testados.
**BROWSER MATRIX:** nenhum browser neste lote.
**TESTS:** 102 focados + 19 SQL separados, sem somar sobreposição com rodadas anteriores.
**BUILD:** pendente sob coordenação root.
**OBSERVABILITY:** logs e manifesto preservados; nenhuma alegação de logs remotos verificados.
**OPEN FINDINGS:** suite/build do pacote, validação candidata e QA publicada.
**PRODUCTION:** NOT TOUCHED.

| Ferramenta | Relevância / execução | Resultado e limite |
|---|---|---|
| Shell / Git | identidade, diff, hashes, fontes | leitura de WIP e manifesto; sem commit/push |
| Node / testes | funções reais, mocks relacionais, SSR | 102 focados delimitados |
| PGlite / runtime SQL oficial | integração SQL local e reader real | 19 PASS; não prova Supabase remoto |
| TypeScript / ESLint | análise estática do delta/pacote | exit 0 ambos |
| Supabase skill | segurança de leitura e cliente server-only consultada | nenhum MCP/SQL remoto nesta etapa |
| Vercel / Safari | não executados neste lote | continuam gates do coordenador |
