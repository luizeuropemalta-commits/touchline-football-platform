# TouchLine — recuperação dos cards existentes

**Data:** 11 de agosto de 2026
**Estado:** pipeline local parcialmente preparado; nenhuma aplicação de valor/tier ao banco foi realizada.

## Dados existentes

| Indicador | Total | Estado |
|---|---:|---|
| Linhas manuais recebidas | 558 | preservadas |
| Match exato manual ↔ Sportmonks | 538 | local |
| Match com EUR | 533 | pronto apenas após binding canônico |
| Match sem valor | 5 | PENDING |
| Só Sportmonks | 23 | QUARANTINED/PENDING |
| Só manual | 20 | REVIEW |

Os arquivos completos estão em [`owner-approved-transcript-2026-08-09`](../market-values/manual-2026-27/owner-approved-transcript-2026-08-09/).

## Regra central aprovada

```text
valor manual aprovado
→ identidade Sportmonks
→ UUID TouchLine
→ clube/membership ativa
→ classificador central
→ tier
→ moldura + neon
→ preço nominal
```

O nome digitado continua sendo referência humana e nunca pode substituir nome canônico, provider ID, UUID, clube, posição ou membership.

## Classificação e preço

As faixas existentes de [`card-rules.ts`](../../../lib/touchlineArena/card-rules.ts) são a única regra de conversão aceita:

| Tier | Faixa EUR | Preço nominal |
|---|---:|---:|
| Ruby Red | abaixo de 6M | £0 |
| Sapphire Blue | 6M–<10M | £1 |
| Amethyst Purple | 10M–<20M | £2 |
| Radiant Gold | 20M–<35M | £4 |
| Emerald Green | 35M–<50M | £7 |
| Clear Diamond | 50M–<70M | £10 |
| Diamond Gold | 70M ou mais | £15 |

Essas faixas não usam ranking, popularidade ou nome do clube.

## Regressão dos cards cinza

O componente compartilhado é [`TouchlineEliteExactCard.tsx`](../../../components/touchline/cards/TouchlineEliteExactCard.tsx).

O erro histórico foi tratar `pending` como se devesse anular toda a apresentação: sem tier, `cardTemplateUrl` também ficava nula e a moldura cinza substituía a arte. A correção deve sempre respeitar esta separação:

- **tier efetivo publicado/contrato ativo:** mantém a borda e o neon, mesmo que outra metadata esteja pendente;
- **sem classificação efetiva:** mantém estado honesto de revisão; não inventa Ruby, £0 ou tier colorido;
- **nenhum consumidor cria seu próprio tier no cliente:** todos usam o classificador central.

O asset de uma moldura não pode virar uma prova de tier/preço. Arte visual e classificação comercial precisam ser validadas separadamente.

## Componentes já preparados localmente

- [`owner-approved-market-value-binding.ts`](../../../lib/touchlineArena/owner-approved-market-value-binding.ts): valida binding determinístico de candidata e roster canônico.
- [`owner-approved-market-value-binding-runner.ts`](../../../lib/touchlineArena/owner-approved-market-value-binding-runner.ts): exige duas leituras/fingerprint estável.
- [`owner-approved-market-value-application-plan.ts`](../../../lib/touchlineArena/owner-approved-market-value-application-plan.ts): dry-run fail-closed para 533 linhas; ainda não escreve.
- [`editorial-card-profile.ts`](../../../lib/touchlineArena/editorial-card-profile.ts): contrato de perfil editorial, sem expor nota/fonte interna ao público.

Esses módulos não substituem a leitura remota canônica nem o futuro executor transacional.

## Antes de qualquer aplicação

1. gerar snapshot canônico somente-leitura de UUID + provider ID + clube + membership ativa;
2. rodar o binding em duas passagens e rejeitar diferença de revisão, duplicidade, transferência ou membership inválida;
3. gerar dry-run com nome de referência, nome canônico, IDs, clube, valor, tier atual/calculado, preço nominal, contrato e ação;
4. excluir 5 PENDING, 23 provider-only e 20 owner-only;
5. criar executor de lote único/atômico, com fingerprint e rollback; o importador genérico por linha não é suficiente;
6. obter autorização explícita de escrita e fazer verificação pós-escrita.

## Estado do bloco

- Dados: **PASS local**.
- Binding real: **BLOCKED** até fonte canônica somente-leitura.
- Aplicação de 533: **BLOCKED** até executor atômico + autorização.
- Correção compartilhada de apresentação: **em validação local**, nunca por patch de clube.
- Contratos ativos: **protegidos**; não devem ser reclassificados silenciosamente.
