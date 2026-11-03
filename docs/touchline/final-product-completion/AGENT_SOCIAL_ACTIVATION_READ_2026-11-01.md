# Descoberta social — ativação mínima e limites reais

Leitura independente em 2026-10-31T23:03:28.355554+00:00. QA xgxbwqxjssxxuihuwmgy. Sem SQL de escrita, alteração de flags, publicação de perfil ou deploy. Complementa AGENT_QA2_SCORE_READ_2026-10-31.md e AGENT_SOCIAL_ADMIN_2026-10-31.md.

## Estado comprovado e razão do bloqueio

- Migração base 20261027201704_touchline_clubowner_public_discovery está aplicada.
- Ela cria configuration.enabled com default false e insere false explicitamente; seu comentário explica que aplicar a migração não ativa os RPCs.
- QA mantém enabled=false. Não há nenhum perfil (0 registros, 0 publicados).
- A tabela configuration não tem trilha temporal de mudanças. A leitura prova o estado atual e o default intencional; **não prova quem deixou/desativou a flag nem que nunca foi ligada**.
- A conta QA2 tem acesso Arena em metadata confiável, não é anônima, banida ou deletada. O valor legado public.users.role é agent; o fluxo usa auth.uid + raw_app_meta_data, não exige trocar essa role.
- A variável de aplicação TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED precisa ser exatamente true. Seu valor efetivo no deployment não foi lido por este agente. App OFF evita qualquer chamada; DB OFF bloqueia também chamadas diretas à RPC.
- Migração 20261030133824_touchline_people_public_avatar_consent **não está aplicada**. A tabela profiles não tem photo_published. Foto pública deve permanecer desligada até conclusão da frente de avatar.

## Fluxo existente — nome, ID e consentimento

1. /clubowners?lang=pt-BR abre busca e “Seu perfil público”. No header aparece “Encontrar amigos” se a flag app estiver ativa. Exchange reutiliza apenas a busca em um details, sem formulário de perfil.
2. GET /api/account/public-profile usa a sessão real do navegador → public.touchline_people_own_profile → função privada. Se não há perfil, retorna profile:null, HTTP 200 após gates.
3. O cliente escolhe nome de 2–60 caracteres e marca consentimento de publicação. Email e caracteres de controle são rejeitados.
4. PUT /api/account/public-profile envia somente displayName e published (photoPublished apenas quando foto pública autorizada). API valida same-origin, tamanho, auth e DTO; não aceita accountId/actorId/publicId do cliente.
5. A função save_profile deriva actor de auth.uid, cria um public_id UUID independente e permanente e faz upsert pelo account_id. Não existe handle @ único. Nomes iguais são permitidos; o UUID público diferencia contas. Renomear/ocultar não muda o ID.
6. Busca por prefixo literal (2–80 caracteres) ou UUID público completo; até 20 resultados e somente published. Visita: /clubowners/{publicId}?lang=pt-BR.
7. Perfil exibe nome, ID, seguidores e seguir/deixar de seguir. PUT /api/touchline/clubowners/{publicId}/follow envia apenas active:boolean. O banco trava a linha de destino, rejeita auto-follow e aplica estado desejado de forma idempotente. Um mesmo active:true repetido não duplica.
8. Ocultar perfil remove-o da busca/visita e bloqueia novos follows. Não apagar perfil para ocultá-lo; preservar ID e histórico.

## Preservação de dados privados

RLS está ON nas três tabelas. Anon/authenticated não têm SELECT/INSERT diretos. Funções privadas de domínio com SECURITY DEFINER e search_path vazio são acessadas pelos wrappers invoker com grants mínimos; actor/assert_enabled não têm EXECUTE anon/auth. As RPCs públicas de busca/visita são anon intencionais, mas só projetam nome escolhido, public ID e seguidores de perfis publicados.

Não usar service-role para simular o cliente, não conceder grants de tabela nem desabilitar RLS. Enviar a gravação pelo fluxo autenticado de cada conta de teste. A autorização ampla do usuário abrange as duas contas CUSTOMER de QA, não um opt-in generalizado de todos os usuários.

## Sequência mínima para o root executar posteriormente

1. Confirmar identidade das duas contas de teste e deployment QA; preservar ADMIN separado. Registrar estado anterior das duas flags e IDs já existentes.
2. Confirmar no deployment a variável TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED=true e que o código de descoberta está publicado. Se faltar env, juntar sua alteração ao deploy já planejado; salvar env sozinho não valida a aplicação em execução.
3. Ativar somente configuration.enabled na QA pela operação privilegiada já autorizada e controlada pelo root. Não ativar foto pública, buckets, retenção ou serviços não comprovados junto.
4. Nas duas sessões CUSTOMER do Safari, abrir /clubowners, salvar nomes inequívocos de QA pelo PUT normal e escolher publicação. Registrar public IDs diferentes entre si e diferentes dos IDs auth. Primeiro GET precisa confirmar dados gravados.
5. A encontra B por ID exato e prefixo; B encontra A. Confirmar navegação do resultado ao perfil correto. Com visitante sem sessão, ver apenas dados consentidos e pedido de login para seguir.
6. A segue B: B ganha um seguidor; repetir active:true mantém a contagem. Recarregar B e conferir header/own_profile. B segue A; conferir independência. Deixar de seguir decrementa uma vez.
7. Ocultar B: busca não retorna B, visita fica 404, novo follow é recusado; republicar mantém o UUID. Confirmar email/saldo/ID auth/elenco privado ausentes nas respostas públicas.
8. Validar erros, sessão expirada, payload com actor forjado e acesso direto às tabelas sem ampliar permissões. Os testes locais já cobrem esses contratos; não repetir writes remotos além do necessário.
9. Rollback funcional: DB enabled=false fecha RPCs e app flag OFF oculta entrada em deployment subsequente; preservar perfis/follows. Não fazer rollback apagando usuários.

A ativação básica não requer a migração de foto. Foto pública exige a migração de consentimento mais PUBLIC_AVATAR_ENABLED, AVATAR_READ_ENABLED, AVATAR_RETENTION_READY, origem QA direta verificada, owners configurados, imagem atual válida e consentimento separado. Não marcar esses requisitos como aprovados apenas porque a busca textual funciona.

## Provas locais existentes, não equivalentes a QA real

- artifacts/social-admin-20261031/sql-tests.log: 12 subcasos + wrapper de persistência social PASS em PGlite (parte do lote 34 PASS). Cobrem gates, opt-in, ID permanente, ACL, auth, auto-follow, idempotência, opt-out, falha transacional, nomes repetidos, limites e gate OFF.
- artifacts/social-admin-20261031/social-handler.log: 10 PASS do handler (payload/auth/origem/body/timeout/DTO), sem SQL remoto.
- tests/clubowner-public-browser.test.mts possui matriz de dois clientes/idiomas/motores com transporte interceptado e flag condicional. Não foi executado novamente nesta tarefa; não comprova duas contas reais QA.
- Testes de avatar público têm evidência própria no relatório do agente avatar; ainda não aprovam configuração/entrega remota.

## Pontos e classificação — texto e inconsistência encontrada

- Na página ClubOwner, market-metrics-i18n informa somente “Pontos da rodada” e “Pontos da temporada”. O bloco não explica FINAL-only nem que 41,19 é provisório.
- A tabela de ClubOwners em /rankings já usa clubOwnerStandingsNote: “Pontos de rodadas finalizadas. Inscritos sem rodada finalizada começam com 0.”
- **Inconsistência concreta de projeção local:** loadClubOwnerStandings/projectClubOwnerStandings inclui inscritos sem rodada FINAL com 0 e empates com a mesma posição; loadRankings em fantasy/server só cria seasonTotals quando há FINAL e rankTouchlineFantasyManagers dá posição ordinal diferente mesmo em empate. O header usa este segundo caminho. Por isso a conta pode aparecer em /rankings com 0 e ficar sem ranking no header.
- Correção mínima recomendada: unificar a autoridade de classificação/empates e inscrição usada pelo header e /rankings, mantendo FINAL-only e identidade privada no servidor. Não obter posição por nome.
- Copy proposta, sem mudança de regra: “Pontos da rodada · em andamento” quando estado confirmado for provisório, e “Temporada · rodadas finalizadas”. Se não houver posição por inexistência de rodada, distinguir de erro de leitura; não converter qualquer null em “aguardando”.
- Nenhum patch de produto foi aplicado neste recorte.

## Lacunas que ativar a flag não resolve

Busca sem consulta inicial não lista todos nem ordena por pontos. Resultados ainda não exibem followers/rank nem botão seguir na linha. Perfil ainda não exibe vitrine de elenco/mercado nem proposta ao usuário. A copy atual promete manter elenco privado; a vitrine exige consentimento/projeção compatível e ponte segura publicId → contexto de negociação. Ranking público ainda não linka o perfil/ID/foto. Essas entregas permanecem pendentes; uma ativação básica não torna social completo verde.

Evidência SELECT: artifacts/social-activation-read-20261101/proof.json.



## Continuidade local posterior — header/ranking

Após autorização do coordenador e checkpoint WIP, a proposta do header/ranking foi aplicada localmente. Evidências e limites em [AGENT_HEADER_RANKING_2026-11-01.md](AGENT_HEADER_RANKING_2026-11-01.md). Esse lote não ativou gates sociais nem alterou perfis/consentimento na QA. Não tratar a correção da classificação como ativação de busca/follow.
