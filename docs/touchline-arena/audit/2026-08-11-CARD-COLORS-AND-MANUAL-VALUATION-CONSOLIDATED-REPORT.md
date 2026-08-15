# Relatório consolidado — cards, cores e dados manuais dos 20 clubes

**Data:** 11 de agosto de 2026
**Estado:** diagnóstico e dados locais; nenhuma aplicação de valores ao banco foi executada por este trabalho.
**Objetivo:** separar fatos comprovados, artefatos locais e a rota segura para restaurar a aparência premium dos cards sem inventar dados.

## Resposta curta

O visual colorido do card não é um arquivo que “sumiu”. Ele depende de uma decisão de apresentação: quando o componente recebe um *tier*, escolhe uma moldura existente do clube e a paleta do neon. Quando o card entra como `pending`/sem classificação, uma alteração posterior anulou o tier e a URL da moldura; o componente então desenha a moldura cinza neutra.

O Liverpool pareceu correto porque existe um script local de 7 de agosto com 29 valores manuais e uma atualização de `competition_tier` para os cards publicados. Esse script, porém, está **fora do Git** e não há prova independente de que tenha sido aplicado ao banco remoto. Ele é uma referência de intenção, não evidência de execução em produção.

Para os outros clubes há 533 valores manuais já conciliados por nome/ID do Sportmonks, mas eles ainda não foram ligados com segurança ao UUID canônico do TouchLine e à membership ativa. Por isso não foram gravados. Não é falta de nomes ou de valores: é a última prova de identidade antes de uma escrita irreversível.

## Como um card recebe cor hoje

O componente compartilhado é [`TouchlineEliteExactCard.tsx`](../../../components/touchline/cards/TouchlineEliteExactCard.tsx). Ele é reutilizado por ClubHub, Arena, perfil de jogador, ClubOwner e tabelas.

1. O sistema recebe um `tier` do card.
2. [`card-rules.ts`](../../../lib/touchlineArena/card-rules.ts) escolhe a paleta canônica do tier e a arte do clube/tier em `public/touchlineArena/cards/templates/`.
3. A moldura usa essa arte; o traço neon usa a cor da paleta do tier; o escudo usa o `accent` canônico do clube.
4. Sem tier publicado, o componente atual marca o card como neutro. No caminho que causou a regressão, `marketTier` virou `null`, `cardTemplateUrl` ficou nula e a moldura cinza foi renderizada.

Portanto, a cor do **escudo** vem do clube; a cor da **moldura/neon** vem do tier. Não é o Sportmonks que pinta o card diretamente.

## O que foi diferente no Liverpool

O arquivo local [`052_touchline_liverpool_manual_market_values_2026_08_07.sql`](../../../../../../../2026-06-22/build-phase-1-of-a-premium/supabase/migrations/052_touchline_liverpool_manual_market_values_2026_08_07.sql) contém a seguinte receita:

- 29 jogadores do Liverpool com valor manual em EUR;
- união por `football_players.name` **e** `current_club_id` do Liverpool;
- falha se não resolver exatamente os 29 nomes;
- gravação de valor, histórico e auditoria de importação;
- atualização do `competition_tier` no inventário de cards já publicados/disponíveis, usando sete faixas de valor;
- nenhuma alteração de contrato ativo permitida pelo próprio script.

Isso explica por que ele parecia “pronto”: o tier foi materializado no inventário e a moldura/neon passaram a ter uma paleta para usar.

### Limites importantes do caso Liverpool

- O arquivo está marcado como `??` (não rastreado) no repositório em que foi encontrado; não aparece em nenhum commit local acessível.
- Não há registro versionado que prove a execução no banco, nem uma consulta remota independente que confirme as 29 linhas.
- O script faz correspondência por nome + clube, não por UUID pré-listado. Essa checagem é razoável para um único clube, mas não é uma base suficiente para copiar cegamente para 19 clubes sem uma revisão global de duplicidades, transferências e membership ativa.
- Ele também atualiza `touchline_card_inventory`. Isso mistura a apresentação comercial com um valor manual; é justamente o acoplamento que fez uma alteração posterior mexer no visual de outros cards.

Em resumo: o Liverpool mostrou uma boa **aparência**, mas o procedimento não está em condição auditável/repetível para os demais clubes.

## Dados disponíveis agora

### Resultado da conciliação local

| Grupo | Quantidade | Estado |
|---|---:|---|
| Linhas manuais recebidas | 558 | arquivo completo preservado |
| Correspondências exatas manual ↔ Sportmonks | 538 | local, somente revisão |
| Com valor EUR preenchido | 533 | aguardam vínculo UUID/membership canônica |
| Correspondências sem valor | 5 | PENDING, excluídas de qualquer escrita |
| Sportmonks sem linha manual correspondente | 23 | PENDING/QUARANTINED |
| Linhas manuais sem correspondente Sportmonks | 20 | REVIEW |
| Grupos ambíguos de nome | 0 | na conciliação local |

O candidato declara explicitamente `applicationEligible: false` e `LOCAL_PLAN_ONLY_REQUIRES_CANONICAL_UUID_BINDING` em [`application-manifest.json`](../market-values/manual-2026-27/owner-approved-transcript-2026-08-09/application-candidates/2026-08-09T19-25-39-089Z/application-manifest.json).

### Cobertura por clube

`Fornecedor` é o elenco do snapshot Sportmonks; `exato` é a conciliação local; `com valor` é a parte pronta para ser vinculada a UUID; as três últimas colunas **não serão aplicadas automaticamente**.

| Clube | Fornecedor | Exato | Com valor | Sem valor | Só fornecedor | Só manual |
|---|---:|---:|---:|---:|---:|---:|
| AFC Bournemouth | 29 | 28 | 28 | 0 | 1 | 3 |
| Arsenal FC | 29 | 28 | 28 | 0 | 1 | 1 |
| Aston Villa | 26 | 26 | 26 | 0 | 0 | 1 |
| Brentford FC | 33 | 33 | 32 | 1 | 0 | 0 |
| Brighton & Hove Albion | 31 | 30 | 30 | 0 | 1 | 0 |
| Chelsea FC | 41 | 41 | 39 | 2 | 0 | 0 |
| Coventry City | 27 | 27 | 27 | 0 | 0 | 0 |
| Crystal Palace | 28 | 28 | 28 | 0 | 0 | 1 |
| Everton FC | 23 | 23 | 23 | 0 | 0 | 1 |
| Fulham FC | 22 | 21 | 21 | 0 | 1 | 0 |
| Hull City | 28 | 22 | 22 | 0 | 6 | 5 |
| Ipswich Town | 31 | 28 | 28 | 0 | 3 | 3 |
| Leeds United | 27 | 26 | 26 | 0 | 1 | 1 |
| Liverpool FC | 29 | 0 | 0 | 0 | 0 | 0 |
| Manchester City | 32 | 31 | 31 | 0 | 1 | 0 |
| Manchester United | 33 | 28 | 27 | 1 | 5 | 2 |
| Newcastle United | 26 | 25 | 24 | 1 | 1 | 1 |
| Nottingham Forest | 28 | 28 | 28 | 0 | 0 | 0 |
| Sunderland AFC | 31 | 30 | 30 | 0 | 1 | 0 |
| Tottenham Hotspur | 36 | 35 | 35 | 0 | 1 | 1 |

**Por que Liverpool mostra zero nesta tabela?** Os 558 dados manuais de 9 de agosto cobrem 19 clubes e tratam Liverpool como o caso manual separado de 7 de agosto. Não significa que os 29 atletas do Liverpool não estejam no Sportmonks; significa que esse conjunto não foi misturado ao candidato de 533, justamente para não duplicar uma execução manual alegada e não comprovada.

## Anexos integrais: nomes, clubes e valores

Estes arquivos são o registro completo, sem resumo e sem valores inventados:

1. [558 linhas manuais: clube, atleta, valor EUR, IDs e status](../market-values/manual-2026-27/owner-approved-transcript-2026-08-09/owner-approved-market-values-2026-08-09.csv).
2. [538 correspondências exatas, incluindo as 533 com EUR](../market-values/manual-2026-27/owner-approved-transcript-2026-08-09/application-candidates/2026-08-09T19-25-39-089Z/matched-owner-values.csv).
3. [Elenco completo Sportmonks: 590 atletas dos 20 clubes, com nome, ID, posição e camisa; sem valor de mercado](../market-values/manual-2026-27/owner-approved-transcript-2026-08-09/provider-roster-audits/2026-08-09T19-11-27-889Z/sportmonks-roster-snapshot.json).
4. [23 atletas só do Sportmonks — PENDING, sem valor manual](../market-values/manual-2026-27/owner-approved-transcript-2026-08-09/application-candidates/2026-08-09T19-25-39-089Z/provider-only-quarantined-pending.json).
5. [20 atletas só da lista manual — REVIEW, sem aplicação](../market-values/manual-2026-27/owner-approved-transcript-2026-08-09/application-candidates/2026-08-09T19-25-39-089Z/owner-only-review.json).

### Os 5 correspondentes sem valor manual

| Clube | Atleta | ID Sportmonks | Estado |
|---|---|---:|---|
| Newcastle United | Leo Shahar | 37594985 | PENDING |
| Chelsea FC | Mykhaylo Mudryk | 9938919 | PENDING |
| Chelsea FC | Denner | 37778829 | PENDING |
| Brentford FC | Julian Eyestone | 37643341 | PENDING |
| Manchester United | Dermot Mee | 28912799 | PENDING |

### Os 23 atletas Sportmonks sem valor manual

| Clube | Atleta | ID Sportmonks |
|---|---|---:|
| Fulham FC | Saša Lukić | 130248 |
| Ipswich Town | Issahaku Fatawu | 37560897 |
| Ipswich Town | Wes Burns | 6067 |
| Ipswich Town | Sammie Szmodics | 8740 |
| Manchester United | Radek Vitek | 31625938 |
| Manchester United | Tyler Fredricson | 37581768 |
| Manchester United | S. Lacey | 37665753 |
| Manchester United | T. Fletcher | 37678829 |
| Manchester United | Altay Bayındır | 438751 |
| Arsenal FC | Christian Nørgaard | 31609 |
| Newcastle United | Bruno Guimarães | 459145 |
| Hull City | Patrick James Coleman McNair | 1001 |
| Hull City | Thimothee Lo-Tutala | 31238169 |
| Hull City | Elliot Stroud | 37261082 |
| Hull City | Mason Burstow | 37563931 |
| Hull City | Oliver McBurnie | 4746 |
| Hull City | Babajide David Akintola | 85228 |
| Sunderland AFC | Ahmed Abdullahi | 37660283 |
| AFC Bournemouth | Eli Kroupi | 37632336 |
| Tottenham Hotspur | Minhyeok Yang | 37700504 |
| Leeds United | Charlie Crew | 37604648 |
| Brighton & Hove Albion | Facundo Buonanotte | 37568149 |
| Manchester City | James Trafford | 28575686 |

### Os 20 atletas só da lista manual

| Clube | Atleta | Estado |
|---|---|---|
| Newcastle United | Lukas Hornicek | REVIEW |
| Tottenham Hotspur | Min-hyeok Yang | REVIEW |
| AFC Bournemouth | António Silva | REVIEW |
| Ipswich Town | Saša Lukić | REVIEW |
| AFC Bournemouth | Junior Kroupi | REVIEW |
| Manchester United | Tyler Fletcher | REVIEW |
| Ipswich Town | Abdul Fatawu | REVIEW |
| Aston Villa | Brian Madjo | REVIEW |
| Hull City | David Akintola | REVIEW |
| Ipswich Town | Florentino | REVIEW |
| Hull City | Paddy McNair | REVIEW |
| Crystal Palace | Takehiro Tomiyasu | REVIEW |
| Hull City | Oli McBurnie | REVIEW |
| AFC Bournemouth | Juanlu Sánchez | REVIEW |
| Hull City | Konstantinos Tzolakis | REVIEW |
| Leeds United | James Trafford | REVIEW |
| Everton FC | Christian Nørgaard | REVIEW |
| Hull City | Jens Hjertø-Dahl | REVIEW |
| Arsenal FC | Bruno Guimarães | REVIEW |
| Manchester United | Shea Lacey | REVIEW |

## Por que os 533 não foram ligados ao banco

Cada valor só pode ser gravado se houver, ao mesmo tempo:

1. o `provider_player_id` correto do atleta;
2. o UUID `football_players.id` correto no TouchLine;
3. clube atual igual ao clube esperado;
4. exatamente uma membership ativa no elenco/campeonato correto;
5. uma leitura estável em duas passagens, para impedir que uma transferência ou sincronização no meio do processo gere um vínculo errado;
6. executor atômico: os 533 entram juntos ou nenhum entra.

Os candidatos locais têm os itens 1 e o nome/clube, mas não possuem a prova remota dos itens 2–5. O importador antigo do projeto faz `upsert` jogador a jogador, não é transacional para 533 linhas e não valida membership. Usá-lo agora pode deixar um lote parcial ou associar o valor ao UUID errado.

## O que já funcionou e o que não funcionou

| Tema | Funcionou | Não funcionou / risco |
|---|---|---|
| Arte e neon | As artes de todos os clubes/tiers já existem no repositório; a paleta é centralizada. | A lógica de pendência desligou a moldura artística e colocou o fallback cinza. |
| Liverpool | O script local descreve um lote de 29 e a regra de 7 tiers. | Não está versionado e não prova execução remota; não é repetível/seguro para os outros 19. |
| 19 clubes manuais | 533 valores possuem match exato de fornecedor e valor EUR. | Ainda falta UUID canônico + membership ativa; não foram escritos. |
| Sportmonks | Snapshot de 590 atletas, 20 clubes, IDs/posições/camisas. | Não contém UUID TouchLine nem valor manual; não deve decidir preço/tier público. |
| Publicação recente | O domínio foi restaurado para a versão anterior estável após a regressão visual. | A candidata editorial/visual não deve voltar ao ar sem QA de Liverpool, ClubHub e Quick Sub. |

## Minha recomendação independente (como ChatGPT)

Não recomendo copiar a migration do Liverpool para 19 clubes. Ela usa uma premissa de correspondência por nome e altera tier de inventário junto com valor; em escala isso torna difícil detectar jogadores transferidos, nomes parecidos e estado de contrato.

### Rota em duas etapas — a mais segura e mais simples para o produto

**Etapa 1 — restaurar o visual sem dados econômicos.**

- Separar `visualTemplate` da classificação econômica.
- Enquanto um card não tiver perfil editorial publicado, ele ainda pode usar a moldura/traço visual já existente do clube, mas sem declarar tier, preço ou valor de mercado.
- Remover “Market Value/Valor de Mercado”, “Pending” e “Updating” do card e do zoom; mostrar somente os dados permitidos.
- Isso devolve cores e neon a Liverpool e aos demais sem escrever banco e sem fingir que uma moldura é uma cotação.
- Validar visualmente Liverpool + pelo menos um clube de cada cor antes de qualquer publicação.

**Etapa 2 — cadastro editorial manual, atleta por atleta.**

Criar um perfil editorial separado por jogador, com:

- `tier` manual;
- `card_price` manual;
- `editorial_status`: `draft`, `review`, `published`;
- `last_reviewed_at`;
- `internal_note` e `internal_source`, nunca serializados para o público.

Somente `published` aparece como tier/preço editorial. `draft` e `review` continuam com arte visual, mas sem preço/tier público. Essa estrutura permite corrigir um atleta sem mexer em nenhum outro clube e elimina a dependência de API de valuation.

**Etapa 3 — se ainda for desejado salvar os 533 valores históricos.**

Fazer primeiro a exportação canônica somente-leitura, gerar um manifesto novo que tenha UUID + membership ativa de cada atleta e depois executar um lote único, atômico, com fingerprint. Os 5 PENDING, 23 provider-only e 20 owner-only continuam excluídos até revisão humana.

## Gates antes da próxima publicação

1. Não publicar mudança de card sem comparar visualmente Liverpool, Manchester City, Chelsea, Arsenal e um card PENDING em 390/768/1280 px.
2. O teste deve comprovar que nenhuma moldura colorida muda preço, contrato, ranking ou pagamento.
3. O card sem perfil editorial não pode mostrar “valor”, “pending”, “updating” nem ocupar espaço vazio.
4. O futuro cadastro editorial deve ter uma tela interna segura e auditoria; a nota interna nunca vai para API pública.
5. Para qualquer escrita dos 533, exigir manifesto UUID/membership novo, dry-run e autorização explícita de escrita.

## Conclusão

O problema não é falta de dados dos 20 clubes. Há dados suficientes para planejar e revisar. O problema é que o visual foi acoplado a uma classificação econômica que ainda não está comprovada para todos os jogadores. O caminho correto é desacoplar a aparência do valor, restaurar as molduras de forma honesta e, depois, publicar tiers/preços somente por decisão editorial controlada.
