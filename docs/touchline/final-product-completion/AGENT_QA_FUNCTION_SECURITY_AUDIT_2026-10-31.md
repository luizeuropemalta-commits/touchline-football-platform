# Auditoria QA — funções privilegiadas e grants — 2026-10-31

## Escopo e conclusão

Missão AUDIT, somente leitura remota, solicitada pelo coordenador antes da auditoria final. Alvo confirmado pelo conector: **TouchLine Development QA**, referência `xgxbwqxjssxxuihuwmgy`, Postgres 17. Base Git observada: `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694`; worktree contém WIP compartilhado. Nenhum dado de cliente foi consultado. Nenhuma função de negócio foi executada, nenhuma ACL foi alterada, nenhuma migration aplicada.

**Conclusão delimitada:** existem grants anônimos desnecessários e um trigger sem `search_path` fixado. A inspeção dos corpos e das políticas NÃO demonstrou exploração anônima nem permissão irrestrita para operações sociais. Revogar todas as 21 funções de `authenticated` quebraria superfícies intencionais, inclusive helpers de RLS. O diagnóstico está concluído; a correção e sua validação funcional permanecem pendentes, sob controle do coordenador.

Evidência completa de catálogo, corpos SQL, ACL, políticas, triggers e versões encontradas: [catalog-evidence.json](../../../artifacts/qa-function-security-20261031/catalog-evidence.json). Os resultados são observações do instante da consulta, não garantia permanente.

## Classificação por objeto

| Objeto | Evidência atual QA | Risco e decisão |
|---|---|---|
| `create_ecosystem_organization(text,text,organization_type,char)` | SECURITY DEFINER, owner postgres, search_path vazio; PUBLIC e anon têm EXECUTE. Antes do primeiro INSERT exige `auth.uid() IS NOT NULL`. Cria organização e vínculo owner somente para esse UID. | **P2: superfície anônima excessiva**, sem escrita anônima comprovada; usuário autenticado pode criar sua organização por desenho histórico. Remover PUBLIC/anon, preservar authenticated/service_role. Não confundir owner de organização com ADMIN TouchLine. |
| `current_agency_id()` | SECURITY DEFINER, path vazio; retorna agency_id do registro `users.id=auth.uid()`. Sem argumento de outro usuário. | **P2: grant anon desnecessário**. Com UID nulo a expressão não encontra usuário. Necessário em políticas; preservar authenticated/service_role. |
| `is_organization_admin(uuid)` | SECURITY DEFINER, path vazio; exige membro com UID da sessão e papel owner/admin na organização alvo. | **P2: grant anon desnecessário**, resultado falso sem UID. A consulta de organização alheia não concede vínculo. Preservar authenticated/service_role. |
| `is_organization_member(uuid)` | SECURITY DEFINER, path vazio; existe vínculo com UID da sessão e organização alvo. | **P2: grant anon desnecessário**, resultado falso sem UID. Preservar authenticated/service_role. |
| `handle_new_user()` | SECURITY DEFINER, path vazio, RETURNS trigger. Trigger habilitado `on_auth_user_created` AFTER INSERT em `auth.users`. anon/authenticated sem SELECT/INSERT/UPDATE/DELETE nessa tabela. Insere somente id e nome de apresentação; metadado não define papel. | **Grant excessivo de função trigger**, não uma RPC ordinária chamável com NEW arbitrário. Cadastro legítimo deve continuar acionando o trigger. Retirar EXECUTE de PUBLIC/anon/authenticated/service_role e testar signup isolado; não apagar trigger. |
| `football_player_profile_snapshots_touch_updated_at()` | SECURITY INVOKER, RETURNS trigger, proconfig nulo; único corpo `NEW.updated_at=now(); RETURN NEW;`. Trigger BEFORE UPDATE habilitado. Tabela RLS apenas service_role; anon/auth não têm política permissiva aplicável. | **P2 de hardening / baixo risco demonstrado**: falta fixar search_path; não executa DDL, lookup ou código privilegiado. Fixar path vazio; validar atualização service_role e negação de cliente. Não converter para SECURITY DEFINER. |

Os cinco SECURITY DEFINER acima têm ACL contendo tanto `PUBLIC=X` como `anon=X`: revogar apenas anon não fecha a permissão herdada de PUBLIC.

## As 21 funções acessíveis a authenticated

A contagem 21 contém sobreposição com as cinco funções anônimas; não são 21 falhas adicionais.

- **6 helpers/ecossistema/trigger:** os cinco acima e `current_agency_role()`. Esta última já exclui anon, usa path vazio e retorna papel somente do UID da sessão. A ACL de coluna de `public.users` permite ao authenticated atualizar full_name, avatar_url, phone e job_title; **não** permite alterar role, agency_id ou balance_cents.
- **3 buscas globais intencionais:** `search_global_football_links`, `search_global_player_profiles`, `search_transfermarkt_entities`. Anon bloqueado; somente SELECT de catálogos globais de futebol, limites máximos 100/50/100. Fontes locais e comentários da migration 056 declaram explicitamente a busca autenticada. Não encontrei leitura de faturas, saldo de ClubOwner ou usuários nesses corpos. O path fixo é `public,pg_catalog`; nem anon nem authenticated têm CREATE em public. Preservar grants neste patch. Mover os builtins para pg_catalog/qualificar extensões pode ser um endurecimento separado, com testes de busca; não substituir cegamente por path vazio porque `similarity` depende do schema da extensão.
- **12 sociais:** 11 operações e 1 guard. Todas as 11 começam no corpo com `touchline_social_require_owner_actor(...)`, antes de escrita/lock. O guard exige UID não nulo, igualdade com o ator recebido e presença na tabela privada de aprovadores. A tabela `touchline_social_owner_approvers` tem RLS + FORCE RLS, nenhuma política permissiva e **nenhum SELECT/INSERT/UPDATE/DELETE para anon/authenticated**; service_role tem somente SELECT. Não há autoinscrição por essa tabela. Os grants authenticated são intencionais, sujeitos a esse guard; mantê-los neste patch.

Operações sociais inspecionadas: `touchline_social_041_approve`, `042_approve`, `043_approve`, `044_approve`, `046_approve_template`, `046_set_delivery_control`, `046_set_template_state`, `approve_artwork`, `approve_caption`, `cancel_draft`, `enqueue_dispatch`, todas com prefixo `touchline_social_`.

**Limite:** ler guard, grants e políticas não equivale a executar testes de autorização com JWT real. Testes negativos de cliente comum e ator adulterado continuam necessários antes de um PASS integrado.

## Divergência com o repositório

A migration `supabase/migrations/20260816165854_restrict_public_security_definer_function_execution.sql` já contém as revogações seletivas desejadas para os cinco objetos. A consulta ao histórico QA **não encontrou essa versão**. Isso não prova quando os grants surgiram nem se o SQL foi executado manualmente no passado; prova somente divergência entre o estado atual e a intenção versionada.

A migration de identidade `touchline_agency_identity_authorization_hardening` consta como versão remota `20260815013640`; as restrições de coluna descritas acima estão efetivas.

Referências locais:

- `supabase/migrations/001_initial_schema.sql`: helpers e trigger de cadastro; políticas antigas.
- `supabase/migrations/002_global_ecosystem.sql:303`: funções de organização e políticas dependentes.
- `supabase/migrations/021_football_player_profile_snapshots.sql:41`: trigger de updated_at.
- `supabase/migrations/056_touchline_legacy_search_function_acl_hardening.sql`: intenção explícita dos 3 RPCs de busca.
- `supabase/migrations/057_touchline_agency_identity_authorization_hardening.sql`: proteção role/agency e helper current_agency_role.
- `supabase/qa/039_touchline_qa_social_approval_outbox.sql:1616`: guard de proprietário; ACL privadas nas linhas 2737–2787.
- `supabase/qa/041_*`, `042_*`, `043_*`, `044_*`, `046_*`: operações sociais protegidas.

## Patch mínimo recomendado — NÃO APLICADO

Criar uma **nova migration forward**, após conciliar a ausência da versão antiga; não editar/apagar histórico nem fazer replay amplo de migrations. A intenção mínima:

```sql
revoke execute on function public.create_ecosystem_organization(
  text, text, public.organization_type, char
) from public, anon;
revoke execute on function public.current_agency_id() from public, anon;
revoke execute on function public.is_organization_admin(uuid) from public, anon;
revoke execute on function public.is_organization_member(uuid) from public, anon;

grant execute on function public.create_ecosystem_organization(
  text, text, public.organization_type, char
) to authenticated, service_role;
grant execute on function public.current_agency_id() to authenticated, service_role;
grant execute on function public.is_organization_admin(uuid) to authenticated, service_role;
grant execute on function public.is_organization_member(uuid) to authenticated, service_role;

revoke execute on function public.handle_new_user()
  from public, anon, authenticated, service_role;
alter function public.football_player_profile_snapshots_touch_updated_at()
  set search_path = '';
```

Não revogar todas as funções authenticated, não trocar helpers recursivos de RLS para invoker, não remover triggers. Não alterar defaults globais neste patch: os defaults atuais ampliam EXECUTE para anon/authenticated/service_role e exigem grants explícitos nas próximas migrations, mas corrigir defaults de uma vez exige inventário dos demais RPCs.

**Dependência de regressão:** políticas antigas `public.users` são TO PUBLIC e chamam current_agency_id. Após retirar EXECUTE anon, uma leitura anônima dessa tabela pode passar de vazia para permission denied. Dados de usuários não devem depender dessa leitura anônima; testar consumidores públicos e, se necessário, restringir essas políticas a authenticated em migration separada e revisada. Não abrir o helper novamente apenas para esconder erro de consumidor.

## Testes de aceitação propostos

Não executados remotamente nesta missão somente SELECT.

1. Em banco isolado, aplicar patch duas vezes; confirmar idempotência das ACL e path. Guardar antes/depois.
2. `has_function_privilege('anon',...,'EXECUTE')` falso para os cinco; authenticated verdadeiro para os quatro RPC/helpers e falso para handle_new_user.
3. Cliente comum não consegue fazer aprovações/cancelamentos/dispatch como outro ator nem se inscrever em owner_approvers; ator nulo e UID nulo rejeitados.
4. Usuários A/B: helpers devolvem apenas vínculo próprio; B não administra organização de A. Criar organização autenticada preserva transação e vínculo correto.
5. Cadastro QA descartável via Auth continua produzindo exatamente um perfil pelo trigger após revogar execute; sem perda de confirmação/login.
6. Service_role atualiza fixture de profile_snapshots com timestamp renovado; cliente/anon não atualizam. Sem alterar dados oficiais para testar.
7. Regressão das 3 buscas autenticadas e páginas públicas após hardening; sem conceder acesso anônimo a perfil privado para acomodar um consumidor.
8. Reconsultar advisors apenas após aplicação, com interpretação por função; alerta authenticated intencional não deve gerar revogação indiscriminada.

## Observações adjacentes, fora do patch mínimo

As tabelas users/organizations/organization_members/profile_snapshots têm ACL legadas amplas para anon/authenticated, embora RLS limite os comandos de linha. Algumas ACL incluem TRUNCATE/TRIGGER/MAINTAIN; **RLS não é uma proteção genérica para todo privilégio de tabela**. Esta auditoria não identificou um endpoint HTTP capaz de exercer TRUNCATE nem testou escrita. Registrar limpeza de grants de tabela como revisão separada de menor privilégio, sem alegar exploração de API comprovada.

Não foi consultado o conteúdo da lista de aprovadores, o histórico de clientes, e-mails ou segredos.

## Fontes oficiais consultadas

- [Supabase — Database Functions](https://supabase.com/docs/guides/database/functions): path explícito, privilégios por função e revogação de PUBLIC + role.
- [Supabase — lint 0029](https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable): acesso authenticated exige análise por objeto; operações intencionais podem conservar grant com validação.
- [PostgreSQL — Trigger Functions](https://www.postgresql.org/docs/current/plpgsql-trigger.html): contexto de trigger/NEW e retorno trigger.
- [PostgreSQL — CREATE TRIGGER](https://www.postgresql.org/docs/current/sql-createtrigger.html): vínculo com tabela e evento.

## Mission Completion Gate

**MISSION:** auditoria somente leitura dos alertas de funções QA.
**SCOPE:** 5 anon definers, 21 authenticated definers (sobrepostos), 1 trigger invoker/path e dependências catalogadas.
**QA BRANCH:** worktree qa-stripe-release-20261029, base detached.
**QA COMMIT:** 47ebfffbbda98cbb89bcd3ad08fb19efd1e50694 + WIP compartilhado; nenhum commit desta missão.
**QA DEPLOYMENT:** não consultado nem alterado.
**REMOTE BUILD BUDGET / CONSUMED:** 0 / 0.
**STABLE QA URL:** https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
**FILES CHANGED:** este documento e artifact de catálogo; nenhum arquivo de produto.
**FUNCTIONAL RESULT:** diagnóstico de ACL/corpos concluído; testes de autorização/smoke pendentes.
**VISUAL / RESPONSIVE / ACCESSIBILITY / BROWSER MATRIX:** não aplicável ao escopo de leitura SQL.
**SECURITY RESULT:** grants excessivos/path identificados; nenhum bypass demonstrado; patch somente proposto.
**TESTS:** leitura de catálogo e reconciliação de fontes; sem testes mutantes nem claim E2E.
**BUILD:** não executado — nenhuma mudança de produto.
**OBSERVABILITY:** evidência de catálogo preservada; nenhum log de cliente/segredo.
**OPEN FINDINGS:** patch forward e testes sob controle root; menor privilégio de tabelas separado.
**PRODUCTION:** NOT TOUCHED.

| Ferramenta | Ação real | Resultado | Decisão |
|---|---|---|---|
| Supabase get_project | confirmar referência QA | QA ativo, PG17 | alvo correto |
| Supabase execute_sql | SELECT catálogos, definições, ACL, políticas, migrations | evidência JSON salva | grants excessivos sem bypass demonstrado |
| Supabase search_docs | docs de funções e lint 0029 | autorização intencional confirmada como categoria | não revogar authenticated em bloco |
| Shell/rg/Git | ler migrations, guard e HEAD | fontes versionadas localizadas | forward patch seletivo recomendado |
| Web oficial PostgreSQL | docs triggers | contexto e vínculo confirmados | não tratar trigger como RPC normal |
