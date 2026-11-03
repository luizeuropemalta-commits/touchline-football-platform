# Foto, avatar público e notificações — 31/10/2026

## Escopo e identificação

Worktree: `/Users/luizlopez/Documents/Codex/2026-09-05/touchline-prompt-formalizer/worktrees/qa-stripe-release-20261029`.
Base Git: `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694` (detached). Alterações locais, sem commit.
Responsável: agente `avatar_notifications_finish`; consolidação e mutações QA pertencem ao agente raiz.
QA inspecionada: `xgxbwqxjssxxuihuwmgy`. Production não acessada/alterada; zero deploys/builds remotos, uploads, env writes, exclusões ou envios de notificações neste lote.

## Correções implementadas

1. **Diagnóstico da foto respeita a política de público real.** O diagnóstico exigia sempre uma conta UUID específica, enquanto upload/contexto já aceitavam o público `customers`. Reutiliza agora `parseClubOwnerAvatarAudience` e `allowsClubOwnerAvatarAudience`. Público inválido continua bloqueado, modo antigo mantém isolamento por conta, nenhuma flag é ativada. Diagnóstico continua exigindo prova de runtime e não autoriza requisições.
2. **Falha do serviço não aparece como logout nas preferências.** PUT `/api/notifications/preferences` devolvia 401 quando faltava cliente/serviço Auth ou ocorria erro de transporte de autenticação. Agora retorna 503 privado/no-store; sessão realmente ausente continua 401. Rejeições de rede são respostas genéricas de resultado não confirmado, sem expor detalhes nem repetir gravações. Não afirma rollback após envio incerto. Origem, identidade verificada e condição da conta continuam exigidas.
3. **Foco inicial não rouba uma interação já iniciada.** O RAF do helper compartilhado refocava o título mesmo depois de um Tab/clique legítimo dentro do modal. Agora respeita foco observado que se moveu para um controle válido e modais aninhados; mantém o alvo inicial deliberado quando não houve interação. Regressão controla o RAF e realiza Tab/clique antes de liberá-lo.
4. **Prova visual fortalecida.** O teste de modal agora compara pixels com um controle sem blur e um controle simples fora do dialog. `getComputedStyle(...).backdropFilter` sozinho não comprova fundo desfocado. A capacidade de rasterização do motor é registrada explicitamente em `renderedBlurVerified`.

Arquivos de implementação/teste pertencentes ao setor:

- `lib/touchlineArena/club-owner-avatar-admission-diagnostics.ts`
- `app/api/notifications/preferences/route.ts`
- `tests/touchline-club-owner-avatar-admission-diagnostics.test.mts`
- `tests/touchline-notification-preferences-put-error.test.mts`
- `tests/touchline-notification-game-locale-route.test.mts`
- `tests/touchline-club-owner-avatar-modal-browser.test.mts`
- `components/touchline/a11y/TouchlineDialog.tsx` (propriedade ampliada explicitamente pelo agente raiz)

Nenhuma alteração em CSS global, tabelas, flags ou gates de autorização compartilhados. Uma tentativa local de mover o filtro para `::backdrop` não resolveu o problema de rasterização do WebKit e foi revertida integralmente; `ClubOwnerAvatarControl.module.css` não tem diff deste agente.

## Verificações locais

Evidências: `artifacts/avatar-notifications-20261031/`.

| Verificação | Resultado | Evidência e limite |
|---|---|---|
| Foto/contexto/upload/retention + preferências/idioma/pausa/horários | **170 PASS / 0 FAIL / 0 SKIP** | `focused.log`; transporte controlado local, não upload/retention real |
| Avatar público + registro push + dispatch/worker/rehearsal | **94 PASS / 0 FAIL / 0 SKIP** | `delivery-avatar-public.log`; não entrega a aparelho |
| Modal antes do fortalecimento raster | **1 PASS WebKit e 1 PASS Chromium** | `modal-webkit-unsandboxed.log`, `modal-chromium.log`; cinco dimensões/idiomas por motor |
| Modal final com regressão de foco e controle de pixels | **1 PASS por motor; WebKit visual pendente** | `modal-webkit-final.log`, `modal-chromium-final.log`; Chromium raster comprovado; WebKit declara limitação |
| Helper compartilhado de acessibilidade | **9 PASS / 0 FAIL / 0 SKIP** | `dialog-accessibility.log`; foco, aninhamento, Escape e isolamento |
| ESLint arquivos do setor | **exit 0**, sem avisos | `lint-final.log` |
| Diff whitespace | **exit 0** | `git diff --check` nos arquivos do setor |

Não somar os 29 testes de preferências ou 10 de diagnóstico rodados antes: já estão incluídos nos 170. Não contar reexecuções do mesmo teste como cobertura nova. Não foi executada suíte ampla nem build por este agente. O agente raiz informou TS global exit 0 antes das edições de teste raster e helper de foco; repetir essa checagem na consolidação final, sem somar testes sobrepostos.

Comandos reproduzíveis (executar no worktree identificado):

```sh
sh artifacts/avatar-notifications-20261031/run-focused.sh
sh artifacts/avatar-notifications-20261031/run-delivery-avatar-public.sh
sh artifacts/avatar-notifications-20261031/run-modal.sh webkit
sh artifacts/avatar-notifications-20261031/run-modal.sh chromium
npx eslint lib/touchlineArena/club-owner-avatar-admission-diagnostics.ts app/api/notifications/preferences/route.ts tests/touchline-club-owner-avatar-admission-diagnostics.test.mts tests/touchline-notification-preferences-put-error.test.mts tests/touchline-notification-game-locale-route.test.mts tests/touchline-club-owner-avatar-modal-browser.test.mts components/touchline/a11y/TouchlineDialog.tsx
node --test --experimental-strip-types tests/touchline-dialog-accessibility.test.mts
```

Os scripts em artifacts contêm a lista exata de arquivos dos dois grupos; não iniciam servidor, não leem credenciais e não escrevem remotamente. Lançamento dos motores precisou execução fora do sandbox do shell. A primeira tentativa WebKit abortou antes de asserções (`Target closed`, `Abort trap: 6`); a repetição aprovada funcionou. Falhas anteriores intermitentes de foco estão preservadas em `modal-webkit-raster.log` e `modal-chromium-raster.log`; originaram a correção do RAF e o novo cenário determinístico. Uma versão intermediária do cenário de clique usava botão sem ação, que WebKit não foca por padrão; o fixture final usa input com foco nativo e nenhuma ação de negócio.

### Foto grande e responsividade

Implementação existente conferida: JPEG/PNG/WebP estáticos; limite de entrada 20 MB/50 MP, redução até 512 px sem ampliar imagens pequenas, orientação EXIF 1–8 e conversão do servidor para WebP. HEIC não é formato anunciado/suportado. Bucket privado aceita WebP até 5 MiB, mas o pipeline novo limita a publicação a 128 KiB. Isso não é prova de upload de uma foto real em QA.

Fixture do modal compõe os componentes reais com Auth e HTTP sintéticos. Verifica 1440×900, 844×390, 390×844, 1024×768 e RTL 844×390; foco, Escape, restauração, modal aninhado, fechamento durante operação incerta, identidade mudando e unmount. Não equivale a Safari nativo nem a gesto de pinça no iPhone.

### Limitação visual encontrada

Captura WebKit mostrava texto de fundo legível apesar do CSS computado `blur(8px)`; Chromium mostrava blur. Experimento mínimo sem qualquer componente/dialog também não rasterizou `backdrop-filter` no WebKit instalado (contraste 40,476 com e sem blur), tanto headless como com janela. `filter: blur` direto no elemento reduziu contraste a 0. Logo, não está comprovada uma falha específica do modal, e alterar CSS global para compensar esse renderer poderia criar peso/regressão no iPhone. Teste registra a limitação, não declara aprovação visual. Pendente confirmar no Safari nativo/aparelho.

A corrida de foco identificada no helper compartilhado `TouchlineDialog.tsx` foi corrigida após coordenação com o agente raiz, com regressão que segura o RAF, executa Tab/clique e verifica o foco antes/depois da liberação. Asserções de retorno, modal aninhado e mudança de identidade permanecem.

Pixels finais: Chromium contraste desfocado **0,302**, controle sem blur **16,905**, referência simples **0,302** (`renderedBlurVerified=true`); WebKit **16,905** nos três (`renderedBlurVerified=false`). Apenas o primeiro comprova rasterização nesta máquina.

## QA: evidência somente leitura

Resumo sanitizado em `remote-readonly-summary.json`.

- Sete tabelas em `touchline_avatar_private` e 14 RPCs públicos de avatar encontrados.
- Bucket `touchline-club-owner-avatars`: privado, MIME WebP, limite 5 MiB.
- Edge Function `touchline-avatar-retention`: ACTIVE, versão 5, `verify_jwt=true`; estar ACTIVE não prova execução bem-sucedida.
- Operações/receipts de avatar, scans e tentativas de retention: **0**.
- Dispositivos push, histórico de notificações e outbox de partida: **0**; preferências: **3**.
- Nenhum cron do banco cujo nome/comando contivesse `avatar` ou `retention`. O `vercel.json` local também não declara crons. Agendador externo ainda não comprovado; não concluir que inexiste.
- Consulta de logs de funções na janela lida retornou vazia. Isso não prova que worker nunca executa; scans podem ficar vazios sem operações.

## Gates de runtime ainda pendentes

Foto exige `TOUCHLINE_CLUB_OWNER_AVATAR_READ_ENABLED`, `...UPLOAD_ENABLED`, `...SELECTION_ENABLED`, `...RETENTION_READY` exatamente `true`, política de público válida, sessão verificada e alvo QA/origem exatos. `customers` permite clientes elegíveis; sem esse modo, permanece conta UUID configurada. Nenhuma dessas flags efetivas da implantação foi alterada ou atestada por este setor.

Avatar em busca/ranking exige também `TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED` e `TOUCHLINE_CLUBOWNER_PUBLIC_AVATAR_ENABLED`, perfil elegível/consentimento e imagem atual válida. O bucket continua privado, não torna público o original nem expõe imagem antiga.

Retention host exige `TOUCHLINE_QA_AVATAR_RETENTION_ENABLED`, URL Supabase QA e credencial vinculada ao projeto; POST com bearer, sem Origin/payload, descoberta antes de limpeza e estado persistente de tentativa. O endpoint é limitado e não substitui agendamento comprovado.

Push de partida exige `TOUCHLINE_MATCH_PUSH_WORKER_ENABLED`, segredo de dispatch, política de idade da fonte e VAPID completo (`NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY`, `TOUCHLINE_WEB_PUSH_PRIVATE_KEY`, `TOUCHLINE_WEB_PUSH_SUBJECT`). Preferência salva não comprova dispositivo, outbox, envio nem recebimento. O produtor usa os fixtures persistidos do live-sync; este agente não editou live-sync. Resend/Auth não comprova entrega de alertas de jogo por e-mail.

## Próximos passos operacionais para raiz

1. Confirmar configuração efetiva na implantação QA sem expor valores de segredos; diagnosticar bootstrap retention v5 e agendador.
2. Usar o runner existente `scripts/qa/verify-touchline-avatar-retention.mts`, inicialmente dry-run, seguindo etapas de publicação, substituição, janela de retenção e verificação. Conta CUSTOMER QA já autorizada, sem tocar ADMIN/Production. Não repetir POST após confirmação perdida.
3. Demonstrar envio de foto real, recarregamento e mesmo avatar na busca/perfil/ranking por outra conta, respeitando visibilidade e revogação.
4. Registrar dispositivo com permissão, criar evento válido pela origem de dados e comprovar outbox→dispatch→recebimento/histórico, incluindo recusa, pausa, quiet hours e duplicação.
5. Validar Safari nativo e iPhone/tablet reais; o raster WebKit local permanece inconclusivo para blur. Não marcar notificações/foto como integralmente verdes até esses passos.

**Estado do setor:** correções locais e testes delimitados verdes; integração hospedada e validação física ainda pendentes. Nada deste relatório autoriza afirmar site inteiro aprovado.
