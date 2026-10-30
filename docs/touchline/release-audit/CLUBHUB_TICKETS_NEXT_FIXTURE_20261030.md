# ClubHub — ingressos e próximo jogo (30/10/2026)

Classificação: DAILY. Fonte local candidata; ainda não publicada na QA.

## Escopo e aceitação

- Exibir o mesmo componente de ingressos nos 20 clubes, somente com destino oficial verificado.
- Mostrar abaixo dos ingressos a próxima partida futura com estado agendado, sem substituir a escalação e o placar históricos.
- Não inventar jogo quando o calendário está ausente, adiado, encerrado ou indisponível. Preservar o alvo de URLs históricas explícitas.
- Ler o calendário persistido já existente; sem nova chamada à Sportmonks. Não alterar pontuação, banco, compras ou credenciais.
- Rollback: reverter apenas os arquivos/diff desta missão; nenhuma migração ou mutação remota.

## Fontes oficiais

Verificação web em 30/10/2026. Estes são destinos oficiais; não foram efetuadas compras nem verificados lugares disponíveis. Alguns sites exigem JavaScript; a bilheteria do Nottingham Forest redireciona para fila Ticketmaster. A reconsulta direta ao Arsenal retornou 403 no mecanismo de pesquisa; o endereço oficial previamente verificado foi preservado. Hull exibiu a página oficial de ingressos e Manchester City exibiu seu catálogo de partidas. Isso permanece separado da prova dos links na TouchLine.

| Clube | Bilheteria | Fonte da autoridade |
|---|---|---|
| arsenal | [Ingressos](https://www.arsenal.com/tickets?field_arsenal_team_target_id=1&home_away=home) | [Fonte](https://www.arsenal.com/tickets?field_arsenal_team_target_id=1&home_away=home) |
| aston-villa | [Ingressos](https://tickets.avfc.co.uk/) | [Fonte](https://www.avfc.co.uk/villa-park/first-time) |
| bournemouth | [Ingressos](https://www.afcb.co.uk/tickets/) | [Fonte](https://www.afcb.co.uk/tickets/ticket-office-opening-hours) |
| brighton | [Ingressos](https://tickets.brightonandhovealbion.com/) | [Fonte](https://tickets.brightonandhovealbion.com/screenloader.aspx?page=usercontent%2Fdocuments%2Fhtml%2Ftickethelp.html&type=include) |
| brentford | [Ingressos](https://www.brentfordfc.com/en/ticket-information) | [Fonte](https://www.brentfordfc.com/en/ticket-information) |
| chelsea | [Ingressos](https://www.chelseafc.com/en/tickets/mens-tickets) | [Fonte](https://www.chelseafc.com/en/tickets/mens-tickets) |
| coventry-city | [Ingressos](https://www.ccfc.co.uk/tickets) | [Fonte](https://www.ccfc.co.uk/tickets) |
| crystal-palace | [Ingressos](https://www.cpfc.co.uk/tickets/) | [Fonte](https://www.cpfc.co.uk/tickets/) |
| everton | [Ingressos](https://www.evertonfc.com/tickets) | [Fonte](https://www.evertonfc.com/tickets) |
| fulham | [Ingressos](https://www.fulhamfc.com/tickets) | [Fonte](https://www.fulhamfc.com/more/frequently-asked-questions/booking-tickets-faq) |
| hull-city | [Ingressos](https://www.wearehullcity.co.uk/tickets/) | [Fonte](https://www.wearehullcity.co.uk/tickets/) |
| ipswich-town | [Ingressos](https://tickets.itfc.co.uk/) | [Fonte](https://www.itfc.co.uk/news/2026/january/08/ticket-details---derby-county--a-/) |
| leeds-united | [Ingressos](https://tickets.leedsunited.com/) | [Fonte](https://www.leedsunited.com/en/visitor-information/tickets-visitor-information) |
| liverpool | [Ingressos](https://www.liverpoolfc.com/tickets) | [Fonte](https://www.liverpoolfc.com/tickets) |
| manchester-united | [Ingressos](https://tickets.manutd.com/) | [Fonte](https://www.manutd.com/en/help/faqs/ticketing) |
| newcastle-united | [Ingressos](https://book.newcastleunited.com/) | [Fonte](https://support.newcastleunited.com/hc/en-gb/articles/14311048217244-Can-I-buy-match-tickets-from-other-websites) |
| nottingham-forest | [Ingressos](https://tickets.nottinghamforest.co.uk/) | [Fonte](https://s3.eu-west-1.amazonaws.com/gc-media-assets.gc.nffcservices.co.uk/7d808730-86e6-11ef-a324-850121fe2985.pdf) |
| sunderland | [Ingressos](https://www.safc.com/tickets/) | [Fonte](https://www.safc.com/tickets/) |
| tottenham-hotspur | [Ingressos](https://www.tottenhamhotspur.com/tickets) | [Fonte](https://www.tottenhamhotspur.com/tickets) |
| manchester-city | [Ingressos](https://www.mancity.com/tickets) | [Fonte](https://www.mancity.com/tickets) |

## Evidências locais

- 37 testes focados passaram: escolha futura, duplicatas revisadas, estado desconhecido, URL histórica, ausência de fonte, i18n e fronteira persistida.
- 8 testes de compatibilidade de performance/assets passaram.
- ESLint: zero erros; aviso preexistente de ClubHubHeroNextMatch não utilizado.
- Chromium, WebKit e Firefox: um teste integrado de componentes por motor passou, sem skips, erros de console ou requisições externas. A matriz percorreu os 20 destinos em 1440×900, 1024×768 e 844×390, inglês/português, posição abaixo dos ingressos, teclado, ausência de resultado no próximo jogo e preservação do componente histórico.
- O mesmo teste percorre o store, parser, reader e hook reais de publicação com transporte sintético: uma revisão do horário atualiza o card sem depender de novas props de rota; quando a partida termina, o card de próximo jogo deixa de exibir essa partida. Isso não comprova a página completa nem entrega hospedada da Sportmonks.
- Capturas revisadas pela raiz em `/private/tmp/touchline-tickets-next-browser-20261030/`; utilizam emblemas sintéticos para isolar apresentação, sem afirmar validação das artes reais. WebKit segue a preferência de navegação do macOS: o teste detecta Tab versus Option+Tab com um link nativo antes da asserção do produto.
- Revisão independente identificou horário potencialmente desatualizado no caminho de publicação. Corrigido por opt-in restrito ao mesmo jogo, provedor, equipes, competição e temporada, com timestamp absoluto válido. Não amplia admissão no carrossel nem troca rodada/estádio. Revisão do delta sem novo bloqueio; 18 testes de seleção/consumidores passaram.
- TypeScript consolidado após as alterações concorrentes, página completa, Safari nativo e prova QA publicada continuam pendentes.
- Não foi executado deploy, compra ou alteração de dados nesta missão.

## Ampliação confirmada pelo proprietário

Quando a escalação oficial chegar, o confronto acima do campo deve ser o dessa escalação, com título **Line-up**. O card abaixo de ingressos deve avançar junto para a partida seguinte do calendário, excluindo o jogo da escalação atual. Antes do início, mostrar que ainda vai começar; somente durante a partida usar Live. Após término confirmado, manter o resultado e mudar o título para **Last line-up**. Uma URL com partida explícita deve conservar essa identidade.

Em implementação na mesma candidata; os testes acima não aprovam automaticamente esta ampliação. A Live também terá revisão separada dos acessos à escalação sob os dois escudos, para todos os 20 clubes.
