# Descoberta pública — preparação QA, 2026-11-01

**Estado: preparado; nenhuma ativação ou publicação executada por este agente.**

## Evidência atual

Consulta protegida no projeto `xgxbwqxjssxxuihuwmgy`: gate do banco desativado, uma linha de configuração, zero perfis e zero perfis publicados. As duas fixtures existem, não são anônimas, banidas ou removidas e têm `touchline_arena_access_v1=true`. Na tabela `public.users` ambas têm o papel de aplicação `agent`; não há um literal SQL CUSTOMER nessas linhas. São as duas personas de cliente identificadas pelo coordenador, separadas do ADMIN.

- VIP: `072900f3-27fc-41a5-9881-6913a486754e`.
- Standard: `8f430e6a-cc9d-47df-b623-c5c0b4e5ab43`.

O SELECT preservado não exporta e-mails, metadados completos, JWTs ou cookies. O resultado e os fingerprints das funções estão em `artifacts/social-discovery-activation-20261101/preflight-observed.json`. O gate efetivo do aplicativo `TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED` é independente: ainda precisa ser comprovado pelo coordenador na versão publicada. Este pacote não altera Vercel nem solicita deploy.

## Caminho exato

1. Confirmar a ferramenta conectada ao projeto QA acima e repetir `preflight-read.sql`; interromper se a pré-imagem divergir.
2. Confirmar que a versão publicada disponibiliza a rota e o gate de aplicação. Se estiver fechado, a configuração precisa entrar no pacote QA do coordenador; não tratar o gate do banco como solução suficiente.
3. Após revisão, executar **somente** `enable-qa-gate.sql` pelo conector explicitamente direcionado à QA. O arquivo bloqueia as tabelas brevemente, exige gate false e zero perfis, confere as duas identidades e fingerprints/ACL, e altera somente `configuration.enabled` usando a permissão já concedida ao papel `service_role`.
4. Em cada sessão CUSTOMER real, abrir `/clubowners?lang=pt-BR#public-profile`, escolher um nome público explícito e publicar pelo formulário existente. O contrato correspondente é GET/PUT `/api/account/public-profile`; os payloads preparados são `customer-owned-flow.json`. Os nomes propostos para as duas fixtures são **Luiz VIP** e **Luiz Standard**. Não derivar nome, e-mail ou foto automaticamente de Auth.
5. O PUT leva somente `displayName` e `published`. Ele usa o JWT da própria sessão e a RPC protegida. Não copiar cookies/chaves, não sintetizar claims, não executar `set_config('request.jwt.claims',...)`, nem inserir diretamente nas tabelas privadas.
6. Ler novamente o perfil após salvar e capturar os IDs **públicos**. Validar busca por nome/ID entre as contas, visita e seguir/deixar de seguir de forma idempotente. Comparar a exposição com o contrato permitido; nenhum ID interno ou e-mail pode aparecer na resposta pública.
7. Repetir SELECT e guardar recibo de execução separado: alvo, instante, gate antes/depois, contagens, nomes/IDs públicos, status HTTP e resultados de busca/visita/follow/refresh. Timeout de escrita é incerto: reler antes de repetir.

O gate habilita a funcionalidade de descoberta na **QA inteira**, não uma allowlist de duas contas. A pré-condição de zero perfis impede publicar silenciosamente registros pré-existentes; este pacote só prepara a publicação consentida das duas fixtures. Os demais usuários elegíveis continuariam podendo usar o fluxo normal de consentimento se acessassem a QA. Não há publicidade automática de contas.

## Limites e reversão

A função `touchline_assert_qa_fixture_target` verifica apenas o literal informado. Ela **não detecta sozinha uma conexão em ambiente errado**. A seleção do projeto no conector, os fingerprints e o preflight são fronteiras complementares; nunca executar estes arquivos em Production.

A QA não tem a coluna de consentimento `photo_published` observada na preparação. O payload deste lote não contém `photoPublished` e não habilita fotos. A publicação de foto permanece no lote próprio de migração, configuração e consentimento.

Se houver necessidade de desfazer, ocultar os dois perfis com PUT `published=false` nas respectivas sessões e executar `restore-qa-gate.sql`. Em falha urgente, restaurar primeiro o gate false bloqueia imediatamente a descoberta por RPC; a ocultação individual fica registrada como pendente se as sessões não estiverem acessíveis. A restauração preserva os IDs públicos e o histórico: não promete retornar fisicamente a zero linhas e não apaga dados para fabricar uma pré-imagem. Se já estiver false, o UPDATE retorna zero linhas; confirmar por SELECT.

A publicação não completa automaticamente a busca ordenada por ranking, fotos, a visita ao elenco/Exchange alheio nem o botão seguir na lista. Esses requisitos continuam no backlog consolidado, separados deste desbloqueio de descoberta por nome e ID.

## Registro de entrega

MISSION: preparação controlada de descoberta pública das duas contas CUSTOMER QA.
CLASSIFICAÇÃO: AUDIT/read-only remoto; preparação local de comandos.
SCOPE: configuração privada de descoberta e fluxo existente de perfil público.
QA BRANCH: candidata detached, destino futuro qa.
QA COMMIT: HEAD 47ebfffbbda98cbb89bcd3ad08fb19efd1e50694 com WIP compartilhado; sem commit deste lote.
QA DEPLOYMENT: nenhum.
REMOTE BUILD BUDGET / CONSUMED: zero / zero.
STABLE QA URL: https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
FILES CHANGED: somente artifacts/social-discovery-activation-20261101 e este relatório.
FUNCTIONAL RESULT: causa de gate/perfis confirmada por SELECT; execução/publicação/testes entre contas pendentes.
VISUAL/RESPONSIVE/ACCESSIBILITY: não executados neste lote.
SECURITY: sem novos grants; RLS e RPCs preservados; nenhuma impersonação; contrato de nome público explícito.
BROWSER MATRIX: nenhum navegador controlado por este agente.
TESTS: sem suíte ampla, build ou teste de navegador repetido; SQL preparado ainda não executado nem ensaiado.
BUILD: não executado, pois este lote altera somente documentação/artefatos.
OBSERVABILITY: SELECT e resultado saneado preservados; manifesto com hashes.
OPEN FINDINGS: gate de aplicação efetivo, execução do gate QA, publicação consentida, smoke entre contas e fotos.
PRODUCTION: NOT TOUCHED.

| Ferramenta | Execução | Evidência | Decisão |
|---|---|---|---|
| Supabase | SELECT read-only QA | preflight-observed.json | Preparar gate; não declarar ativação |
| Shell / leitura local | rotas, handler, migration e ACL | hashes no manifesto | Publicar via sessão própria |
| apply_patch | artefatos e relatório | arquivos locais | Sem mudança de produto |
| Revisor independente | solicitado | aguardando recibo | Coordenador aplica somente após revisão |
