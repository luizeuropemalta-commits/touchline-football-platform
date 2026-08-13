# Liverpool — relatório forense do pipeline de cards

**Data:** 11 de agosto de 2026
**Escopo:** evidência local e contratos de código; nenhuma consulta ou escrita no banco foi realizada.

## Veredito

O Liverpool não deve ser usado como prova de um pipeline remoto saudável. Existe um SQL local, não rastreado no Git, que descreve uma importação manual de 29 jogadores e atualiza o tier do inventário de cards. Não há commit, log de migração remoto, export canônico recente ou leitura independente do banco que demonstre sua execução.

**Estado de execução remoto: INDETERMINADO.**

## Verificação complementar — 11 de agosto de 2026

Esta verificação foi limitada a arquivos e histórico Git locais. Não leu
credenciais, não consultou Supabase e não alterou banco, Vercel ou produção.

- A migration 050 está rastreada no repositório atual no commit
  `c74eb8ff` (`feat: add touchline market value engine`) e é alcançável por
  `origin/main` e pelos ramos de recuperação listados localmente.
- Os arquivos históricos `052_touchline_liverpool_manual_market_values_2026_08_07.sql`
  e `053_touchline_liverpool_market_value_read_model_source.sql` permanecem
  `??` no workspace de origem e `git log --all -- <arquivo>` não retorna
  commit para nenhum dos dois. Eles são instruções SQL locais, não prova de
  publicação nem de execução remota.
- A 052 contém 29 linhas Liverpool. Ela resolve o UUID *durante* a execução
  por nome + clube; não contém uma lista canônica já vinculada a UUID e não
  valida membership ativa da Premier League.
- A 053 pressupõe que as 29 linhas já foram semeadas e só atualiza um campo
  de origem do inventário. Ela também não é evidência de execução.

### Comparação verificável com o lote dos 20 clubes

O manifesto local datado do lote dos 20 clubes declara exatamente:

| Estado | Quantidade | Pode publicar/aplicar agora? |
| --- | ---: | --- |
| Linhas fornecidas pelo owner | 558 | Não diretamente |
| Correspondências exatas owner ↔ Sportmonks | 538 | Ainda não |
| Com valor EUR e à espera de UUID/membership canônicos | 533 | Não |
| Correspondências sem valor | 5 | Não; permanecem pendentes |
| Somente no provider | 23 | Não; permanecem pendentes/quarentenadas |
| Somente na lista manual | 20 | Não; revisão humana |

Cada uma das 533 linhas tem `provider_player_id`, `provider_team_id`, valor
EUR e hash de idempotência, mas não tem UUID TouchLine nem UUID de membership
ativa. O status no manifesto é
`LOCAL_PLAN_ONLY_REQUIRES_CANONICAL_UUID_BINDING` e
`applicationEligible: false`.

**Gate obrigatório:** produzir primeiro um snapshot canônico somente-leitura
com UUID de jogador, UUID de clube, UUID de membership ativa, clube atual,
competição 8 e revisão estável em duas leituras. Só então o planejador local
pode produzir uma revisão de 533 linhas. Isto não autoriza escrita; a escrita
requer um executor atômico separado, autorização explícita e rollback.

## Evidência encontrada

Arquivo: [`052_touchline_liverpool_manual_market_values_2026_08_07.sql`](../../../../../../../2026-06-22/build-phase-1-of-a-premium/supabase/migrations/052_touchline_liverpool_manual_market_values_2026_08_07.sql).

- Está como arquivo não rastreado (`??`) no workspace histórico; não há commit que o contenha.
- Cria uma tabela temporária com 29 nomes e valores EUR.
- Resolve cada linha por `football_players.name` e `football_players.current_club_id`, exigindo `club.name = 'Liverpool FC'`.
- Interrompe se a resolução não resultar em exatamente 29 jogadores.
- Interrompe se algum dos jogadores tiver contrato ativo.
- Faz upsert em `football_player_market_values`, adiciona histórico/auditoria e, para inventário `published` / `available`, escreve `competition_tier` segundo as faixas aprovadas.

O script não contém UUIDs pré-listados. O UUID seria obtido no banco durante o `join`. Portanto, ele não pode ser copiado para outros clubes como se fosse uma lista de IDs já comprovada.

## Golden reference pretendida

O caminho descrito pelo SQL é:

```text
nome manual
  → football_players.name + current club Liverpool
  → player UUID + Sportmonks provider_player_id
  → valor manual
  → tier calculado
  → inventory.competition_tier (somente published/available)
  → asset da moldura + paleta neon
  → card renderizado
```

Os limites são igualmente importantes:

- não há prova de membership ativa da competição nessa resolução;
- o nome manual participa da identidade, quando no pipeline novo ele deve ser apenas referência de busca;
- o tier foi gravado no inventário, acoplando valor/manual e aparência comercial;
- não há prova de que os 29 valores, tiers ou cards estejam no banco de produção atual.

## Por que a aparência parecia correta

Quando um `competition_tier` efetivo chega ao card, [`TouchlineEliteExactCard.tsx`](../../../components/touchline/cards/TouchlineEliteExactCard.tsx) usa [`card-rules.ts`](../../../lib/touchlineArena/card-rules.ts) para selecionar a arte de clube/tier e a paleta neon. Assim, um card Liverpool com tier materializado recebe moldura e neon imediatamente.

Isso é uma explicação de código, não uma confirmação de que a fonte era o banco remoto. Uma Preview antiga ou um asset visual local pode produzir aparência semelhante.

## Comparação com os 19 clubes restantes

O candidato de 9 de agosto possui 533 valores EUR com correspondência exata manual ↔ Sportmonks. Ele ainda não contém UUID TouchLine nem prova de membership ativa. A diferença fundamental é:

| Liverpool SQL antigo | Candidato atual dos 19 clubes |
|---|---|
| resolve por nome + clube dentro de uma transação de um clube | tem provider ID e clube, mas aguarda UUID/membership canônicos |
| aplica valor/tier se for executado | é explicitamente `applicationEligible: false` |
| sem commit/prova de execução | artefatos versionados localmente, mas sem leitura remota final |
| 29 linhas | 533 linhas com EUR; 5 PENDING, 23 provider-only, 20 owner-only |

## Decisão técnica

Não copiar a lógica Liverpool. O pipeline aceito deve ser:

```text
valor manual aprovado
  → provider_player_id Sportmonks
  → UUID TouchLine
  → clube atual + membership ativa
  → classificador central
  → tier / preço nominal / moldura / neon
```

Para confirmar o Golden Reference real, ainda é necessário um snapshot canônico somente-leitura que contenha UUID, provider ID, clube atual, competição e membership ativa. Nenhuma escrita deve ocorrer antes disso.
