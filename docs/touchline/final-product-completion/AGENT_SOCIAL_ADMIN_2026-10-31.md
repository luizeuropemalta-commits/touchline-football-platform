# Social e administração — auditoria e correções locais

Data: 31/10/2026. Setor delegado ao agente `social_finance_admin_finish`. Este relatório complementa a fila integral; não a substitui nem declara administração ou social integralmente aprovados.

## Escopo e identidade

- Worktree: `worktrees/qa-stripe-release-20261029`.
- Base: `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694`; mudanças deste setor ainda locais.
- Missão: corrigir falhas concretas nos registros financeiros/e-mails e revisar descoberta/perfil público. Nenhum deploy, consulta a contas reais, alteração de dados remotos ou cobrança.
- Excluídos: avatar/notificações, sincronização de futebol, publicação de cards, CSS global e checkpoints compartilhados, sob responsabilidade das demais frentes.
- Fontes reconciliadas: `RECONCILIACAO_PREDEPLOY_2026-10-30.md`, `STATUS_RETOMADA_2026-10-31.md` e backlog integral em `worktrees/qa-final-20261027/docs/touchline/final-product-completion/TOUCHLINE_POST_CREDITS_IMPROVEMENT_BACKLOG_2026-10-31.md`, especialmente setores 5 e 7.

## Correções aplicadas

| Falha | Correção | Estado |
|---|---|---|
| Documentos, importações e pendências eram ordenados por UUID | Documentos por recebimento; importações/pendências por atualização; desempate único estável. Ordenação da última conferência continua independente | Verde local API |
| Cadastros financeiros eram ordenados por UUID | Fornecedores por nome; contratos, faturas e pagamentos pela data de negócio mais recente; ID como desempate | Verde local API + SQL |
| Conflito de importação `STALE` era apresentado como “Lote processado” | Mensagem informa que outra execução avançou a importação e que o lote não foi aplicado; a consulta dos registros é refeita | Verde local navegador |
| Body de publicação de perfil/seguir podia ficar esperando indefinidamente | Prazo de 10 segundos, cancelamento da leitura e resposta inválida sem executar RPC/mutação; limites de bytes e controles de origem/autorização preservados | Verde local handler |

Não há migração neste setor. Valores financeiros, saldo TC, consentimento social e políticas de publicação não foram alterados.

## Arquivos próprios alterados

1. `app/api/admin/company-finance/mail/route.ts`
2. `app/api/admin/company-finance/route.ts`
3. `components/touchline/admin/CompanyMailPanel.tsx`
4. `lib/touchlineArena/clubowner-public-handler.ts`
5. `tests/company-mail-route.test.mts`
6. `tests/company-finance-api.test.mts`
7. `tests/company-finance-integration.test.mts`
8. `tests/company-mail-browser.test.mts`
9. `tests/clubowner-public-handler.test.mts`

Reversão: retirar somente os hunks próprios destes nove arquivos; preservar WIP de outros setores. Sem reversão de banco necessária.

## Evidência executada

- Suíte proporcional de 14 arquivos de social/admin/API: **66 PASS, 0 FAIL, 1 SKIP**. O skip era integração SQL condicionada à variável; foi executado na etapa seguinte. Não somar essas contagens às reexecuções.
- SQL explicitamente habilitado com `TOUCHLINE_COMPANY_PGLITE_MODULE=@electric-sql/pglite`: **34 PASS, 0 FAIL, 0 SKIP** em integração/persistência financeira, persistência de e-mails e descoberta social. Evidência: `artifacts/social-admin-20261031/sql-tests.log`.
- Regressão social após o prazo de body: **10 PASS, 0 FAIL, 0 SKIP**. Evidência: `artifacts/social-admin-20261031/social-handler.log`.
- Browser de e-mails: **1 teste PASS**, contendo **30 cenários** (Chromium/Firefox/WebKit × PT/EN × 390/768/844/1280/1440 px). Inclui erro/recuperação, texto não confiável, download original, conferência com retry idempotente, paginação, filtro técnico recolhido, importação desabilitada e conflito `STALE` sem falso sucesso. Evidência: `artifacts/social-admin-20261031/mail-browser.log`.
- O primeiro browser foi impedido pelo sandbox macOS (`MachPortRendezvousServer ... Permission denied`); a execução isolada autorizada fora do sandbox passou. Nenhum serviço externo foi acessado pelo fixture.
- ESLint nos nove arquivos: exit 0, sem saída de erro. `git diff --check`: exit 0. Evidência lint: `artifacts/social-admin-20261031/lint.log`.
- Captura WebKit PT 844×390 inspecionada: mensagem nova legível e sem sobreposição no componente; captura de página inteira inclui rolagem. Não prova Safari nativo ou aparelho físico. Capturas originais em `/private/tmp/touchline-mail-browser/`.
- TypeScript global `tsc --noEmit --incremental false`: **exit 0**; resultado em `artifacts/social-admin-20261031/typecheck.log` (sem erros).

Os testes SQL usam PGlite local, sem simular aprovação de produção. Fixtures de navegador exercitam componentes reais com transporte HTTP sintético: não provam OAuth/Gmail/armazenamento na QA.

## Social: cobertura atual e trabalho ainda necessário

Comprovado no código e testes locais: perfis públicos por consentimento explícito; ID público permanente separado da identidade privada; busca por prefixo de nome ou ID completo, limitada a 20 resultados; visita a perfil público; seguir/deixar de seguir autenticado e idempotente; perfil oculto não é revelado; erros não são convertidos em contagem zero.

**Pendente de implementação/consolidação:**

- Resultado da busca hoje não traz seguidores nem posição/pontos no ranking; não há listagem inicial ordenada por classificação nem botão Seguir na própria linha.
- Perfil público atual não contém vitrine de elenco/mercado nem ação de proposta direcionada à outra conta.
- A cópia de consentimento atual promete manter o elenco privado. Ampliar a vitrine exige projeção pública delimitada e texto de consentimento consistente, sem expor saldo, e-mail ou identidade interna.
- O servidor de Exchange trabalha com identidade interna; precisa de resolução autorizada de ID público para contexto de negociação, sem exportar identificadores privados.
- Os dois clientes QA precisam comprovar busca, visita, seguir e proposta/aceite no mesmo deployment. Esses testes não foram executados por este setor.
- Foto propagada e curtidas globais continuam nas frentes responsáveis; não foram reclassificadas como verdes.

Próximo recorte recomendado: contrato público de resultados com seguidores e ranking autoritativo, depois vitrine de negociações permitida pelo titular e ponte segura para Exchange. Não criar ranking paralelo ou inferir pontos por nome.

## Administração: cobertura atual e lacunas preservadas

Existem cadastros de fornecedores, contratos, contas a pagar, pagamentos confirmados, documentos privados, correção auditada de pagamentos e totais separados por moeda. Os testes comprovam idempotência, falha sem mutação parcial, papéis privados e não contabilização automática de um e-mail como pagamento.

**Pendente de integração/implementação:**

- Importador atual preserva mensagem MIME original `.eml`, checksum e texto; não materializa automaticamente cada PDF/anexo em um documento individual categorizado. Acesso ao `.eml` não equivale à organização de anexos solicitada.
- Classificação por assunto é indicação para conferência, sem extração/conciliação financeira completa. Faturas antigas de ambas as caixas e valores de OpenAI não foram recontados neste setor.
- Inventário de serviços gratuitos/pagos ainda não possui campos operacionais completos para plano, limite, conta responsável, URL e próxima revisão. Registrar todos os fornecedores e contratos não comprova esse inventário.
- Job existente enfileira scans, executa lotes e retenta mensagens antigas com controles de cursor/lease. Falta provar configuração efetiva, execução e cobertura das duas caixas na QA; um scan finalizado pode ainda ter leituras pendentes.
- Atividade e contratos de ClubOwner, automação integral de operação e estados de sincronização de futebol permanecem nos setores próprios. Este trabalho não entrega a operação autônoma de toda a empresa.
- `STALE` agora é verdadeiro, mas migrações/configuração remota/identidades e confirmação pós-deploy permanecem gates separados.

## Registro da missão

**MISSION:** correções locais de organização administrativa e robustez social.
**SCOPE:** nove arquivos listados; nenhuma ampliação de exposição pública ou gravação remota.
**QA BRANCH:** candidata detached de `47ebfff`; destino de release a cargo do coordenador.
**QA COMMIT:** WIP não commitado.
**QA DEPLOYMENT:** não executado nem inspecionado neste setor.
**REMOTE BUILD BUDGET / CONSUMED:** 0 / 0.
**STABLE QA URL:** https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
**FILES CHANGED:** manifesto acima.
**FUNCTIONAL RESULT:** verdes locais delimitados; social/admin integrais permanecem abertos.
**VISUAL RESULT:** inspeção de captura isolada WebKit; sem aprovação global.
**RESPONSIVE RESULT:** 30 cenários isolados; não prova dispositivos físicos.
**ACCESSIBILITY RESULT:** fluxo usa labels/roles/controles existentes; sem auditoria assistiva global.
**SECURITY RESULT:** autorização, origem, ator, privacidade e prazo de leitura preservados/testados; nenhum segredo no diff.
**BROWSER MATRIX:** Chromium, Firefox, WebKit; Safari nativo e físico pendentes.
**TESTS:** contagens e limites acima; não somar resultados sobrepostos.
**BUILD:** não executado pelo setor; consolidar na raiz.
**OBSERVABILITY:** logs locais e capturas; nenhuma inspeção de logs remotos.
**OPEN FINDINGS:** descoberta com ranking e mercado, inventário de serviços, extração de anexos, cobertura de e-mails histórica, QA real e revisão independente final a cargo do coordenador.
**PRODUCTION:** NOT TOUCHED.

| Ferramenta/plugin | Relevância e execução | Resultado/evidência |
|---|---|---|
| Shell/Node | Código, rotas, testes e lint executados | Logs do setor e diff |
| PGlite | Migrations e dados sintéticos locais executados | 34 PASS |
| Playwright | Componentes reais, transporte isolado | 30 cenários PASS |
| Supabase docs | Consulta oficial sobre múltiplas ordenações e referencedTable | API confirmada; nenhuma ação remota de banco |
| Visualização local | Captura WebKit inspecionada | Sem sobreposição observada no componente |
| Vercel/Gmail/Stripe | Não usados neste setor | Nenhuma publicação, envio ou cobrança |

## Adendo de backlog — automação oficial de transferências, 2026-11-01

O recorte técnico de automação solicitado pelo coordenador está em [AGENT_AUTOMATIC_TRANSFER_PROPOSAL_2026-11-01.md](AGENT_AUTOMATIC_TRANSFER_PROPOSAL_2026-11-01.md). É somente proposta baseada em leitura de código: cron atual captura, apply depende de decisão e não reconcilia a publicação. O documento descreve operação por jogador já publicado, CAS, locks, aplicação/publicação/recibo atômicos, recuperação de falhas, limites editoriais e testes necessários. **Não implementado nem habilitado; não acrescenta verde funcional.** A fonte permanece congelada para a suíte ampla do coordenador. Não altera o escopo aberto de social/financeiro acima.

## Adendo de backlog — publicação compartilhada pendente, 2026-11-01

A auditoria [AGENT_SHARED_PUBLICATION_PENDING_AUDIT_2026-11-01.md](AGENT_SHARED_PUBLICATION_PENDING_AUDIT_2026-11-01.md) comprova por fonte o alcance do bloqueio `lineup-identity-pending`, distingue o ranking ativo da publicação compartilhada e separa a proteção numérica correta do bloqueio da Live válida. Propõe continuidade com revisão imutável e cobertura por domínio, sem ausência/pontos inventados ou bypass dos leitores. **Somente diagnóstico/proposta; sem fontes, SQL remoto ou testes alterados/executados neste recorte.** O estado histórico da QA citado no documento não foi revalidado. Mantém a pendência de sincronização e prêmios aberta.

## Adendo — consulta oficial preparada, 2026-11-01

[AGENT_OFFICIAL_FIXTURE_QUERY_2026-11-01.md](AGENT_OFFICIAL_FIXTURE_QUERY_2026-11-01.md) documenta o caminho protegido existente para consultar fixture Sportmonks `19722185`, a linha sem identidade e os vínculos de treinador. Artefato separado pronto para ambiente QA já autorizado, inspeção sem valores secretos e pin de host da autoridade; resolução local dos imports validada sem rede. **Não executado na Sportmonks; não acrescenta verde de sincronização ou publicação.** Nenhuma fonte de produto alterada.
