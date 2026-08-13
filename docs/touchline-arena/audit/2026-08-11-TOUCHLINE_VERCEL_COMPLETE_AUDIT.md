# TouchLine — auditoria Vercel completa

**Data da observação:** 11 de agosto de 2026
**Método:** painel Vercel autenticado e configuração versionada; nenhum ajuste remoto foi feito. Valores secretos não foram lidos nem registrados.

## Resultado executivo

| Item | Estado |
|---|---|
| Saúde operacional atual | **Boa, com riscos de processo** |
| Produção atual | **Ready** |
| P0 Vercel inexplicado | **Nenhum observado** |
| Bloqueios P1 | Preview de produto indisponível; falhas de build recentes; DNS recomendado; 2FA pendente |
| Próximo gate | recuperar os cards localmente, sem promover produção antes de uma Preview/validação aprovada |

## Identidade do projeto

- Time: **Fifa Agent Plataform** — plano **Pro**.
- Projeto: **touchline-arena-official**.
- ID do projeto: `prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM`.
- Repositório conectado: `luizeuropemalta-commits/touchline-football-platform`.
- Produção: branch **main**, commit `304d5bb` (`test(arena): cover scheduled premium rail state`).
- Deployment de produção atualmente ligado ao domínio: `FEtvXPhXPtZnsshsXg6QCxNtMP2N`, **Ready**, duração de 1m34s, criado em 10 de agosto.
- Framework: **Next.js**; Node: **24.x**; diretório raiz vazio; comandos de instalação/build sem override (detecção do projeto); build ignore step em `Automatic`.

## Plano, uso e adequação comercial

| Campo | Evidência |
|---|---|
| Plano | Pro |
| Adequação para uso comercial | Sim, em princípio; a confirmação de cobrança/limites exige o responsável financeiro |
| Crédito do ciclo | US$12,43 consumidos de US$20,00 no período 4 ago–4 set (painel pode atrasar até 1h) |
| Uso observado no projeto | 789 Edge Requests, 220 Function Invocations, taxa de erro 0% (janela exibida de 6h) |
| Analytics / Speed Insights | Não habilitados; recomendação de observabilidade, não falha de produto |

Não houve upgrade, compra, alteração de limite ou cobrança.

## Produção, domínios e DNS

| Domínio | Estado no painel | Ação |
|---|---|---|
| `touchline.com.br` | Production; **DNS Change Recommended** | requer ajuste de DNS externo aprovado |
| `www.touchline.com.br` | Production; **DNS Change Recommended** | requer ajuste de DNS externo aprovado |
| `touchline-arena-official.vercel.app` | Valid Configuration; Production | manter |

O painel informa que os registros legados continuam funcionando. A recomendação é migrar, quando autorizado, para:

- `@` A → `216.150.1.1`;
- `www` CNAME → `057a678f07fe227c.vercel-dns-017.com.`

Isso não foi aplicado. Como os domínios responderam e a Vercel classifica a mudança como recomendada, trata-se de **P1 de manutenção**, não P0.

## Git, deployments e falhas recentes

O projeto recebe deploy automático pelo repositório conectado, com `main` como fonte da produção. O painel mostra quatro branches Preview ativas: `work/manchester-city-manual-import-20260809`, `preview/market-contract-readiness-20260809`, `HEAD` e `safety/touchline-2026-06-28-wip`.

Foram observados vários deployments recentes com `Error`, incluindo tentativas de produção e Preview. Dois diagnósticos reproduzíveis no painel:

1. **Produção `7H3wvv8BwwUC2czt7czdt7bZ9qSp`**: `pnpm run build` falhou por erro de TypeScript em `lib/touchlineArena/editorial-card-profile.ts`, onde `lastReviewedAt` foi inferido como `unknown`, não `string`.
2. **Preview `3GPgGJUcTGDCna5jUvALpcqqDGUP`**: o build foi bloqueado antes de servir a aplicação por `assertTouchlineIsolatedPreviewEnvironment()` em `lib/touchlinePreview/isolation.ts`. O Preview recebeu variáveis de produto/produção e não recebeu o contrato isolado exigido (`TOUCHLINE_*_DEPLOYMENT_MODE`, bindings de projeto/time). O bloqueio é deliberadamente fail-closed e evitou vazamento de produto/credenciais para Preview, mas torna esse Preview inutilizável para validação funcional.

O build de produção atual está Ready. Não há evidência de loop de deploy ativo, mas os avisos correspondem às falhas acima e devem ser tratados como **P1** antes da próxima promoção.

## Variáveis de ambiente — nomes e escopo observados

Foram visualizados somente nomes/tipos/escopos. Não foram abertos valores.

- Produção possui as variáveis de aplicação de Supabase, Sportmonks e Football Data necessárias ao produto, além de URLs do site/auth e `TOUCHLINE_OWNER_EMAILS` / `TOUCHLINE_SITE_OFFLINE`.
- Preview também possui uma combinação de `SUPABASE_*`, `SPORTMONKS_*`, `FOOTBALL_DATA_*`, URLs públicas e flags TouchLine.
- A configuração versionada em [`lib/touchlinePreview/isolation.ts`](../../../lib/touchlinePreview/isolation.ts) rejeita exatamente esse cenário: Preview que herda ambiente de produto, fora de um projeto isolado, falha antes de construir.

Classificação:

| Classe | Avaliação |
|---|---|
| Required / present | Variáveis de produto existem em Production |
| Wrong scope / processo | Variáveis produtivas em Preview impedem o Preview isolado obrigatório |
| Security positive | O código falha fechado, em vez de publicar Preview com dados/segredos de produto |
| Security P1 | 2FA não está configurado na conta, segundo alerta do painel |
| Não auditável sem decisão | valores, permissões de cada segredo e histórico de mudanças |

## Segurança, cron e observabilidade

- O painel mostra alerta de conta sem 2FA. A ativação depende do autenticador do proprietário; não foi alterada.
- `Protected Sourcemaps` está habilitado.
- Existe um segredo de bypass de automação criado em 3 de agosto; com proteções desativadas ele não tem efeito. Não foi exposto nem rotacionado.
- Cron Jobs está habilitado no projeto, mas não foi exibido nenhum job configurado neste painel.
- Logs de runtime da produção: 0 avisos, 0 erros e 0 fatais no intervalo visível. Há respostas 200 e redirecionamentos 307 esperados de rotas autenticadas.
- Analytics, Speed Insights e Observability Plus não estão habilitados. São recomendações, não causa dos cards ou do build.

## P0 e P1

### P0

Nenhum P0 Vercel inexplicado observado: produção está Ready, domínio responde e o log de runtime visível não mostrou erros.

### P1

1. Preview funcional está bloqueado pelo contrato de isolamento, porque o projeto Preview atual herda variáveis produtivas e não satisfaz o contrato isolado.
2. O candidato editorial recente contém erro de TypeScript e gera falha de build.
3. DNS de `touchline.com.br` e `www` usa registros legados; Vercel recomenda migração planejada.
4. Conta Vercel sem 2FA configurado.
5. Não há deployment checks obrigatórios no painel; a configuração de build por si só não prova que lint/testes completos rodaram antes de um deploy.

## Gate do bloco Vercel

Não há P0 inexplicado que impeça o trabalho local de recuperação dos cards. Entretanto, **nenhum candidato deve ser promovido** até:

1. o erro TypeScript ser corrigido;
2. haver uma Preview segura e validável, ou uma decisão explícita de que a validação será local com o mesmo build de produção;
3. Liverpool, ClubHub e Quick Sub passarem na matriz visual acordada;
4. o responsável decidir sobre 2FA e a migração DNS recomendada.

Consulte também [candidatos de limpeza Vercel](./2026-08-11-VERCEL_CLEANUP_CANDIDATES.md).
