# TouchLine — cobertura de rotas e evidências, 20/09/2026

## Limite desta matriz

Atualização 21/09: a afirmação histórica abaixo de migração não aplicada está
superada somente em QA: janela e lifecycle aplicados nas versões remotas
20260920211911 e 20260920220827, com testes SQL e preservação de dados.
Build final145/145 exit0; suite2146 PASS/0 FAIL/8 SKIP; Chromium14/14.
Isto não fecha a aceitação autenticada/Safari nem prova dados atuais ou produção.

Auditoria de fonte, relatórios e logs existentes, sem navegador, rede, banco,
build ou implantação nesta etapa. Base local: `7254d259ea91896f4c9c6313adb714a5a3c01d74`,
worktree `qa-audit-20260919`, com alterações não commitadas. “Observado” abaixo
significa observação registrada na evidência citada, não repetição nesta etapa.
Fonte ou teste aprovado não equivale a aceite visual.

Inventário fresco de `app/**/page.tsx`: **81 entradas**, das quais **47** de
produto/contas/Admin/aliases/auditoria e **34** `/visual-qa/*`. Rotas dinâmicas
representam várias URLs. As 145 entradas do build incluem outras categorias:
não são 145 páginas visualmente visitadas.

Autoridades lidas: `AGENTS.md`, `CURRENT_STATE.md`,
`docs/touchline/final-product-completion/TOUCHLINE_FINAL_PRODUCT_EXECUTION_LEDGER.md`
e Code Verification. O topo atual de CURRENT_STATE prevalece sobre regras
históricas (35 jogadores, portrait jogável, ordem antiga da auditoria).

## Evidência existente por bloco

| Bloco / rotas atuais | Local observado/testado | QA real registrado | Lacuna atual |
|---|---|---|---|
| Arena — `/arena` | Safari 19/09: HUD/menu/rodapé em tamanhos nominais 800×360, 667×375, 1024×768, 1920×1080; mute/indicador de áudio; gate portrait e skip. 52 testes do bloco e build3 145 rotas. | Evidência histórica de XI/câmeras; não aprova o novo áudio/onboarding. | Medir viewport CSS real: nominal 800×360 teve body 695,65×313,04 (zoom ~115%). Console local 401 state/503 schedule e livescores impede prova de sessão/dados. Novo onboarding tem 63 checks relacionados, mas navegador/build integrado ainda aberto. |
| My Club — `/my-club` | Fixture congelada: GK/CB contidos, Rúben Dias zoom/fechar, 11 slots, rotação e rolagem rápida; patches fitContainer/pontos/navegação locais. | QA7254: identidade correta, retrato, XI de 11, Arteta, €900M inicial/€779M elenco; existência de campo+seletor observada. | Não equivale à jornada integral, dois passes, todos os cards ou aceitação da nova capa. Não salvar XI/contratar/remover para testar. A própria carga autenticada SSR pode preparar/reconciliar XI: não é leitura passiva autorizada só por ser GET. |
| Market — `/market-transfer`, `/fantasy` → `/my-club?lang=…&tab=market#my-club-squad` | Oito cenários PGlite de janela e testes de catálogo/paginação; não são mercado remoto. | Há testes históricos do Markt, agora substituído pelo My Club. | Migração kickoff→último final não aplicada. Retestar aliases/fragmento e browse em estado fechado, sem checkout. |
| ClubHub/cards — `/touchline-clubs`, `/touchline-clubs/[club]` | Handler de seção tardia/Suspense e âncora corrigidos; testes red-first, não prova de rolagem real. | Card Raya abriu/fechou com Escape e foco; Alisson zoom 27,79 vs perfil20,43 revelou divergência. | Vinte clubes, reservas, goleiro/coroa/cantos de campo, feed, hashes/back; paridade de todos os cards após publicação íntegra. |
| Jogador — `/touchline-players/[player]` | Novo zoom proporcional: Khusanov e Donnarumma completos; Fechar sticky revalidado ao fim da rolagem, em catálogo congelado. | Líder jogador/coroa/zoom/perfil mobile; perfil também820×1180,1920×1080,2560×1440. Dominik22,73 vs histórico30,26. | Fonte local publicada única não atualiza snapshot remoto. Coroa no zoom novo e catálogo inteiro ainda não certificados. |
| Treinador — `/touchline-coaches/[coach]` | Contratos de liderança/perfil; sem nova prova global do zoom modificado. | Líder treinador no mobile/zoom/perfil; perfil tablet/desktop. Histórico de Daniel Farke Home/Away/total sincronizados em SHA anterior. | Revalidar líder, empate/ausência, perfil e totais no mesmo snapshot atual. |
| Ranking/tabelas — `/touchline-player-card-rankings`, `/touchline-tables` | Correções de autoridade/paginação e contratos; não render atualizado de toda lista. | Ranking/coroa observados; Best XI/Top3/coach têm evidência histórica, não do patch atual. | QA: publicação05/09 com347players/22fixtures vs40 finais persistidas. Inventário630:29 faltas elegíveis,290 stale,57 iguais,207 sem nota válida,47 inelegíveis. Não trocar snapshot por agregado automaticamente. |
| Live — `/live` | View Lineup agora mantém fixture e foco sem criar histórico; 31 testes focados registrados. | Fixture19722167 carregou detalhe oficial após indisponível; link antigo abriu próximo jogo. Livescores QA:9 registros,degraded,verifiedAt16/09. | Revalidar link no browser e dados do dia; código local não prova ingestão/provider atual. |
| Auth/perfil — `/login`, `/register`, `/forgot-password`, `/reset-password`, `/admin/login`; `/club-owner/[owner]` e history/renewals/substitution; aliases me/luiz-lopez | Novo cadastro→intro→3s playback→My Club:63 testes relacionados; login/recuperação preservados. | Sessão cliente QA recuperada; janela privada Admin chegou apenas ao login. | Cadastro/confirmaremail/OAuth/retorno e perfil básico exigem persona controlada; não criar conta, enviar e-mail, trocar senha ou perfil real como smoke passivo. |
| Admin/social — `/admin` e analytics/cards/card-engine/finance/football-data/formation-calibration/manual-card-editorial/market-values/promotions/social-publications/social-publications/studio | Studio/catalogue/artes têm implementação e provas parciais históricas. | Janela privada `/admin/login?lang=pt-BR` observada; não prova área autenticada. | Inventário e redesign após dois passes mobile; migração/manifesto/vídeos e aprovação por arte continuam separados. Sem aprovar, agendar ou disparar. |
| Utilidades/aliases — `/inbox`, `/notifications`, `/football-search`; `/`, `/coming-soon`, `/arena/[zone]`, `/club-owner/me*` | Quatro reparos de navegação:23 testes executando handlers reais. | Não há prova nova abrangente dessas rotas neste build. | Idioma/query/hash, back/forward, erro/vazio/loading. Inbox “marcar lido” e notificações são mutações. |

Aliases de zona declarados: live/watch→`/live`; rankings→`/touchline-tables`;
market→`/market-transfer`; bench→My Club; news→perfil ClubOwner canônico.
`/` e `/coming-soon`→`/arena?lang=…`. Também existem `/audit-index`,
`/audit/[...route]`, `/preview`: ambientes de inspeção, não páginas cliente
aprovadas. Os 34 visual-QA não substituem dados ou sessão reais.

**Produção:** nenhum bloco acima prova a candidata atual em produção.
CURRENT_STATE20/09 registra domínio resolvido a
`dpl_CZXL6E3gQJdt4sMXDWStdcvywfjq`, READY, origemCLI, sem SHA Git nos metadados;
alias/custom domain ainda deve ser reconfirmado. Não inferir equivalência ao
checkout. QA registrado é `dpl_CZVHkkQxz7zNWVsaKMPRrj55pvX8`, anterior aos patches.

## Rastreabilidade dos registros

- `CURRENT_STATE.md:3`: autoridade de publicação, identificação remota semSHA e gates abertos.
- `CURRENT_STATE.md:25`, `:40`, `:55`, `:88`: evidência/limites Arena, zoom, áudio, gate portrait.
- `CURRENT_STATE.md:153`: MyClub fixture, navegação, dois passes e Admin social.
- `CURRENT_STATE.md:197` e `:264`: inventário de pontos, estado remoto, identidade/casos reais.
- Ledger canônico`:3637`: navegação, dois passes e área social; `:3678`: portrait anterior SUPERSEDED.
- Cérebro `outputs/Memoria-TouchLine/Auditorias/2026-09-19/`: `matriz-mobile-alinhamento.md`,
  `checkpoint-auditoria-visual-funcional.md`, `checkpoint-arena-proporcional-audio.md`,
  `adendo-pontos-todos-cards.md` e JSON integral por UUID.
- Logs relidos: `/private/tmp/touchline-mobile-navigation-final-gate-20260919.log`
  linhas2004–2009:1945total/1937pass/0fail/8skip; build correspondente145 rotas.
  `/private/tmp/touchline-arena-compact-audio-tests3-20260919.log`:52/52;
  `/private/tmp/touchline-arena-compact-build3-20260919.log`:145/145. Nenhum desses
  builds anteriores certifica automaticamente alterações posteriores.

## Ferramentas de smoke existentes: alcance e ressalvas

| Entrada | Serve para | Não prova / cuidado |
|---|---|---|
| `tests/browser/touchline-public-launch-gate.spec.ts` | HTTP público/root/coming-soon/auth; Arena landscape, foco e portrait→landscape preservando montagem | Não prova cadastro autenticado, dados atuais ou todas as páginas; não possui barreira geral de escrita. |
| `tests/browser/touchline-arena-mobile-visual.spec.ts` | `TOUCHLINE_ARENA_VISUAL_QA_URL`, projetochromium-phone-390 comviewport844×390; captura11cards; aborta nãoGET/HEAD/OPTIONS | DEMO, não XI real; semURL dáSKIP. O filtro de métodos não prova ausência de efeitos no servidor. |
| `tests/browser/touchline-arena-formation-containment.spec.ts` | MesmaURL; projetochromium-desktop-1440; três câmeras4-3-3 e loop, polígonos medidos, bloqueio de métodos mutadores no browser | Não aprova4-4-2 real nem mobile nem pureza dos handlers GET; semURL dáSKIP. |
| `tests/browser/touchline-player-leader-crown.spec.ts`, `touchline-card-frame-decode.spec.ts` | Fixtures/coroa líder único vs empate e14frames/7tiers decodificados; `TOUCHLINE_VISUAL_QA_BASE_URL` explícita | Ranking interceptado/estático; não fonte publicada real. Celular é girado para landscape. |
| `scripts/qa/verify-touchline-live-presentation-refresh.mjs` | Chromium/WebKit,3viewports×4rotas; foco/scroll/menu preservados quando revisão muda | Metadata interceptada; prova mecanismo de refresh, não sincronização real. |
| `scripts/audit-touchline-player-profiles.mts` | SomenteGET do premier-squad nos20clubes e resolução de links de todos os retornados; `TOUCHLINE_AUDIT_BASE_URL` explícita | Não visita/renderiza cada perfil e não valida rating/coroa. |
| `scripts/assert-touchline-qa-persona.mts` | Read-only Auth+SELECT da persona QA e allowlist de origem | Requer credencial privilegiada existente, nunca imprimir/copiar; não autentica navegador nem prova personaAdmin. |
| `scripts/qa/build-touchline-route-audit-manifest.mts` | Inventário estrutural; sem`--write` não grava arquivo | Data/políticas históricas: /arena “authenticated”, /fantasy e /market-transfer ainda não classificados como aliases; não é autoridade atual de acesso nem PASS. |

**Não usar como gate:** `tooling-smoke.spec.ts` e `clubhub-feed-scroll.spec.ts`
usam `page.setContent`, não produto. `audit-touchline-gold-experience.mjs:18–47`
omite MyClub/diretório/social/studio, usa aliases antigos; `:194–209` só relata
falhas, sem exit1 e sem reprovar destino-login inesperado. O antigo
`audit-touchline-market-journey.mjs` pressupõe coach-first/DOM antigo e portrait
jogável. O novo runner desta missão não altera nem promove esses históricos.

## Sequência segura proposta

**Pré-condição dos passos autenticados:** a suposição anterior de que GET/SSR
seria smoke cliente read-only está **SUPERSEDED**. Antes de navegar por My Club
ou aliases, exigir autorização específica para ambiente/persona/UUID e efeitos
automáticos permitidos, com comparação de estado antes/depois e recuperação
definida. Essa autorização não inclui compra, save, confirmação de XI ou POST.
O runner atual não implementa esse plano e bloqueia toda execução `customer`
antes do navegador; as etapas cliente abaixo permanecem pendentes.

1. Fixar candidato/build/URL/persona e escala CSS efetiva; verificar ambiente e
   identidade sem trocar sessão. Safari normal=cliente; Private=Admin.
2. Leituras HTTP públicas: precheck de configuração, schedule/livescores,
   ranking ativo/live-presentation-state; status200 não basta: conferir
   degraded, timestamp, temporada e snapshot. Nunca chamar live-sync/rebuild.
3. Arena/onboarding/perfil: observar intro completa e skip, playback3s real,
   MyClub no topo, volta normal sem novo redirect; interromper por pausa/oculto/
   portrait. Formulários só com autoridade/persona controlada própria.
4. MyClub→card/zoom→perfil→ranking e ClubHub→lineup/feed/reservas; comparar UUID,
   temporada, snapshot, nota, coroa e ausência. Percorrer todas posições/clubes,
   sem comprar/remover/confirmarXI. Live deve manter o fixture selecionado.
5. Cobrir utilidades e aliases: URL antes/depois, idioma/query/hash,
   rolagem rápida/início/meio/fim, back/forward/reload, vazio/loading/erro.
6. Repetir **duas passagens completas** no mesmo candidato: celular somente
   landscape para gameplay; portrait=aviso/inert com estado preservado; tablet,
   desktop e displaygrande. ConfigPlaywright8perfis são simulação, não hardware.
7. Admin/social em persona separada, após as duas passagens: preview integral,
   arte/destino/recibo independentes, sem aprovar/agendar/publicar. Só depois
   gates integrados e smoke na SHA remota efetiva. Produção separada de QA.

## Resultado desta etapa

MISSÃO: inventário/evidência e instrumento de smoke delimitado. Resultado:
**PARCIAL**, sem nova execução visual. Nenhum dado/conta/XI/DB/chave/deploy
alterado. Governança/Code Verification aplicadas por leitura cruzada de fonte,
relatórios e logs. Browser, estado remoto, observabilidade e aceite integral
continuam gates do coordenador. O runner novo é um smoke de rotas e fronteiras,
não certificação de todos os botões, dados, cards, dispositivos ou artes.

## Novo runner seguro (não executado contra navegador/rede nesta missão)

Arquivos novos: `scripts/qa/run-touchline-route-smoke.mjs` e
`tests/touchline-route-smoke.test.mts`. O runner admite sequencialmente 15 rotas
públicas ou 12 rotas Admin, em contexto separado 844×390,
com Chromium/WebKit/Firefox selecionável. Não extrai cookies do Safari, não
faz login, não lê `.env`, não cria/atualiza storage-state nem captura dados
privados em screenshot. Saída JSON é só stdout; falhas resultam em **exit 1**.
As 17 rotas cliente continuam enumeradas para planejamento, mas **não são
executáveis neste runner**: `customer` retorna
`TL_SMOKE_CUSTOMER_SIDE_EFFECT_AUTHORIZATION_REQUIRED`, sem abrir navegador,
ler sessão ou fazer precheck HTTP. Não existe flag de liberação desses efeitos.

Configuração: `--base-url=ORIGEM` e `--persona=public|customer|admin` obrigatórios.
Origens aceitas: localhost/127.0.0.1/IPv6loopback HTTP; alias QA canônico HTTPS;
`https://touchline.com.br` somente com `--allow-production-read=true` adicional.
Isso não substitui autorização operacional para testar produção nem desbloqueia
efeitos automáticos do modo cliente. Não há
fallback para host remoto, URL de produção, senha, variável ou perfil de browser.

Para public/customer, a validação de configuração exige `--club-path`, `--player-path` e
`--coach-path`, com caminhos relativos reais copiados da candidata e identidade
canônica verificada, não slugs inventados. O runner aceita somente as famílias
de URL correspondentes e parâmetros públicos de identidade/locale. Cada rota
deve ficar no destino exato (incluindo locale/query/hash); até um desvio
transitório é bloqueado. Para aliases, apenas o destino canônico explícito vale.
No modo cliente, configurar e enumerar destinos não autoriza visitá-los.

Para customer/admin, exigir `--storage-state=/caminho/absoluto/session.json`
**previamente autorizado** e `--expected-user-id=UUID`. O arquivo pode conter
segredos: nunca criar/exportar/exibir para satisfazer automaticamente um smoke.
Configuração ausente/UUID inválido falha fechado. QA/local customer exige a
persona QA canônica, mas interrompe antes de consumir a sessão. Admin não pode
declarar esse UUID: seu precheck separado exige GET de `/api/touchline-arena/state`
com UUID exato e `/admin` com HTTP 200, sem redirects. Sessão expirada ou identidade
incorreta reprova Admin. Admin só visita a lista Admin, nunca My Club/Market como
cliente. Esses prechecks não são prova de ausência de efeitos internos no servidor.

### Efeitos de GET/SSR identificados em fonte

- `app/api/touchline-fantasy/state/route.ts:13` chama `loadTouchlineFantasySnapshot`
  depois da autenticação; não é uma API exclusivamente SELECT.
- `app/my-club/page.tsx:21` renderiza `ClubOwnerProfileRenderer`; o renderer
  chama o mesmo loader para o dono autenticado em
  `components/touchline/club-owner/ClubOwnerProfileRenderer.tsx:210`.
- `lib/touchlineFantasy/server.ts:332`, `:353`, `:373` e `:391` contêm RPCs de
  sincronização de rodadas, reconciliação, preparação da rodada do usuário e
  alertas de XI. Algumas chamadas dependem de estado/entitlement, mas ocorrerem
  dentro de GET não as transforma em leituras puras.

O guard agora bloqueia `/api/touchline-fantasy/state`, `/my-club`,
`/market-transfer`, `/fantasy` e `/club-owner/me` para todas as personas e tipos de
recurso, inclusive fetch/prefetch e navegação documento, com
`SERVER_SIDE_EFFECT_AUTHORIZATION_REQUIRED`. Toda a jornada cliente também é
bloqueada antes de qualquer request: a lista de caminhos não pretende inventariar
todos os efeitos possíveis do servidor. Público/Admin preservam suas fronteiras,
mas o relatório sempre declara `serverSideEffects: "NOT_PROVEN_ABSENT"`.

Exemplo de sintaxe pública (substituir os três caminhos pelos reais antes de
executar; este exemplo não foi executado):

```text
node scripts/qa/run-touchline-route-smoke.mjs --base-url=http://127.0.0.1:3019 --persona=public --club-path=/touchline-clubs/SLUG_VERIFICADO --player-path=/touchline-players/SLUG_VERIFICADO?playerId=ID_VERIFICADO --coach-path=/touchline-coaches/SLUG_VERIFICADO --browser=chromium --locale=pt-BR
```

Limites: métodos diferentes de GET/HEAD/OPTIONS, WebSocket, ServiceWorker, callback de autenticação,
APIs fora da allowlist, origens externas e navegações inesperadas são bloqueados.
**Toda tentativa bloqueada reprova o smoke**, inclusive analytics/autorefresh
ou asset externo legítimo: revisar o relatório, não desativar a barreira nem
classificar automaticamente como defeito de produto. Origens externas não são
silenciosamente liberadas. A barreira controla pedidos do browser; não é uma
auditoria de efeitos internos de todos os handlers/SQL do servidor.

Somente 401 do state em persona pública é esperado; 401 autenticado de Admin, 503, recursos
com erro, console/pageerror, destino Login, render ausente e erro de cleanup
reprovam. Existe janela observada de 750 ms após o alvo renderizar: polling tardio,
loading intermitente, todas as interações, áudio, 3 s de onboarding, dados atuais,
cards completos, acessibilidade e dois passes continuam fora deste smoke.
Um HTTP 200/render pode mostrar estado vazio válido: não é prova de conteúdo atual.

Testes isolados exercitam o orquestrador e guard reais com browser falso. Os
subprocessos CLI verificam argumentos ausentes e a recusa do modo cliente,
terminando antes de importar/abrir Playwright. Nenhum desses testes é certificado
como evidência visual/remota ou prova de que GETs permitidos não gravam no servidor.

### Verificação local do instrumento

- Regressões novas de efeitos GET/SSR: **RED — 21 PASS / 3 FAIL** antes do ajuste.
- `node --test --experimental-strip-types --test-concurrency=1 tests/touchline-route-smoke.test.mts`: **24/24 PASS**, zero skips/falhas.
- `node node_modules/eslint/bin/eslint.js scripts/qa/run-touchline-route-smoke.mjs tests/touchline-route-smoke.test.mts`: exit 0.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`: exit 0 na verificação anterior do instrumento; não repetida neste ajuste de fronteira.
- Higiene dos três arquivos novos: nenhuma linha com espaço final; newline final presente. `git diff --no-index --check` sem diagnóstico de whitespace (exit 1 esperado para arquivo novo).
- Cobertura: configuração/origem/persona; listas atuais e aliases; identidade/Admin distinto; métodos/GETs de ação; login e redirect transitório; recursos 401/503; bloqueio WebSocket; cleanup; relatório sanitizado; exit code real; destinos/queries estáticos e RSC exatos; hash exigido só no destino final; cliente bloqueado antes de launch/precheck; efeitos GET/SSR conhecidos bloqueados em todas as personas, sem flag de escape.

**MISSION:** inventário de evidência e smoke seguro delimitado.

**SCOPE / FILES CHANGED:** este documento e os dois novos arquivos acima; históricos intactos.

**QA BRANCH / COMMIT:** worktree detached, base `7254d259ea91896f4c9c6313adb714a5a3c01d74`, sem commit novo.

**QA DEPLOYMENT / STABLE QA URL:** não reconsultados nesta etapa; último registro remoto acima.

**REMOTE BUILD BUDGET / CONSUMED:** zero nesta etapa.

**FUNCTIONAL RESULT:** instrumento testado em memória; smoke real não executado. Cliente bloqueado até plano controlado específico.

**VISUAL / RESPONSIVE / ACCESSIBILITY / BROWSER MATRIX:** sem nova execução ou PASS.

**SECURITY RESULT:** restrições de requests/persona verificadas; efeitos GET/SSR conhecidos bloqueados. Não prova ausência de gravações internas nos destinos permitidos nem é varredura completa.

**TESTS / BUILD:** 24 testes e lint verdes; TypeScript verde na verificação anterior, não repetido neste ajuste; build não executado.

**OBSERVABILITY:** somente leitura dos logs existentes; nenhum log remoto consultado.

**OPEN FINDINGS:** revisão independente e execução controlada público/Admin; jornada cliente exige plano e autorização escopada para efeitos automáticos, não mera permissão HTTP GET. Matriz visual/dados/release continua parcial.

**PRODUCTION:** NOT TOUCHED.

| Ferramenta / skill | Carregada | Ação executada | Resultado |
|---|---|---|---|
| Code Verification | Sim | Cruzamento de fonte, relatórios e logs | Limites de evidência e lacunas registrados |
| Code Work | Sim | Implementação exclusiva nova, testes do orquestrador, lint/TypeScript | Instrumento local verificado |
| Playwright | Código existente inspecionado | Não abriu navegador; dependência só seria carregada no runner real | Nenhum PASS de browser |
| Supabase | Fronteiras existentes inspecionadas | Nenhuma API/consulta executada ou alterada | Sem DB, credenciais ou sessão alterados |
