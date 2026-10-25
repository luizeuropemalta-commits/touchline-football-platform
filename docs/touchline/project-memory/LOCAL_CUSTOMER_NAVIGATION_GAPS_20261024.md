# Navegação customer: lacunas locais identificadas

## Atualização 24/10/2026 04:55 CEST — Inbox/Notificações implementadas localmente, sem aceite visual

SUPERSEDED quanto à ausência de implementação: Inbox e Notificações agora preservam sua estrutura horizontal em canvas local com NavigationRail real, sem zoom global. Inbox usa760px, Notificações960px; botões canônicos, fontes pequenas corrigidas, handlers/queries/auth/consentimento preservados. Inbox12/12PASS5324a4; centro/locale/integração19/19PASSe276b7; shell/produto12/12PASS414352. Fonte revisada independentemente, lint focado passou. Provas de browser real isolado preparadas para Busca/Inbox/Notificações, não executadas devido pressão2. Native time input e fluxo de teclado continuam pendentes de geometria/PNG, conta real e Next não foram testados.

Rodapé mantém copyright e ícone lado a lado por nowrap/coluna flexível;14/14PASS532f3a, prova visual preparada e revisão independente, sem PASS visual. Instagram continua EXTERNAL: URL pública oficial não comprovada, nenhum perfil sintético configurado. Todas as limitações e manifesto desta rodada estão no checkpoint04:55; não há deploy ou mudança de dados.

## Atualização 24/10/2026 04:33 CEST — Busca e provas mobile parciais

Cabeçalho utility Chromium390 PT concluiu caso antes de pressão2 interromper a rodada; AR repetido sozinho1/1PASS5b23c3, ambas capturas inspecionadas (checkpoint04:33). Não é matriz completa ou conta autenticada.

Cabeçalho interno de football-search agora usa NavigationRail real, botão canônico44px e rótulo12px, nowrap/scroll local via FootballSearchContent.module.css. Idioma, destino e aviso editorial preservados.7/7PASSba7f5e e revisão independente sem P1/P2; falta prova visual desse conteúdo.

Notificações e Inbox permanecem pendentes: proposta é preservar estrutura horizontal em scrollports locais legíveis, sem zoom global ou alteração de consentimento/handlers/server reads. Não implementados. Instagram continua bloqueado pela URL pública oficial não comprovada.

## Atualização 24/10/2026 04:25 CEST — implementação local parcial

O manifesto de apresentação foi aprovado pelo coordenador dentro do pedido já autorizado de padronização do site. Implementado TouchlineCustomerUtilityShell somente nas três rotas exatas para customer não-owner com identidade já verificada pelo layout. Header/nav/rails canônicos, um logout e um main; guard, autorização, handler e política de troca de conta não mudaram. A descrição AUDIT abaixo é o histórico anterior, não o estado atual do cabeçalho.

13/13 testes locais passaram (83391b), lint focal exit0 (8757f4). Chromium1280 PT /notifications passou (14d953), captura inspecionada em /private/tmp/touchline-utility-shell-2jsp2i/chromium-1280x900-pt-BR-notifications.png. Prova isolada com identidade/conteúdo/callback sintéticos, não conta ou logout real nem SSR hydration. Oráculo árabe de troca de conta corrigido depois para reproduzir o caller EN/PT e returnTo exato; lint76e8cc exit0, browser final ainda pendente. Matriz36casos e Safari nativo não concluídos. As regras internas de cascata continuam abertas e Instagram permanece dependência independente. Nenhum deploy ou mudança de dados/autorização.

## Histórico da auditoria inicial

Data: 24/10/2026. Classificação: **AUDIT**, leitura de fonte e registro documental. Não é aprovação visual nem autorização para alterar autenticação ou administração.

## Evidência e escopo

Repositório confirmado: `/Users/luizlopez/Developer/touchline-qa-release-20261022`. HEAD: `b061753899767a4d805d5f37193d36bc673c18fd`, detached; há alterações locais de outras frentes. A evidência abaixo descreve os arquivos atuais, não somente esse commit.

As três rotas passam por `app/(app)/layout.tsx` → `ArenaAdminShell`, em `components/arena-admin-shell.tsx`. Esse shell não usa `TouchlineBrandHeader`/`TouchlineGlobalNavigation`: mostra sidebar a partir de `xl` e drawer condicional abaixo desse breakpoint (linhas 329–332), além de cabeçalho próprio (354). Trocar conta/TouchLine ficam ocultos abaixo de `sm`; menu, sair, pesquisa e sino usam `size-10` (40px), diferentes dos controles compartilhados de 44px (360–404). A mesma composição atende rotas administrativas.

| Rota customer | Evidência específica | Diferença em telas menores |
|---|---|---|
| `/notifications` | `app/(app)/notifications/page.tsx:344,365,368` | Resumo `sm:grid-cols-3`, painéis `xl:grid-cols-[1.1fr_.9fr]` e categorias `md:grid-cols-2` passam para uma coluna. Cabeçalho herdado continua fora do padrão customer. |
| `/inbox` | `app/(app)/inbox/page.tsx:142` | CSS explícito em `max-width:620px` muda itens de flex para grid e realinha o conteúdo lateral. Possui retorno próprio para ClubOwner. |
| `/football-search` | `app/(app)/football-search/page.tsx:24` | Topo próprio com `flex-wrap` e retorno textual para ClubOwner, sem o menu compartilhado nessa página. A sidebar/drawer vem do layout pai. |

As regras demonstram mudança de organização por fonte; não provam corte, sobreposição ou o resultado renderizado em um aparelho específico.

## Próxima correção e gates

**APPROVAL REQUIRED para o manifesto de implementação:** separar apresentação customer de apresentação admin, reutilizando o cabeçalho canônico somente nas três rotas customer. Não substituir o shell global indiscriminadamente e não adicionar cabeçalho duplicado dentro do shell atual.

1. Preservar integralmente o guard server, a identidade da conta, os destinos de autenticação e a autorização de administrador. Não habilitar links administrativos para clientes nem remover navegação operacional.
2. Manter locale, contexto autenticado confirmado e saída de sessão; falhas de carregamento não podem fabricar sessão nem confirmar preferências.
3. Validar ausência de cabeçalho/main duplicados, ordem dos links, alvos de pelo menos 44px, foco e rolagem horizontal sem mover a página verticalmente. Preservar controles de consentimento e operações existentes.
4. Revisar cada conteúdo móvel separadamente: trocar o cabeçalho não resolve as regras de cascata documentadas acima. Provar desktop, telefone/tablet landscape, idiomas longos/árabe e Safari nativo com a persona customer; prova admin não substitui customer.

## Instagram — dependência independente

`app/layout.tsx:128` entrega `process.env.TOUCHLINE_OFFICIAL_INSTAGRAM` ao rodapé; `TouchlineSiteFooter.tsx:59–71` só renderiza o ícone quando recebe URL HTTPS válida de perfil. Não foram lidos valores secretos nem arquivos de ambiente. A busca em fontes, documentação e testes encontrou apenas URLs sintéticas e o identificador de outbox `TOUCHLINE_OFFICIAL_INSTAGRAM`, documentado em `social-publishing-playbook/CANDIDATE_READINESS_039_046.md:71`, não uma URL oficial autorizada. **EXTERNAL:** confirmar endereço público oficial e configuração do alvo; nunca promover URLs de fixtures a perfil real.

## Gate desta entrega documental

**MISSION/SCOPE:** inventário local, sem alteração de produto. **FILES CHANGED:** somente este relatório. **QA BRANCH/COMMIT:** detached/HEAD acima, não candidato limpo. **QA DEPLOYMENT/STABLE QA URL:** não avaliados. **REMOTE BUILD BUDGET/CONSUMED:** 0/0. **FUNCTIONAL/VISUAL/RESPONSIVE/ACCESSIBILITY RESULT:** pendentes de implementação e evidência renderizada; não PASS. **SECURITY RESULT:** nenhuma mudança de autorização, configuração ou credencial. **BROWSER MATRIX/TESTS/BUILD:** não executados nesta revisão, conforme slot/capacidade controlados pelo coordenador. **OBSERVABILITY:** leitura dos arquivos citados. **OPEN FINDINGS:** três rotas fora do padrão e URL oficial não confirmada. **PRODUCTION:** NOT TOUCHED.

| Ferramenta | Relevância/ação | Resultado inspecionado |
|---|---|---|
| Leitura e busca local/Git | Fonte, cadeia de layouts, identidade do checkout | Evidências acima; nenhum acesso web, banco ou segredo |
| Edição documental | Criar somente este registro; rollback é remover este arquivo novo | Nenhuma implementação modificada |
