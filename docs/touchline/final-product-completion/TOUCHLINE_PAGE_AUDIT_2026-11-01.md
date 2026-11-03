# TouchLine — auditoria de paginas iniciada em 2026-11-01

Alvo: candidata local localhost:3100; worktree qa-stripe-release-20261029; HEAD 47ebfffbbda98cbb89bcd3ad08fb19efd1e50694 com WIP. Sem deploy ou alteracao remota neste lote. Auditoria parcial, nao aprovacao de lancamento.

|Pagina/fluxo|Prova atual|Pendencia|
|---|---|---|
|ClubOwner VIP|Safari autenticado, 35 contratos, 11 titulares, banco e fora; botoes de alteracao desabilitados com mercado fechado|Foto indisponivel; seguidores indisponiveis; Sem XI valido exige rastreio; relogio ainda acima da escalacao; validar totais e identidade dos contratos|
|Exchange historico|Modal fume abre; contratacoes 40|Historico de trocas e liberacoes indisponivel na consulta; nao e historico vazio|
|ClubOwners|Pagina renderiza mensagem de descoberta indisponivel|Inicializador local nao passa TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED; nao prova falha da QA publicada|
|Live|10 confrontos atuais, links de escalacao Liverpool/Arsenal presentes|8 jogos encerrados atuais repetidos nos ultimos resultados junto com 2 antigos; mistura de rodadas confirmada. lib/touchlineArena/match-centre.ts seleciona todos finished sem excluir rodada ativa|
|Live versus ClubOwner|Live diz rodada 9; mercado ClubOwner GW10|Rastrear identidade de rodada antes de corrigir numeros|
|Liverpool ClubHub|Link Live chega a pagina; ingressos oficial /tickets; proximo jogo Liverpool-Arsenal; campo, treinador e banco 9 renderizados|Previa nao equivale escalacao oficial. Screenshot mostra Giovanni Leoni rotulado abaixo de camisa escrita Conor Bradley; investigar fonte/render compartilhado|
|Notificacoes|Navegacao iniciada, compilacao /notifications no log|Nao terminou na janela observada; curl sem autenticacao timeout 30s, nao e prova de falha funcional autenticada|
|Rankings e assets|Recuperacao visual e build documentados no lote anterior|Revalidar pagina completa, premios combinados, pontos por conta e comparacao entre consumidores|
|Demais 19 clubes, perfis atleta/treinador, social, conta, inbox, auth, admin|Rotas inventariadas em /tmp/touchline-audit-routes-20261101.txt|Inspecao visual e funcional ainda pendente; nao marcar verde por build|

## Configuracao local
/tmp/touchline-candidate-current.mjs chama buildQaCandidateEnvironments com clubRelease:false, clubCollection:true, qaMarketContext:true. Source inclui chaves QA em memoria e locales, mas omite flags sociais/foto. Builder possui allowlist limitada. Nao habilitar tudo cegamente: reconciliar requisitos, schemas e valores QA sem expor segredos.

## Backlog preservado
Continuar fontes CURRENT_STATE.md, CURRENT_EXECUTION_LEDGER.md, docs/touchline/final-product-completion e backlog original no worktree qa-final-20261027. Pendentes integracao foto/notificacoes, social, pontuacao/ranking, publicacao historica, admin financeiro/emails, temporada, pinch iPhone, auditoria pesada e QA publicada.

## Proximos passos
1. Resolver compilacao lenta para concluir inspecao de notificacoes e paginas restantes.
2. Reconciliar configuracao local com QA e prerequisitos, sem confundir flag cadastrada com fluxo validado.
3. Corrigir agrupamento da Live com regressao rodada ativa/rodada anterior/adiados.
4. Investigar card Leoni/Bradley comparando identidade e arte renderizada.
5. Completar matriz por pagina e atualizar backlog persistente antes de qualquer deploy.

## Atualizacao — rodadas e configuracao local

- Live corrigida localmente: historico usa a ultima rodada explicitamente identificada e inteiramente encerrada; nao mistura encerrados da rodada ativa, nao completa uma rodada curta com partidas anteriores, nem arquiva rodada com jogo adiado ainda aberto. 35 testes PASS/0 FAIL/0 SKIP em match-centre e fixture-round. TypeScript e ESLint passaram antes da mudanca de configuracao social abaixo.
- Safari local confirmou 10 partidas atuais separadas de 10 anteriores. Nao publicado; build anterior nao cobre esta alteracao.
- Liverpool atualizado: escalacao oficial 4-2-3-1, banco com 9, ingressos oficial e proximo confronto Crystal Palace–Liverpool em 8 novembro. Zoom Giovanni Leoni mostrou nome, camisa 15 e arte corretos; suspeita anterior de Bradley nao reproduzida, nao e causa comprovada.
- Notificacoes abriu com preferencias, salvamento anterior registrado, zero canais e frequencia pausada. Entrega permanece sem prova.
- Inicializador descartava TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED. Builder agora admite apenas valor explicitamente fornecido pela fonte QA; jamais herda do host, nao liga avatar nem rescisao. 11 testes PASS/0 FAIL/0 SKIP. Inicializador temporario foi ajustado e candidata reiniciada; persona QA passou, credenciais somente em memoria. Busca autenticada em validacao.
- Runtime anterior parou por pressao critica de memoria (pressure=4); nova instancia iniciou. Espaco em disco livre nao elimina pressao de memoria. Protecao preservada.
- Interacoes de atleta ainda retornam indisponivel; separar configuracao, schema e entrega antes de ativar.

Evidencias: /tmp/touchline-live-round-fix.log, /tmp/touchline-round-typecheck.log, /tmp/touchline-round-lint.log, /tmp/touchline-social-local-env.log. Sem deploy, sem alteracao de Production.


## Continuidade — diretório de ClubOwners, 2026-11-01

- Causa confirmada: QA xgxbwqxjssxxuihuwmgy sem RPC `touchline_people_directory_candidates(uuid)`; a nova UI retornava indisponível.
- Migração existente `20261101065616_touchline_people_ranked_directory.sql` aplicada à QA com sucesso após revisão independente sem bloqueador. Production não alterada.
- Antes/depois: 2 perfis, 0 seguidores; função restrita a service_role (anon=false, authenticated=false, service_role=true). Não publicou perfis nem mudou o gate existente.
- API local retornou ambas as contas, plano e posição; sem accountId, e-mail ou saldo. Safari confirmou lista inicial e filtro Standard por nome.
- Seguir AINDA PENDENTE: primeira tentativa exibiu falha de confirmação durante compilação da rota local; banco continuou com zero vínculos. Não tratar busca validada como follow validado.
- Novo pedido: todo novo cadastro deve entrar na descoberta por nome; implementação atual exige perfil publicado explicitamente. Preparar onboarding com informação clara de visibilidade, preservar opções existentes e não expor e-mail/saldo/foto privada.
- Evidência local prévia: 13 testes de diretório/search aprovados; revisão independente 6 SQL e 11 search/adapter aprovados (não somar sobreposições). TypeScript e lint anteriores aprovados. Nenhum novo build/deploy remoto neste lote.
- Restante integral preservado no backlog. Sem aprovação geral de lançamento.

## Rechecagem de continuidade — assets e consumidores (2026-11-01)

- AUDIT local: 19 testes de entrega/catálogo/assets PASS, zero FAIL/SKIP.
- 140 templates PNG: dimensões corretas, zero fundos verdes indevidos, zero duplicações inesperadas; 7 pares compartilhados intencionais preservados.
- HTTP localhost: 305 arquivos (logos, frames compact/zoom, liderança/prêmios) responderam com SHA-256 idêntico ao arquivo local; zero falhas. Isso comprova entrega, não renderização integral nem cache entre telas.
- 27 testes de prêmios e consumidores Live/ClubHub PASS, zero FAIL/SKIP. Não somar com reexecuções anteriores.
- Evidências: artifacts/local-card-integrity-20261101/.
- Safari: Mac bloqueado, desbloqueio automático falhou; seguir/renderização visual nativa continuam pendentes.
- QA notifications SELECT: ensaio cooldowns/attempts presentes; enrollments, identities, deliveries, scan_state e admission_work ainda ausentes. Nenhuma migration de notificações aplicada neste lote.
- Cadastro público: lacuna confirmada no provisionamento inicial; implementação local em andamento, não aprovada.
- Deploy: zero novos builds remotos neste lote. Production não tocada.


## 2026-11-01 — gates locais consolidados e descoberta

- Executor oficial: 7.695 testes, 7.599 PASS, 0 FAIL, 96 SKIP condicionais. Esta rodada substitui a rodada anterior; não somar contagens de reexecuções.
- TypeScript global anterior exit 0 e TypeScript do build atual aprovado. ESLint global exit 0: zero erros, 13 avisos. Os seis explicit-any dos testes de primeiro acesso foram tipados; entrada CommonJS do bundler isolado recebeu exceção exata de import no lint, sem desligar regras da aplicação.
- Build local otimizado: exit 0, 136 páginas geradas. Primeira compilação completou, mas wrapper configurado como servidor contínuo devolveu 1; executor corrigido para comando finito e build repetido com exit 0 comprovado. Não houve build remoto.
- QA Development confirmada por inventário: xgxbwqxjssxxuihuwmgy. Somente SELECT neste lote: bootstrap_signup e complete_first_access ainda ausentes. Preimagem dos 2 perfis preservada para futura aplicação; nenhuma conta alterada neste lote.
- Revisão independente: nenhum bloqueador novo nos fluxos signup/primeiro acesso; pacote SQL atômico em preparação. Instalação e cadastro real continuam pendentes.
- Safari nativo indisponível: Mac bloqueado, desbloqueio automático falhou. Não há PASS visual desta rodada. Solicitação de desbloqueio pendente; trabalho independente continua.
- Evidências: artifacts/local-card-integrity-20261101/{release-suite-consolidated,lint-consolidated,build-consolidated,first-access-types-browser}.log.
- Deploy não executado; Production não tocada; 96 condicionais, provas publicadas, dispositivos e backlog integral continuam abertos.


## 2026-11-01 — continuidade após desbloqueio, 19h Malta

- Mac: caffeinate -di -t 36000 confirmado por pmset; repouso de tela/sistema inibido por 10 horas. Senha não desativada.
- Safari voltou a responder. Candidata localhost3100 iniciou e entregou login HTTP200, depois monitor local encerrou seu próprio grupo por pressão crítica de RAM (pressure=4); sem prova de fluxo autenticado.
- Modal foto: 1 teste browser PASS; notificações apresentação: 1 teste/12 cenários Chromium+WebKit PASS; neon: 1 matriz Chromium+WebKit PASS. Logs neste diretório; não equivalem a entrega real de notificações ou upload QA.
- QA xgxbwqxjssxxuihuwmgy: envelope discovery-qa-atomic.sql aplicado UMA vez via CLI, exit0; versões 20261030133824,20261101162000,20261101171000. Payload MD5 respectivamente acd66026316862a535f86dc5cf95055e,c6450059146e2e40699817af78a71e17,9fbfd4f3448c751ff3fb27b868fb7809.
- Pós-consulta independente confirmou 2 perfis existentes e fingerprint b99236a56a38458e60714aeb5d7922d5 preservados, zero fotos públicas; OID/ACL de own_profile/save_profile preservados; novos RPCs ACL restritas e search_path vazio.
- Instalação QA comprovada; novo cadastro real, primeiro acesso e propagação na UI publicada permanecem pendentes. Nenhum deploy/build remoto ou mudança Production.


### 2026-11-01 — verificação adicional de frames e galeria
- Repouso: `pmset -g assertions` confirmou caffeinate PID 19843, tela e sistema, duração de 36.000 segundos; senha não desativada.
- Renderizador dos cards: matriz WebKit completa passou, 84 casos, sete tiers, sem filtros parciais. Evidência local com arte real e identidade sintética; não comprova iPhone físico nem QA publicada.
- Galeria: Chromium e WebKit passaram nas larguras 760, 844 e 1280, executados em série. Cada execução cobre seis frames reais e o estado pendente ruby-red; um caso alternativo permanece SKIP por seleção intencional da galeria.
- Logs preservados em artifacts/local-card-integrity-20261101/touchline-frame-*-current.log e touchline-gallery-*.log. Não somar esses casos ao total da suíte ampla.
- Nenhum deploy, alteração em Production ou mudança de dados neste lote. Validação autenticada e física continua pendente.


## 2026-11-01 — ampliação de provas locais e preimagem de notificações

- Admin futebol, mercado e documentos: 3 PASS/0 FAIL/0 SKIP. Interfaces reais com fronteiras HTTP sintéticas, PT/EN e três motores; não prova importação financeira completa nem sessão publicada.
- Foto pública: 2 PASS/0 FAIL/0 SKIP, 12 cenários. Consentimento/substituição/cancelamento em fixtures; upload real na QA permanece pendente.
- Treinadores e Arena: 2 PASS/0 FAIL/0 SKIP; 24 fluxos de catálogo e 8 casos de geometria/scroll. Não equivale a iPhone físico.
- Reconciliação de elenco: teste de interface PASS nos três motores, PT/EN, captura/decisão/retry com API sintética. A primeira execução conjunta de checkout parou após 12 cenários por preflight de RAM; não houve falha funcional comprovada. Reexecução isolada autorizada: checkout 19 PASS/0 FAIL/0 SKIP (18 cenários e teste pai). Não somar sobreposições ao total da suíte consolidada.
- QA somente leitura: preimagem 2026-11-01T18:39:13Z confirma 5 tabelas e 10 funções de lembrete ainda ausentes; zero dispositivos, 3 preferências, zero tentativas de ensaio. MD5 de sync_gameweeks e projeção de mercado coincidem com o envelope revisado. Não aplicado neste incremento.
- Revisão independente do envelope: sem bloqueador novo, quatro fontes byte a byte preservadas; instalar exige gates OFF, precondições, DDL+histórico atômicos e postflight. Instalação não comprova entrega física.
- Logs e preimagem em artifacts/local-card-integrity-20261101/*current*. Sem deploy, novo build remoto ou alteração em Production.
- Permanecem abertos: validação autenticada de cadastro/follow/foto/notificações; pontuação/ranking, rescisão/Exchange completos; auditoria total admin/publicações; dispositivos; candidata limpa e deploy QA com smoke.


## Safari local — descoberta e seguir, retomada

- Candidata localhost:3100 autenticada como VIP; modal Encontrar amigos exibiu Luiz Standard e Luiz VIP antes da pesquisa.
- Primeira consulta retornou 503; repetição retornou 200 em 1,319s. Causa da primeira falha ainda não comprovada.
- Primeiro seguir não confirmou; reconciliação releu o perfil sem presumir sucesso. Rotas em compilação demoraram até 13,8s.
- Nova tentativa: PUT follow 200 em 9,8s (8,2s compilação); GET directory 200 em 1,020s. Safari confirmou Seguindo e 1 seguidores para Luiz Standard.
- Prova delimitada: navegador Safari local integrado com QA; não é deploy nem aprovação integral de descoberta, foto ou experiência de primeiro carregamento.
- Pendente: eliminar demora de compilação na candidata de revisão com build servido, revalidar primeiro acesso, busca por nome, persistência e demais fluxos.
