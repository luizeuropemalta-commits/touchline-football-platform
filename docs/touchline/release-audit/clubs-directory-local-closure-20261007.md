# Diretório de clubes — fechamento local delimitado

2026-10-07. `/touchline-clubs` revisado em fixture local privada, sem alterar a rota pública, dados, cards, contas ou publicação. Os seis idiomas novos permanecem desligados ao público.

## Evidência

Cinco suítes focadas de diretório/showcase/árabe/tiers passaram 20/20, zero falhas ou skips. A página real e suas duas galerias foram renderizadas em snapshot sem `.env*`, com locale opt-in apenas na fixture. O navegador bloqueou requisições externas e escritas. Matriz: oito idiomas × desktop/tablet/telefone horizontal, cada um com screenshot da página, seção de jogadores e seção de treinadores (72 imagens). Relatórios em `/private/tmp/touchline-test-runtime-20261007.1UPtcv/visual/clubs-2026-10-07T13-31-29-114Z` (árabe) e `clubs-2026-10-07T13-31-56-584Z` (demais sete). Foram verificados 20 links de clube por cenário, todos com o locale correspondente; zero erros de página, overflow horizontal ou requisições inesperadas.

As seções abaixo da dobra usam `content-visibility: auto`: a captura de página inteira sozinha mostrou espaços vazios, portanto o harness rolou cada seção e a capturou em separado antes do aceite. Root inspecionou diretamente diretório árabe no telefone, galeria de jogadores árabe e alemão, galeria de treinadores árabe e francês e diretório turco no desktop. Não observou corte ou direção errada nesses exemplos. `TouchLine Verified` permanece como termo protegido, não fallback. Os dados publicados não foram carregados de QA: o ambiente isolado mostrou os estados de representantes pendentes e a galeria estática de treinadores. Cards reais, ações autenticadas e navegação hospedada permanecem para QA.

Fechamento **local da apresentação e dos links** somente. Próxima página: perfil de clube (`/touchline-clubs/[club]`). O servidor de teste foi encerrado.
