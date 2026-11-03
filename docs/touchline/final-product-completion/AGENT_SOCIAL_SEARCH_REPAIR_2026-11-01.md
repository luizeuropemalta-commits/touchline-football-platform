# Busca de amigos — diagnóstico QA e correção local delimitada

MISSÃO: investigar por que as duas contas CUSTOMER de QA não se encontram e corrigir as lacunas do fluxo social sem publicar dados privados automaticamente.

## Causa comprovada na consulta deste lote

SELECT protegido na QA `xgxbwqxjssxxuihuwmgy` retornou `touchline_people_private.configuration.enabled=false`, zero perfis e zero perfis publicados. As duas contas existem, têm acesso ao jogo, não são anônimas nem banidas, mas não têm perfil ou ID público. Portanto, não é restrição Standard/VIP. O estado do app e do banco são gates separados; a flag efetiva do app fica com o agente principal.

Evidência sem email, nome ou UUID de conta: `artifacts/social-search-repair-20261101/qa-read-only-proof.json`. Não houve UPDATE, criação de perfil nem uso de credencial para representar outro usuário.

## Correção aplicada na candidata

- A busca embutida no Exchange agora oferece **Meu perfil público / My public profile**, com caminho direto ao formulário de consentimento e ID. Exibir a busca não faz requisição privada nem publica perfil.
- O nome continua escolhido pelo próprio usuário. O consentimento não vem marcado e a foto mantém autorização separada.
- HTTP 503 aparece como indisponibilidade da descoberta; não é apresentado como busca vazia nem expõe erro interno. Falhas de outro tipo continuam com mensagem sanitizada.
- A seção de configuração recebeu âncora acessível para navegação direta. Botão reutiliza estilo global.

Arquivos de produto/teste próprios, limpos antes deste lote:

1. `components/touchline/social/ClubOwnerPublicDirectory.tsx`
2. `lib/touchlineArena/clubowner-public-contract.ts`
3. `tests/clubowner-public-runtime.test.mts`
4. `tests/clubowner-public-browser.test.mts`

WIP prévio de handler, standings e servidor foi preservado. O manifesto anterior à edição está em `artifacts/social-search-repair-20261101/preimage-manifest.json`.

## Validação

Comando `node --test --experimental-strip-types tests/clubowner-public-runtime.test.mts tests/clubowner-public-handler.test.mts tests/clubowner-public.test.mts`: **25 PASS / 0 FAIL / 0 SKIP**, duração 5055 ms. Resultado observado na saída da ferramenta, chunk `befa23`; não foi criado retroativamente um log bruto. Cobre PT/EN, opt-in explícito, ausência de dados privados, payload restrito, gate fechado, origem/autorização, timeout, estado incerto após escrita, busca vazia e serviço indisponível.

ESLint dos quatro paths e `git diff --check`: exit 0 após a edição final. Sem typecheck global, build, full-suite, commit ou deploy neste lote; consolidação pertence ao agente principal.

Teste de navegador social, com rede sintética e duas sessões isoladas, preservou todos os cenários:

- Primeira execução: 24 fluxos / 48 contextos chegaram ao fim sem falha de assertion, mas o teste monolítico excedeu 120 s e terminou **CANCELLED**, após 217,9 s. **Não é PASS.** Log e hashes preservados em `browser.log` e `browser-receipt.json`.
- O harness foi dividido em três casos, um por engine, mantendo todos os cenários e timeout de 120 s por caso. Nenhuma assertion ou limite de memória foi reduzido.
- Reexecução final: os três casos foram bloqueados pelo guard real de pressão de memória antes de lançar navegador. **PENDENTE AMBIENTE**, não defeito funcional demonstrado nem aprovação. `browser-by-engine.log` e recibo preservam resultado e hashes; sem drift nos fontes registrados.
- Reserva local autorizada: 500 MiB via `TOUCHLINE_LOCAL_BROWSER_DISK_RESERVE_MIB=500`. Nenhum bypass de memória. Chromium/WebKit/Firefox headless não acessaram contas reais nem Safari.

## Próximo passo exato

O agente principal deve confirmar flag efetiva do app, habilitar apenas o gate da QA pelo caminho autorizado e publicar os nomes das duas fixtures pelas sessões CUSTOMER com consentimento. Então comprovar busca por prefixo e ID público nos dois sentidos, seguir/deixar de seguir, ocultar/reativar preservando ID e ausência de dados privados. Não inferir sucesso da QA a partir do harness. A UI nova requer publicação do pacote consolidado.

Busca inicial ordenada por pontos, ranking/seguidores no resultado, visita ao elenco negociável e ponte para propostas continuam no backlog de produto; este ajuste não afirma que estão implementados.

## Registro da missão

MISSION: entrada social, diagnóstico de gates/perfis e consentimento.
SCOPE: QA somente leitura; quatro arquivos sociais locais e evidência própria.
QA BRANCH: candidata detached `qa-stripe-release-20261029`.
QA COMMIT: base `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694`, WIP não commitado.
QA DEPLOYMENT: nenhum deste lote.
REMOTE BUILD BUDGET / CONSUMED: 0 / 0 neste lote.
STABLE QA URL: https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
FUNCTIONAL RESULT: 25 testes locais passaram; causa QA comprovada, ativação/duas contas publicada pendente.
VISUAL / RESPONSIVE / ACCESSIBILITY: SSR e interações cobertos; não há aprovação visual final ou iPhone real.
BROWSER MATRIX: execução antiga cancelada por timeout, reexecução bloqueada por memória; não declarar verde.
SECURITY: consentimento preservado; nenhum perfil privado publicado automaticamente, nenhum dado pessoal na evidência.
BUILD: reservado ao principal; não executado.
OBSERVABILITY: recibos, logs e hashes em `artifacts/social-search-repair-20261101`.
OPEN FINDINGS: gate/perfis na QA, browser com recursos disponíveis, fluxo social ampliado e publicação do pacote.
PRODUCTION: NOT TOUCHED.

| Ferramenta | Ação | Resultado |
|---|---|---|
| Supabase | SELECT protegido delimitado | Gate desligado e duas fixtures sem perfil; sem escrita |
| Shell/Node/ESLint | Leitura, edição e testes focados | 25 PASS; lint/diff limpos |
| Playwright | Rede sintética, fluxos reais de componentes | CANCELLED por tempo; retry bloqueado por memória |
| Safari/Vercel/build | Não usados neste lote | Não reivindicados como evidência |

O agente principal recebeu o resumo para conciliar CURRENT_STATE e ledger sem edição concorrente desses documentos.
