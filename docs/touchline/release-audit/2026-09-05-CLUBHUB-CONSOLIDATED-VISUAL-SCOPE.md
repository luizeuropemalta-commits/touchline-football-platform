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
