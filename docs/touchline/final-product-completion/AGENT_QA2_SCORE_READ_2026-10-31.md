# QA2 — pontos de rodada, temporada e perfil

Data da leitura: 2026-10-31T22:59:56.58575+00:00. Escopo: QA xgxbwqxjssxxuihuwmgy, conta de teste 8f430e6a-cc9d-47df-b623-c5c0b4e5ab43. Somente SELECT e leitura de código. Nenhum recálculo, sincronização, alteração de conta ou deploy.

## Resultado comprovado

**41,19 na rodada e 0,00 na temporada são consistentes com a implementação atual; esta leitura não encontrou erro aritmético.** Os pontos da rodada são provisórios enquanto a temporada/ranking sazonal somam somente rodadas FINAL.

- Temporada ativa 2026/2027: 1e83121b-b778-459b-b9a0-7cf1eaff5729.
- Rodada 9: 9495ea7a-cca8-4054-8b61-ab4408577459; estado LOCKED, sem finalized_at.
- user_gameweek: 2f07ae4a-8739-4167-a59c-5e0e9e4af17f; plano registrado Standard; XI travado em 2026-10-31 12:25 UTC.
- touchline_fantasy_user_gameweek_scores: 41,19, PROVISIONAL, calculado em 2026-10-31 22:11:12 UTC.
- A conta tem somente **uma** user_gameweek nesta temporada e **zero** scores FINAL. Portanto a soma sazonal FINAL é exatamente zero.
- A rodada tem oito partidas Full Time e duas Not Started: 1/nov 16:30 UTC e 2/nov 20:00 UTC. Não está fechada.

## Origem dos 41,19

Soma das contribuições de touchline_fantasy_player_fixture_scores vinculadas ao XI de touchline_fantasy_locked_selections:

| Jogador | Nota/contribuição |
|---|---:|
| Gianluigi Donnarumma | 6,85 |
| Joshua Kofi Acheampong | 8,17 |
| Pau Torres | 6,56 |
| Pep Chavarría | 6,48 |
| Pascal Groß | 6,58 |
| Dominic Calvert-Lewin | 6,55 |
| Total | 41,19 |

Quatro titulares têm DID_NOT_PLAY e contribuição zero: Noussair Mazraoui, Yankuba Minteh, Mateo Kovacic e Gustavo Nunes. Alexander Isak ainda não tem linha de contribuição dessa rodada. Nenhum acréscimo é necessário para explicar o total observado. Isto comprova a origem no banco QA; **não foi feita nova consulta à Sportmonks** nesta tarefa.

## Ranking e seguidores são situações diferentes

**Ranking:** app/clubowner/page.tsx passa snapshot.seasonRanking ao header. Em lib/touchlineFantasy/server.ts, loadRankings inclui somente planos competitivos e soma no ranking sazonal exclusivamente scores FINAL. Como a QA2 só tem a rodada provisória, não existe linha sazonal para ela. clubOwnerRankingPosition retorna null e o header exibe “—”/“Indisponível”. O ranking da rodada pode conter esta conta com 41,19; isso não é o ranking usado no header.

**Seguidores:** a configuração remota touchline_people_private.configuration.enabled está **false**, e não há perfil em touchline_people_private.profiles para a QA2 (count=0). A função own_profile chama assert_enabled, que bloqueia enquanto a configuração estiver false. Mesmo depois da ativação, ainda seria necessário criar o perfil pelo fluxo previsto. A variável da aplicação TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED é um gate adicional; seu valor efetivo na Vercel não foi lido nesta tarefa. Portanto não há base para inventar “0 seguidores” nem declarar descoberta social funcional.

## Correção mínima recomendada e limites

1. Não alterar os pontos, settlement ou ranking manualmente: os números atuais têm explicação consistente.
2. Melhorar a apresentação distinguindo “Pontos confirmados da temporada” e “Ranking após fechamento da rodada”, sem substituir FINAL por PROVISIONAL silenciosamente. É proposta local ainda não aplicada.
3. Para social: concluir a migração/ativação coordenada e o fluxo de perfil, depois comprovar busca, visita e seguir entre as duas contas. Não basta mudar a label nem um único gate.
4. Após o fim da rodada, provar a transição de settlement, soma sazonal e ranking publicados. Esta leitura não comprova essa execução futura.
5. Não aprova a pontuação de todos os usuários, todos os fornecedores, interface publicada, social completo ou site inteiro.

## Referências do código inspecionado

- lib/touchlineFantasy/server.ts:259–301 (rankings), 551–560 (leituras), 659–662 (total da temporada).
- app/clubowner/page.tsx:104–105, 133–144, 162 (gates, RPC e projeção do header).
- lib/touchlineArena/club-owner-profile-metrics.ts:34–43 (ranking por identidade).
- components/touchline/ClubOwnerMarketHeader.tsx (null não é zero).
- app/fantasy/FantasyGameweekClient.tsx:1039–1040 (números exibidos).

Evidência reproduzível: artifacts/qa2-score-read-20261031/proof.json (SQL SELECT e resultado). Nenhum teste pesado foi iniciado; a suíte ampla do root permaneceu independente.
