# TouchLine ClubHub — escopo visual consolidado

**Estado:** candidato visual em construção. Este documento é a fonte de verdade
para a próxima entrega QA; não significa que os itens abaixo já estejam
publicados.

## Regra de lançamento

- Todas as mudanças desta lista formam **um único candidato QA** relacionado.
- Não haverá push ou deploy enquanto o candidato não tiver testes locais,
  build local e aprovação explícita do Fiscal Vercel.
- Depois do parecer `GO QA`, haverá no máximo um deploy Git-native para QA do
  SHA aprovado. Produção continua fora de escopo.
- Nenhum dado de jogadores, cobrança Vercel, conta externa ou publicação social
  será alterado por esta entrega visual.
- Em 5/set, a Vercel sinalizou `Function invocations usage spike` (gravidade
  média). A investigação factual, somente leitura, é um gate adicional: não há
  deploy enquanto o Fiscal não registrar a rota/função causadora ou a ausência
  objetiva desse detalhamento no painel.

## Padrão visual obrigatório: moldura TouchLine

Todo quadrado, painel, card, tabela, rail e área de conteúdo do ClubHub deve
usar o mesmo sistema visual TouchLine:

1. borda verde TouchLine fina e elegante;
2. traço de neon verde em movimento suave ao longo do perímetro;
3. brilho discreto, sem pulsação agressiva e com `prefers-reduced-motion`;
4. nenhuma borda externa azul ou cor do clube substitui a moldura TouchLine;
5. cores do clube permanecem apenas em escudos, fotos, uniformes e dados do
   clube — nunca como a moldura estrutural padrão.

Este é um contrato compartilhado: componentes novos devem reutilizar o traço
de perímetro existente, e componentes antigos serão inventariados antes do
parecer do Fiscal.

## Topo do ClubHub — todos os 20 clubes

- Descer levemente `Official Club` e o nome do clube para melhorar a composição.
- Reduzir os troféus em cerca de 30% e deixá-los no rodapé do hero.
- Usar o espaço superior direito do hero para um `Next Match` compacto e
  premium, dentro da foto, com adversários, data/hora e estádio.
- O mesmo componente troca automaticamente de estado: `Next Match` antes do
  jogo, `Live` durante, e `Full Time` após o resultado final confirmado.
- No rail de partida, mostrar somente os nomes dos clubes, escudos um pouco
  maiores e o placar branco centralizado, sem cápsula, círculo ou posições na
  liga. Em estado final, `Full Time` aparece somente no cabeçalho, sem repetir
  `Verified result` abaixo.
- O rail deve mostrar a foto interna verificada do estádio, como no Live. Se o
  fixture já for verificado mas vier sem a imagem pública, usar somente o
  fallback do catálogo que corresponde ao mandante verificado.
- Aplicar a regra para os 20 clubes, usando dados reais do fixture; não usar
  estádio, placar ou status inventados.

## Tabela, feed e navegação

- Remover da tabela lateral os textos redundantes `Season status`,
  `Verified through latest final`, temporada e `Verified final results`; deixar
  somente a tabela da liga.
- Fazer a tabela e todos os painéis seguirem o padrão de moldura TouchLine.
- Remover o link duplicado `Rankings` da navegação inferior quando ele já existir
  acima no topo.
- Manter a arte de feed dinâmica no site; PNG é somente a saída para social.
  O estado visual deve preservar efeitos de movimento e neon no site.
- A etiqueta da tabela usa sempre `TouchLine England League`, legível e sem
  baixa opacidade.

## Matchday e line-up

- `Squad Preview` torna-se `Official Line-up` apenas quando a escalação oficial
  persistida existir; antes disso mantém caráter de prévia.
- Campo premium horizontal, na proporção oficial 105×68 e grande dentro da
  coluna do ClubHub, sem atravessar nem cortar a página; os cards dos jogadores
  permanecem em pé e legíveis.
- Reutilizar a mesma formação canônica do Market, sem duplicar ou alterar dados.
- Exibir treinador na composição e os 9 reservas confirmados abaixo.
- Aplicar o padrão de moldura/neon ao componente do campo e seus painéis.
- O bloco `Match-up` da escalação deve ser uma composição premium: escudos
  maiores, simétricos e centralizados; `VS` ou placar sempre no centro
  geométrico entre os dois escudos; e a formação integrada em painel próprio,
  alinhado ao confronto em vez de solta no canto.

## Jogadores fora do matchday

- Os 11 jogadores fora da partida continuam existindo.
- Remover a lista textual de nomes nesse espaço.
- Mover para esse espaço os mesmos cards de jogador que apareciam abaixo, em
  escala menor, premium e clicáveis; o clique abre o perfil/card do atleta.
- Remover a duplicação da grade grande inferior depois que os mesmos cards
  estiverem renderizados acima.

## Rankings e dados

- Não inventar rankings de ClubOwner, liga ou treinadores sem uma fonte de dados
  auditada. Um redesenho desses rankings é escopo posterior, separado deste
  candidato.
- A auditoria SportMonks dos 20 clubes é uma frente separada: primeiro compara
  dados e cobertura; só então propõe correções com evidência. Ela não entra
  automaticamente no deploy visual.

## Estado de implementação nesta data

Já iniciado no candidato local:

- rail de fixture com estados próximo/ao vivo/final e estádio;
- hero compacto de próximo jogo e ajustes de hierarquia do topo;
- supressão dos textos redundantes na tabela do ClubHub;
- remoção do link inferior duplicado;
- line-up vertical compacto com formação canônica;
- cards compactos para os 11 fora da partida e remoção da renderização duplicada
  inferior;
- traço de perímetro em componentes centrais do ClubHub.

Ainda obrigatório antes de solicitar o parecer do Fiscal:

- inventário e aplicação completa do padrão de neon a todos os frames do escopo;
- revisão visual local em desktop e mobile;
- testes focados, TypeScript, lint, `git diff --check` e build local;
- manifesto de arquivos, SHA e plano de rollback para o Fiscal.

## Critérios de aceite QA

1. A mesma composição funciona nos 20 clubes, sem conteúdo fixo de Ipswich,
   Liverpool ou qualquer outro clube.
2. O rail mostra status, adversário, horário e estádio compatíveis com o fixture.
3. Nenhum painel do escopo mantém moldura azul/club-specific como estrutura.
4. O layout permanece legível em desktop e mobile, sem sobreposição de cards.
5. A página não duplica os 11 atletas fora do matchday.
6. Todos os gates de release passam e o Fiscal aprova o SHA exato antes do deploy.

## Follow-up visual — campo em paisagem

Após a revisão em QA, o campo foi devolvido ao formato horizontal. A formação
canônica do Market é mostrada diretamente no plano 105×68 (goleiro à esquerda,
ataque à direita); o campo preenche apenas o container disponível e os cards
nunca rotacionam. Esta alteração segue o mesmo processo de validação: testes,
build local, SHA imutável e gate novo do Fiscal antes de um único deploy QA.

## Follow-up visual — estádio no rail de fixture

- O estádio não pode mais ocupar o fundo do card de fixture nem vazar para a
  tabela ao lado.
- Reutilizar a composição visual do Live: imagem do estádio em um quadrado
  pequeno, com o nome do estádio fora da imagem e ao lado dela.
- A miniatura usa somente a mesma fonte de estádio verificada já aceita pelo
  fixture. Sem imagem verificável, não há fallback inventado: permanece o
  estado textual de estádio em verificação.
- Implementado somente localmente e mantido fora de deploy até o proprietário
  finalizar a próxima sequência de ajustes visuais.

## Follow-up visual — líderes de posição e legibilidade da tabela

- Substituir os dois painéis de destaque por quatro cards maiores de atletas do
  próprio clube: zagueiro, lateral, meio-campista (incluindo volante) e
  atacante (ponta ou centroavante).
- Cada escolha deve vir exclusivamente do ranking canônico já auditado, por
  `totalRating`; sem ranking publicado para uma posição, renderizar estado de
  verificação e não escolher um substituto por heurística.
- No rail, `TouchLine England League` usa o verde TouchLine e `Official League
  Table` branco integral, sem opacidade escura que prejudique leitura.
- Implementado somente localmente, sem commit ou deploy, junto ao pacote visual
  pendente do proprietário.

## Follow-up visual — rótulo e nomes do campo

- A nota/Rating flutuante não aparece acima do card do atleta no Squad Preview.
- A barra preta do nome acompanha o texto com margem pequena e proporcional;
  a tipografia fica 20% menor, preservando limite seguro para nomes longos.
- Uma escalação confirmada é chamada `Line-up`. `Squad Preview` só aparece nas
  24 horas anteriores a uma partida com horário verificável; data ausente fica
  em estado conservador de prévia, sem alegar escalação oficial.

## Fila ativa 042 — composição Matchday e legibilidade

- Todo pedido visual do proprietário deve ser registrado antes de iniciar a
  próxima alteração; o candidato permanece local e sem deploy até ele encerrar
  a sequência de mudanças.
- A tipografia auxiliar do ClubHub sobe 10%, sem aumentar títulos ou placares.
- A faixa anterior dos quatro líderes é removida para que Matchday/Squad
  Preview suba imediatamente após a área oficial da liga.
- Os mesmos quatro líderes canônicos do clube — zagueiro, lateral,
  meio-campista e atacante — passam para uma grade premium 2×2 à direita do
  campo horizontal, que mantém prioridade e fica puxado à esquerda.
- O subtítulo `9 cards from the available squad` (e equivalente em português)
  fica em branco; `Bench` e sua contagem continuam visíveis.
- Um rodapé profissional único fecha o ClubHub com TouchLine e os direitos
  reservados, localizado por idioma. Botões externos premium de Instagram e
  Facebook permanecem na fila aguardando as URLs públicas oficiais do
  proprietário; não será inventado um perfil/destino externo.
- No cabeçalho de Matchday, `MATCHDAY LINE-UP`, `Squad Preview` e a explicação
  aparecem somente nas 24 horas verificáveis anteriores ao jogo. Com line-up
  oficial confirmado, fica apenas o título grande `Line-up confirmed`; o
  pequeno painel de formação usa apenas `Line-up` acima da formação.
- Inspeção local renderizada: desktop `1280×720` e mobile `390×844` sem
  overflow horizontal; os quatro líderes ficam ao lado do campo no desktop e
  abaixo dele no mobile. Isso é evidência do candidato local, não aprovação do
  Fiscal nem deploy em QA/Production.
- Estado: implementado localmente, verificação funcional concluída; inspeção
  visual renderizada em desktop e mobile ainda pendente. Sem commit/deploy.

## Follow-up visual — topo, confronto e estádio (todos os clubes)

- Aproximar o nome do clube do seu escudo; manter `Official club profile` e
  `Club Honours` em verde TouchLine e o nome principal em branco.
- O próximo jogo deve sempre usar escudo / placar ou VS / escudo, com o
  elemento central no centro geométrico e os escudos com a mesma escala.
- Estádio não é fundo: imagem interior verificada em quadrado premium, com
  `STADIUM` e nome fora da imagem no padrão Live.

## Follow-up visual — arena de line-up e líderes por posição

- Os quatro líderes (zagueiro, lateral, meio incluindo volante e atacante)
  são cards vivos TouchLine com neon, zoom e perfil — nunca PNG estático — e
  precisam aparecer completos, sem corte.
- Sem line-up oficial, o título é `Line-up` até a janela final de 24h; dentro
  da janela vira `Squad Preview`; após a confirmação oficial vira `Line-up
  confirmed`. A explicação existe somente no estado Preview.
- Captura pré-QA deve usar dados isolados de QA; credenciais de produção não
  podem ser reutilizadas para construir uma visualização local.
