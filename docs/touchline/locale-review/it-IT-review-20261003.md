# Revisione pre-integrazione it-IT — 2026-10-03

## Verdetto

**BLOCKED para publicação; PARTIAL para qualidade textual estática.** O italiano
continua deliberadamente um catálogo `draft`, não uma língua de runtime. Esta é
uma revisão editorial por leitura de fonte, não uma validação nativa, humana,
renderizada ou em navegador.

Baseline observado: `HEAD d84d19181606baa898d468510d8e4750a2525d4f`.
Arquivos-base lidos e seus hashes de conteúdo:

| Arquivo | SHA-1 do conteúdo |
| --- | --- |
| `lib/touchlineArena/locale-catalogues/core-drafts.ts` | `b974a3879747300fe7245e189ff41342e7e45458` |
| `lib/touchlineArena/locale-catalogues/auth-drafts.ts` | `d38e2fe06cfa10245d3f4de4fdaec3efb908f59c` |
| `lib/touchlineArena/locale-catalogues/market-drafts.ts` | `80cd8b93c524f390ae4b9eb8e82cb91e87733a69` |
| `lib/touchlineArena/locale-catalogues/rankings-drafts.ts` | `4cc8538a24c7844a856e9be857b8d6a5672a844a` |

## Achados acionáveis

1. **[P1 — contrato de marca] `rankings-drafts.ts:17,44` não preserva dois
   nomes aprovados.** A coluna `it-IT` usa `ClubOwners` e traduz `ClubHub`
   para `Centro del club`. O contrato de oito idiomas exige a grafia exata de
   `ClubOwner` e `ClubHub` como termos protegidos. Direção mínima: manter
   `ClubOwner` (inclusive quando a frase exige plural, sem criar uma marca
   nova) e `ClubHub`; traduzir apenas a gramática ao redor deles. A mesma
   decisão deve ser reconciliada com as demais colunas do arquivo, mas esta
   revisão não as altera.

2. **[P1 — decisão do proprietário / texto de produto] `market-drafts.ts:10,
   21,41` conflita com a orientação atual caso esse catálogo venha a ser
   integrado a uma superfície pública.** `productName` restaura `Market
   Transfer`; `launchTestNotice` afirma que preços de cards permanecem visíveis
   e que contratos de teste custam `0 TC`; `touchlinePrice` expõe preço. O
   plano posterior determina `Market` para seleção de jogadores e não autoriza
   reintroduzir o título histórico, e a correção pública requerida remove
   preços de cards. Direção mínima: antes de consumir esse draft, separar os
   identificadores/nomes protegidos necessários de qualquer cópia visível e
   substituir/remover as chaves visíveis conforme a decisão de produto, sem
   alterar economia, APIs ou dados. O arquivo é draft e o plano registra que o
   getter legado ainda não possui consumidor produtivo; portanto isto não é
   evidência de exposição pública atual.

3. **[P2 — fluência dependente de contexto] `core-drafts.ts:106` usa
   `Totale TC selezionato`.** A leitura mais natural para o rótulo de uma soma
   de créditos seria `Totale dei TC selezionati` (ou um rótulo curto decidido
   pelo design, como `Totale TC`). Confirmar a semântica visual antes da troca:
   se `selezionato` qualifica o *totale*, a frase é defensável, mas é ambígua;
   se qualifica os créditos, requer plural. Não é seguro corrigir sem o local
   renderizado.

## Matriz de critérios

| Critério | Estado | Evidência e limite |
| --- | --- | --- |
| Integridade dos quatro drafts | PASS estático | `core`, `auth`, `market` e `rankings` expõem `it-IT`; são dados explícitos, sem importação de um catálogo inglês como fallback. Não executei testes. |
| Fluência, registro e vocabulário futebolístico | PARTIAL | A maior parte da coluna usa italiano consistente: `Formazione`, `Panchina`, `Portiere`, `Classifica`, `In diretta`, `Accedi`. Achado 3 requer decisão de contexto; esta revisão não afirma revisão nativa/humana. |
| Placeholders, parâmetros e plural | PASS estático limitado | Em `core`, `{incoming}`, `{outgoing}`, `{formations}`, `{count}` e `{total}` foram preservados nas mensagens italianas; `market` mantém as funções tipadas do catálogo de origem. Não houve execução para contagens, interpolação nem plural real. |
| Marcas e nomes protegidos | FAIL | `TouchLine`, `Market Transfer` onde tratado como nome histórico, `ClubOwner` em `core`, e nomes próprios analisados permanecem em geral literais. O achado 1 altera `ClubOwner`/`ClubHub`; o achado 2 exige a decisão posterior para título e preço. |
| Fallback inglês não intencional | BLOCKED por gate | `it-IT` é incompleto por design; normalizadores dos módulos existentes retornam EN/PT. Isto evita uma publicação falsa, mas significa que nenhuma UI pública recebe hoje a coluna italiana. |
| Módulos italianos existentes fora de Intro/Inbox/perfil | PASS estático limitado | Li `navigation-i18n`, `ambient-audio-i18n`, `market-position-i18n`, `public-error-i18n`, `site-accessibility-i18n`, `official-league-table-i18n`, `tables-presentation-i18n` e `match-centre-i18n`. Todos mantêm o status draft/normalização fechada ou, no caso da navegação, mantêm `ClubHub`, `Fantasy` e `Mercato` coerentes com a orientação atual. Sem renderização não há prova de contexto, ARIA, quebra de linha ou foco. |
| Runtime, persistência, acessibilidade e visual | BLOCKED | Não foram rodados testes, build, navegador, dispositivo, autenticação, persistência ou RTL. A matriz de release requer essas evidências antes de habilitar uma língua. |

## Não feito e próximos passos

- Nenhum catálogo, gate, resolver, teste ou código de produto foi modificado.
- Não foram avaliadas as frentes ativas de Intro, Inbox/notificações ou
  perfis, conforme o recorte.
- Após a correção editorial autorizada, executar os testes focados existentes
  e uma revisão independente de cópia; somente depois mapear os consumidores
  reais e fazer a matriz renderizada (desktop, tablet, telefone, estados de
  erro/vazio e persistência). Isto não abre o gate de `it-IT`.
