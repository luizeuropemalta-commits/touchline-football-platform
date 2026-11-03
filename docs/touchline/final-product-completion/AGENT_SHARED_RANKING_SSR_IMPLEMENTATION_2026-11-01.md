# Ranking público — uma publicação para SSR e cliente

## Resultado local

O item de autoridades divergentes identificado em `AGENT_POSTGAME_POINTS_RANKING_RECONCILIATION_AUDIT_2026-11-01.md` recebeu uma correção local posterior à auditoria. Ainda não está publicado ou validado visualmente na QA.

`loadTouchLineActiveRanking` e `loadTouchLineCoachRanking` passaram a usar a mesma publicação completa, com cache apenas por request do React. O cliente já utiliza esse envelope. Não consultam os ponteiros ativos independentes de jogadores/treinadores. Um avanço do ponteiro durante a renderização não mistura os dois rankings; um request posterior pode observar inclusive rollback legítimo, sem escolher a versão pela data mais nova.

Os leitores imutáveis foram extraídos para `card-ranking-snapshot-server.ts` e `coach-ranking-snapshot-server.ts`. Os arquivos antigos reexportam as funções/tipos para preservar consumidores. A extração evita um ciclo em runtime entre loaders e `sports-publication-server.ts`. A matemática de pontos, cobertura, identidade editorial e liquidações não mudou.

Publicação ausente, falha de banco, ID divergente, temporada mista ou ranking inválido provocam falha explícita nos loaders; não produzem um zero confirmado ou uma pré-temporada falsa. Um ranking explicitamente nulo **dentro de um envelope válido** mantém a semântica anterior do contrato. O Top XI continua preso ao ID do ranking do chamador. O cache não é persistente entre requests.

## Verificação delimitada

- `artifacts/ssr-shared-ranking-20261101/focused-initial.log`: **63 PASS, 0 FAIL, 0 SKIP**, leitores estritos, envelope completo, loaders reais em harness VM, concorrência das leituras e falhas. O harness emula o contrato de cache por request; não pretende testar a implementação interna do React.
- `contracts.log`: **41 PASS, 0 FAIL, 0 SKIP**, contratos de versão de pontuação, liderança, rating publicado, Top XI e consumidores. Arquivos distintos do primeiro lote; não confundir com as suítes globais anteriores.
- `typecheck.log`: **13 entradas, zero diagnósticos**; TypeScript restrito aos paths desta tarefa e testes, sem diagnóstico global de dependências.
- `lint.log`: resultado focado registrado; manifesto final em `manifest.json`.
- Preimagens em `preimage/` e `preimage-manifest.json`. A revisão independente tem recibo próprio quando concluída; não é presumida por este relatório.

Os testes existentes que validavam a consulta antiga do ponteiro de treinador foram adaptados para a leitura exata do snapshot: continuam verificando identidade, liga, campo permitido, catálogo, privacidade, integridade do ranking inteiro, composição casa/fora e rejeição de fonte inválida. Os testes de concorrência do leitor de jogador preservam a observação de rejeições concorrentes. Os poucos testes estáticos passaram a referenciar o arquivo extraído; nenhuma expectativa financeira foi relaxada.

## Pendências preservadas

Esta mudança **não** reconsulta o fixture `19722185`, resolve a identidade do reserva, cadastra o treinador histórico, altera a cadência, desacopla a publicação global ou corrige pontos da VIP DRAFT. Esses achados permanecem na auditoria anterior. Também não se declara que um envelope válido antigo é atualizado: a correção garante consistência de autoridade, não frescor dos dados oficiais.

Antes de publicar: revisão independente, integração com as outras frentes da candidata, gates consolidados do root e validação no site. Não foi executado build local/global, browser, SQL, chamada de provider, migração, deploy ou escrita remota.

## Registro obrigatório da missão

**MISSION:** corrigir autoridade do ranking no SSR público.
**SCOPE:** cinco arquivos de fonte; sete testes existentes diretamente afetados; relatório e artefatos.
**QA BRANCH:** candidata detached `qa-stripe-release-20261029`; destino futuro `qa`.
**QA COMMIT:** base `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694`; alterações não commitadas, WIP compartilhado.
**QA DEPLOYMENT:** nenhum novo.
**REMOTE BUILD BUDGET / CONSUMED:** zero / zero.
**STABLE QA URL:** https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
**FILES CHANGED:** manifesto exato em `artifacts/ssr-shared-ranking-20261101/manifest.json`.
**FUNCTIONAL RESULT:** verde local delimitado pelos dois lotes acima; integração e QA pendentes.
**VISUAL / RESPONSIVE / ACCESSIBILITY RESULT:** não avaliados; nenhum PASS visual.
**SECURITY RESULT:** somente leitura por IDs imutáveis; sem fonte mutável de fallback, segredo, novo grant ou mudança de gate.
**BROWSER MATRIX:** não executada neste lote.
**TESTS:** 63 focados e 41 contratos, sem falhas; TS restrito zero.
**BUILD:** não executado; reservado ao root para a candidata consolidada.
**OBSERVABILITY:** logs e preimagens preservados; nenhuma execução remota deste agente.
**OPEN FINDINGS:** revisão/integração/publicação e os demais achados da auditoria permanecem pendentes até prova própria.
**PRODUCTION:** NOT TOUCHED.

| TOOL / PLUGIN | RELEVANT | LOADED | EXECUTED | RESULT | EVIDENCE |
|---|---|---|---|---|---|
| Shell / Node / TypeScript / ESLint | Sim | Sim | Sim | Testes e checagens focadas | diretório de artefatos acima |
| Supabase | Sim, fronteira de leitura | Skill lida | Não | Sem consulta ou mutação remota | escopo registrado |
| apply_patch / edição local | Sim | Sim | Sim | Fonte e documentação local | manifesto/preimagens |
| Browser / build / deploy | Não nesta fatia | Não | Não | Não executados | gates consolidados do root |
