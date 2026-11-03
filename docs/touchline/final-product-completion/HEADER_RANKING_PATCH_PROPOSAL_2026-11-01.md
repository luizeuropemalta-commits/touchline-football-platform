# Proposta de correção — header e classificação ClubOwner

**PROPOSTA NÃO APLICADA.** Documento revisável preparado em 1 de novembro de 2026. Nenhum TS/TSX foi alterado; não houve teste, SQL, migração, mudança de flags ou deploy neste recorte. Fonte congelada enquanto o root conclui a suíte da sessão 36458. O diff abaixo é uma proposta textual, ainda não compilada nem aprovada por execução.

## Missão e causa comprovada

AUDIT / planejamento de correção local. Resolver a divergência de classificação entre o header ClubOwner e a tabela /rankings usando a mesma projeção e os mesmos critérios. Não modificar pontos, planos, rodadas, contratos, fotos ou permissões.

A leitura QA anterior comprovou na conta QA2 41,19 pontos PROVISIONAL e nenhuma rodada FINAL na temporada 2026/2027: o total de temporada 0,00 não constitui erro. Ver AGENT_QA2_SCORE_READ_2026-10-31.md e AGENT_SOCIAL_ACTIVATION_READ_2026-11-01.md.

O problema de apresentação é outro: a função loadRankings legada somente inclui na classificação de temporada quem tem FINAL e atribui posições ordinais distintas aos empates. O projetor atual de /rankings inclui inscrito elegível sem FINAL com zero e usa classificação compartilhada nos empates. O header depende do primeiro caminho e pode ficar sem posição apesar de a mesma pessoa aparecer na tabela pública.

## Fontes e trechos exatos no snapshot lido

- lib/touchlineArena/club-owner-standings.ts:28–81: valida inscrição/participação, soma FINAL em centésimos e aplica empates; linha 77 descarta a identidade interna antes de retornar a tabela pública.
- lib/touchlineArena/club-owner-standings-server.ts:9–48: lê temporada ativa, pagina participação e inscrições completas e executa o projetor. Preservar os controles de contagem e integridade.
- lib/touchlineFantasy/server.ts:257–304: loadRankings contém a projeção de temporada paralela. Linha 510 só chama esse leitor se houver activeGameweek, o que também impede posição de inscrito sem rodada ativa.
- app/clubowner/page.tsx:162: rankingPosition={clubOwnerRankingPosition(snapshot?.seasonRanking)}. Não precisa mudar com esta proposta.
- lib/touchlineArena/club-owner-profile-metrics.ts:32–35: localiza exatamente um isCurrentManager; manter. Nunca substituir por busca por nome.
- app/rankings/page.tsx:46,89–90: usa loadClubOwnerStandings e entrega somente rows/status à tela.
- app/rankings/touchline-tables-client.tsx:572: já explica pontos de rodadas finalizadas e inscritos com zero.

HEAD base: 47ebfffbbda98cbb89bcd3ad08fb19efd1e50694. Este HEAD não representa todos os WIPs atuais. Impressões dos arquivos que o diff pressupõe:

- lib/touchlineArena/club-owner-standings.ts: 98b3033afaf52b465bd855901fda310eac6a8a3fa184fd85c5589b9e58fa09b1
- lib/touchlineArena/club-owner-standings-server.ts: 60bfa451623f772f6f54584bc9634227eb5643a3d49abdaa136da1d73084c33b
- lib/touchlineFantasy/server.ts: 15b41d72f1fbd90fa4578f8e98b95588794a180964bb1a861cb360d8cf0493f4

## Desenho mínimo escolhido

Três fontes de produto. A página e os DTOs já consumidos permanecem compatíveis.

1. Um único cálculo retorna duas projeções seguras: rows pública com rank/name/touchlinePoints, e viewerRanking com rank/name/score/isCurrentManager. O Map interno usa auth ID, mas nenhuma projeção retorna esse ID. Nome duplicado não participa da identificação do viewer.
2. Extrair a leitura paginada atual para readClubOwnerStandingViewsForSeason, server-only, recebendo o cliente administrativo e seasonId já resolvidos no servidor. O leitor público conserva sua assinatura e resolve a temporada ativa; o snapshot reutiliza sua própria temporada verificada e cliente existente.
3. loadRankings conserva o cálculo da rodada atual (inclusive pontos provisórios) e substitui somente a classificação de temporada pela projeção comum. Passar gameweekId nulo quando não houver rodada ativa permite o ranking sazonal do inscrito confirmado sem fabricar uma rodada.
4. Erro de leitura continua devolvendo classificação vazia ao snapshot; o header então mostra indisponível, nunca posição 1 ou zero inventados. A rota pública preserva status unavailable. Nenhuma falha converte-se em inscrição sintética.
5. Não há cache global por usuário, escrita, preparação de conta ou consulta adicional de configuração dentro do snapshot. Há leitura adicional de inscrições para refletir a política pública existente; registrar latência e número de chamadas na validação. O caminho de ranking da rodada ainda consulta a temporada como antes; otimização/paginação desse caminho é uma revisão separada e não está disfarçada de concluída aqui.

Limite conhecido: a tabela sazonal legada da página Fantasy usa o mesmo empty label para ausência e erro. Este patch resolve o header e a autoridade numérica, mas não adiciona um novo status ao contrato inteiro do snapshot. Se o root ampliar o lote para a copy da tabela Fantasy, deverá adicionar status tipado e os testes correspondentes, sem tratar [] como ausência confirmada. Também não altera o bloco de textos de pontos para rotular PROVISIONAL: essa melhoria está documentada no setor social e deve ser um patch de apresentação separado. O campo snapshot.seasonScore também continua calculado pela consulta própria atual (server.ts:554–560,660–662); o caso QA2 foi comprovado em zero, mas a igualdade desse campo em históricos Beta → pago merece regressão explícita antes de aprovar toda a pontuação. Não confundir a classificação sazonal corrigida com validação integral de todos os acumuladores.

## Diff proposto, para revisão e aplicação após checkpoint

Revalidar hashes antes de aplicar. O bloco não é uma autorização para aplicar durante o congelamento. git apply --check confirmou que o diff se aplica ao snapshot local lido; isso não valida tipos, execução ou comportamento.

```diff
--- a/lib/touchlineArena/club-owner-standings.ts
+++ b/lib/touchlineArena/club-owner-standings.ts
@@ -15,6 +15,12 @@
   };
   return copy[locale] ?? copy["en-GB"];
 }
+export type ClubOwnerPersonalStanding = Readonly<{
+  rank: number; name: string; score: number; isCurrentManager: boolean;
+}>;
+export type ClubOwnerStandingViews = Readonly<{
+  rows: ClubOwnerStanding[]; viewerRanking: ClubOwnerPersonalStanding[];
+}>;
 type RecordValue = Record<string, unknown>;
 function record(value: unknown): RecordValue | null {
   return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
@@ -25,7 +31,10 @@
 /** Existing competitive enrollment is user_gameweeks with a paid plan snapshot.
  * Missing scores mean no settled points yet; provisional scores never count.
  * Corrupt or duplicate inputs fail closed instead of publishing partial ranks. */
-export function projectClubOwnerStandings(input: readonly unknown[], registrations: readonly unknown[] = [], now = Date.now()): ClubOwnerStanding[] | null {
+export function projectClubOwnerStandingViews(
+  input: readonly unknown[], registrations: readonly unknown[] = [],
+  now = Date.now(), viewerUserId: string | null = null,
+): ClubOwnerStandingViews | null {
   const totals = new Map<string, { name: string; cents: number }>();
   for (const value of registrations) {
     const row = record(value);
@@ -74,8 +83,20 @@
   }
   const sorted = [...totals].sort(([a, x], [b, y]) => y.cents - x.cents || x.name.localeCompare(y.name) || a.localeCompare(b));
   let rank = 0;
-  return sorted.map(([, row], index) => {
+  const ranked = sorted.map(([userId, row], index) => {
     if (index === 0 || row.cents !== sorted[index - 1][1].cents) rank = index + 1;
-    return { rank, name: row.name, touchlinePoints: row.cents / 100 };
+    return { rank, name: row.name, touchlinePoints: row.cents / 100,
+      isCurrentManager: viewerUserId !== null && userId === viewerUserId };
   });
+  // Explicit projections prevent an internal account identifier from escaping.
+  return {
+    rows: ranked.map(({ rank, name, touchlinePoints }) => ({ rank, name, touchlinePoints })),
+    viewerRanking: ranked.map(({ rank, name, touchlinePoints, isCurrentManager }) =>
+      ({ rank, name, score: touchlinePoints, isCurrentManager })),
+  };
 }
+
+/** Keep the existing public contract unchanged. */
+export function projectClubOwnerStandings(input: readonly unknown[], registrations: readonly unknown[] = [], now = Date.now()): ClubOwnerStanding[] | null {
+  return projectClubOwnerStandingViews(input, registrations, now)?.rows ?? null;
+}
--- a/lib/touchlineArena/club-owner-standings-server.ts
+++ b/lib/touchlineArena/club-owner-standings-server.ts
@@ -1,48 +1,65 @@
 import "server-only";
 import { createAdminClient } from "@/lib/supabase/admin";
-import { projectClubOwnerStandings, type ClubOwnerStanding } from "./club-owner-standings";
+import { projectClubOwnerStandingViews, type ClubOwnerStanding, type ClubOwnerStandingViews } from "./club-owner-standings";

 export type ClubOwnerStandingsRead = { status: "ready"; rows: ClubOwnerStanding[] } | { status: "unavailable"; rows: [] };
+export type ClubOwnerStandingViewsRead =
+  | ({ status: "ready" } & ClubOwnerStandingViews)
+  | { status: "unavailable"; rows: []; viewerRanking: [] };

-/** Read-only, not cached across requests; same participation and FINAL-score
- * authority used by Fantasy's competitive ranking. No account preparation. */
+/** Server-only reusable season read. The caller provides an already verified
+ * season and viewer; neither value is taken from a public request parameter. */
+export async function readClubOwnerStandingViewsForSeason(
+  admin: NonNullable<ReturnType<typeof createAdminClient>>,
+  seasonId: string,
+  viewerUserId: string | null = null,
+): Promise<ClubOwnerStandingViewsRead> {
+  const unavailable: ClubOwnerStandingViewsRead = { status: "unavailable", rows: [], viewerRanking: [] };
+  try {
+    if (!seasonId.trim()) return unavailable;
+    const input: unknown[] = [];
+    let expectedCount: number | null = null;
+    for (let offset = 0; ; offset += 500) {
+      const result = await admin.from("touchline_fantasy_user_gameweeks")
+        .select("id,user_id,market_plan_key_snapshot,users(full_name),touchline_fantasy_gameweeks!inner(season_id),touchline_fantasy_user_gameweek_scores(gameweek_score,settlement_status)", { count: "exact" })
+        .in("market_plan_key_snapshot", ["standard", "pro", "master", "vip"])
+        .eq("touchline_fantasy_gameweeks.season_id", seasonId)
+        .order("id", { ascending: true }).range(offset, offset + 499);
+      if (result.error || !Array.isArray(result.data) || result.count === null
+        || (expectedCount !== null && result.count !== expectedCount)) return unavailable;
+      expectedCount = result.count;
+      input.push(...result.data);
+      if (input.length === expectedCount) break;
+      if (result.data.length !== 500 || input.length > expectedCount) return unavailable;
+    }
+    const registrations: unknown[] = [];
+    let registrationCount: number | null = null;
+    for (let offset = 0; ; offset += 500) {
+      const result = await admin.from("touchline_club_collections")
+        .select("user_id,plan:state->>plan,users(full_name,touchline_fantasy_entitlements(entitlement_key,plan_key,status,current_period_start,current_period_end))", { count: "exact" })
+        .eq("season_id", seasonId).order("user_id", { ascending: true }).range(offset, offset + 499);
+      if (result.error || !Array.isArray(result.data) || result.count === null
+        || (registrationCount !== null && result.count !== registrationCount)) return unavailable;
+      registrationCount = result.count;
+      registrations.push(...result.data);
+      if (registrations.length === registrationCount) break;
+      if (result.data.length !== 500 || registrations.length > registrationCount) return unavailable;
+    }
+    const views = projectClubOwnerStandingViews(input, registrations, Date.now(), viewerUserId);
+    return views ? { status: "ready", ...views } : unavailable;
+  } catch { return unavailable; }
+}
+
+/** Read-only, no cross-request caching or account preparation. */
 export async function loadClubOwnerStandings(): Promise<ClubOwnerStandingsRead> {
-  const unavailable = { status: "unavailable", rows: [] } as const;
   try {
     const admin = createAdminClient();
     if (!admin) return { status: "unavailable", rows: [] };
     const config = await admin.from("touchline_fantasy_configs").select("season_id")
       .eq("competition_key", "england").eq("status", "active").single();
     if (config.error || typeof config.data?.season_id !== "string") return { status: "unavailable", rows: [] };
-    const input: unknown[] = [];
-    let expectedCount: number | null = null;
-    for (let offset = 0; ; offset += 500) {
-      const result = await admin.from("touchline_fantasy_user_gameweeks")
-        .select("id,user_id,market_plan_key_snapshot,users(full_name),touchline_fantasy_gameweeks!inner(season_id),touchline_fantasy_user_gameweek_scores(gameweek_score,settlement_status)", { count: "exact" })
-        .in("market_plan_key_snapshot", ["standard", "pro", "master", "vip"])
-        .eq("touchline_fantasy_gameweeks.season_id", config.data.season_id)
-        .order("id", { ascending: true }).range(offset, offset + 499);
-      if (result.error || !Array.isArray(result.data) || result.count === null
-        || (expectedCount !== null && result.count !== expectedCount)) return { ...unavailable, rows: [] };
-      expectedCount = result.count;
-      input.push(...result.data);
-      if (input.length === expectedCount) break;
-      if (result.data.length !== 500 || input.length > expectedCount) return { ...unavailable, rows: [] };
-    }
-    const registrations: unknown[] = [];
-    let registrationCount: number | null = null;
-    for (let offset = 0; ; offset += 500) {
-      const result = await admin.from("touchline_club_collections")
-        .select("user_id,plan:state->>plan,users(full_name,touchline_fantasy_entitlements(entitlement_key,plan_key,status,current_period_start,current_period_end))", { count: "exact" })
-        .eq("season_id", config.data.season_id).order("user_id", { ascending: true }).range(offset, offset + 499);
-      if (result.error || !Array.isArray(result.data) || result.count === null
-        || (registrationCount !== null && result.count !== registrationCount)) return { ...unavailable, rows: [] };
-      registrationCount = result.count;
-      registrations.push(...result.data);
-      if (registrations.length === registrationCount) break;
-      if (result.data.length !== 500 || registrations.length > registrationCount) return { ...unavailable, rows: [] };
-    }
-    const rows = projectClubOwnerStandings(input, registrations);
-    return rows ? { status: "ready", rows } : { ...unavailable, rows: [] };
-  } catch { return { ...unavailable, rows: [] }; }
+    const result = await readClubOwnerStandingViewsForSeason(admin, config.data.season_id);
+    // Never return a personalized view to the public ranking route.
+    return result.status === "ready" ? { status: "ready", rows: result.rows } : { status: "unavailable", rows: [] };
+  } catch { return { status: "unavailable", rows: [] }; }
 }
--- a/lib/touchlineFantasy/server.ts
+++ b/lib/touchlineFantasy/server.ts
@@ -1,4 +1,5 @@
 import "server-only";
+import { readClubOwnerStandingViewsForSeason } from "@/lib/touchlineArena/club-owner-standings-server";
 import { readQaClubMarketOpening } from "./qa-club-market";
 import { resolvePrimaryPositionDetails } from "./club-primary-position-policy";
 import { readClubRelatedSnapshot, type ClubRelatedPlayer } from "./club-round-confirmation";
@@ -256,48 +257,45 @@

 async function loadRankings(
   admin: NonNullable<ReturnType<typeof createAdminClient>>,
-  gameweekId: string,
+  gameweekId: string | null,
   seasonId: string,
   viewerUserId: string,
 ) {
-  const { data: userGameweekData, error: userGameweekError } = await admin
-    .from("touchline_fantasy_user_gameweeks")
-    .select("id,user_id,gameweek_id,touchline_fantasy_gameweeks!inner(season_id)")
-    // Rank only points earned under a competitive plan. A later upgrade must
-    // not turn historical Beta practice points into title points.
-    .in("market_plan_key_snapshot", ["standard", "pro", "master", "vip"])
-    .eq("touchline_fantasy_gameweeks.season_id", seasonId);
-  if (userGameweekError) return { gameweek: [], season: [] };
-  const userGameweeks = rows(userGameweekData);
-  const ids = userGameweeks.map((row) => text(row.id)).filter((id): id is string => Boolean(id));
-  const userIds = [...new Set(userGameweeks.map((row) => text(row.user_id)).filter((id): id is string => Boolean(id)))];
-  if (!ids.length || !userIds.length) return { gameweek: [], season: [] };
-  const [scoresResponse, usersResponse] = await Promise.all([
-    admin.from("touchline_fantasy_user_gameweek_scores").select("user_gameweek_id,gameweek_score,settlement_status").in("user_gameweek_id", ids),
-    admin.from("users").select("id,full_name").in("id", userIds),
+  const [gameweek, season] = await Promise.all([
+    (async () => {
+      if (!gameweekId) return [];
+      const { data: userGameweekData, error: userGameweekError } = await admin
+        .from("touchline_fantasy_user_gameweeks")
+        .select("id,user_id,gameweek_id,touchline_fantasy_gameweeks!inner(season_id)")
+        // Rank only points earned under a competitive plan. A later upgrade must
+        // not turn historical Beta practice points into title points.
+        .in("market_plan_key_snapshot", ["standard", "pro", "master", "vip"])
+        .eq("touchline_fantasy_gameweeks.season_id", seasonId);
+      if (userGameweekError) return [];
+      const userGameweeks = rows(userGameweekData);
+      const ids = userGameweeks.map((row) => text(row.id)).filter((id): id is string => Boolean(id));
+      const userIds = [...new Set(userGameweeks.map((row) => text(row.user_id)).filter((id): id is string => Boolean(id)))];
+      if (!ids.length || !userIds.length) return [];
+      const [scoresResponse, usersResponse] = await Promise.all([
+        admin.from("touchline_fantasy_user_gameweek_scores").select("user_gameweek_id,gameweek_score,settlement_status").in("user_gameweek_id", ids),
+        admin.from("users").select("id,full_name").in("id", userIds),
+      ]);
+      if (scoresResponse.error || usersResponse.error) return [];
+      const userByGameweek = new Map(userGameweeks.flatMap((row) => text(row.id) && text(row.user_id) ? [[text(row.id)!, row] as const] : []));
+      const nameByUser = new Map(rows(usersResponse.data).flatMap((row) => text(row.id) ? [[text(row.id)!, text(row.full_name) ?? "TouchLine Manager"] as const] : []));
+      const gameweekValues: Array<{ userId: string; name: string; score: number }> = [];
+      for (const score of rows(scoresResponse.data)) {
+        const userGameweek = userByGameweek.get(text(score.user_gameweek_id) ?? "");
+        const userId = text(userGameweek?.user_id);
+        const value = number(score.gameweek_score) ?? 0;
+        if (!userId) continue;
+        if (text(userGameweek?.gameweek_id) === gameweekId) gameweekValues.push({ userId, name: nameByUser.get(userId) ?? "TouchLine Manager", score: value });
+      }
+      return rankTouchlineFantasyManagers(gameweekValues, viewerUserId);
+    })(),
+    readClubOwnerStandingViewsForSeason(admin, seasonId, viewerUserId),
   ]);
-  if (scoresResponse.error || usersResponse.error) return { gameweek: [], season: [] };
-  const userByGameweek = new Map(userGameweeks.flatMap((row) => text(row.id) && text(row.user_id) ? [[text(row.id)!, row] as const] : []));
-  const nameByUser = new Map(rows(usersResponse.data).flatMap((row) => text(row.id) ? [[text(row.id)!, text(row.full_name) ?? "TouchLine Manager"] as const] : []));
-  const gameweekValues: Array<{ userId: string; name: string; score: number }> = [];
-  const seasonTotals = new Map<string, number>();
-  for (const score of rows(scoresResponse.data)) {
-    const userGameweek = userByGameweek.get(text(score.user_gameweek_id) ?? "");
-    const userId = text(userGameweek?.user_id);
-    const value = number(score.gameweek_score) ?? 0;
-    if (!userId) continue;
-    if (text(score.settlement_status) === "FINAL") {
-      seasonTotals.set(userId, (seasonTotals.get(userId) ?? 0) + value);
-    }
-    if (text(userGameweek?.gameweek_id) === gameweekId) gameweekValues.push({ userId, name: nameByUser.get(userId) ?? "TouchLine Manager", score: value });
-  }
-  return {
-    gameweek: rankTouchlineFantasyManagers(gameweekValues, viewerUserId),
-    season: rankTouchlineFantasyManagers(
-      [...seasonTotals].map(([userId, score]) => ({ userId, name: nameByUser.get(userId) ?? "TouchLine Manager", score })),
-      viewerUserId,
-    ),
-  };
+  return { gameweek, season: season.status === "ready" ? season.viewerRanking : [] };
 }

 async function loadCoaches(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
@@ -507,7 +505,7 @@
       catalogueRead,
       coachesRead,
       userGameweekRead,
-      projection === "full" && activeGameweek ? loadRankings(admin, activeGameweek.id, seasonId, user.id) : Promise.resolve({ gameweek: [], season: [] }),
+      projection === "full" ? loadRankings(admin, activeGameweek?.id ?? null, seasonId, user.id) : Promise.resolve({ gameweek: [], season: [] }),
     ]);
     const readSquadDetails = async () => {
       const userGameweekResponse = await userGameweekRead;
```

## Testes e adaptação obrigatória dos harnesses

Não executar agora. O diff de produto só deve ser aplicado junto com os ajustes abaixo; o rascunho não está pronto para merge sem estes testes.

| Arquivo | Mudança e prova exigida |
|---|---|
| tests/touchline-club-owner-standings.test.mts | Importar também o projetor de duas views. Preservar os sete cenários existentes; conferir igualdade de posição/score público e pessoal, inscrito sem FINAL, empates 1/1/3, viewer ausente, dois nomes iguais, IDs/PII ausentes em ambas as saídas. Atualizar VM require para fornecer o export real novo, não algoritmo simulado. Testar leitor por seasonId com o cliente dado, sem segunda criação/configuração. |
| tests/helpers/fantasy-ranking-projection.mts | O reader extraído por VM ganhará dependência readClubOwnerStandingViewsForSeason: executar também o módulo real de standings-server na VM. Ampliar somente o adaptador de dados para joins users/scores, count/range/order e collections. Não substituir a nova autoridade por uma função que devolva o resultado esperado. Permitir coleção vazia explícita para as fixtures antigas. |
| tests/touchline-fantasy-competitive-ranking.test.mts | Trocar mock rankTouchlineFantasyManagers que devolve valores com userId pelo reader/harness real. Assert em name/score/isCurrentManager, sem esperar auth ID no DTO. Manter prova de que 999 pontos históricos Beta não passam ao ranking após upgrade. |
| tests/touchline-clubowner-nonretroactive-points.test.mts | Reexecutar contra o reader real adaptado. Trocar a expectativa tolerante own?.score ?? 0 por igualdade explícita à linha própria com score=0 quando inscrição/participação está comprovada. Preservar card histórico 100 versus manager 0/8, temporada diferente e leitura repetida. |
| tests/clubowner-public-header.test.mts | Acrescentar cenário do servidor/página em que snapshot real projetado contém a linha própria com zero, e renderizar o header com posição correspondente. Dois usuários homônimos não podem trocar a identidade. Snapshot/reader indisponível continua exibindo —, sem zero inventado. Reutilizar sessão única, não novo login/consentimento. |
| tests/touchline-clubowner-market-header.test.mts | Os asserts da linha612 sobre snapshot.seasonRanking continuam válidos; reexecutar o caso de identidade/ranking e os formatos ordinais. |
| tests/touchline-fantasy-market-plan-policy.test.mts | O guard de planos pagos no leitor de rodada permanece. Acrescentar/ligar a prova de mesmo guard no leitor de temporada; não remover a expectativa de exclusão de Beta para acomodar implementação. |
| tests/touchline-fantasy-arena-projection.test.mts | Como loadRankings aceita gameweekId nulo, adicionar inscrito com plano ativo/sem activeGameweek: seasonRanking confirmado e gameweekRanking vazio. Projeção leve Arena não dispara ranking; bootstrap sem entitlement permanece fechado. |
| tests/touchline-fantasy-v4-raw-rating-pglite.test.mts | O teste integrado usa o helper de ranking alterado; reexecutar após o lote focado, junto ao executor oficial no momento coordenado pelo root. Preservar soma/revisões idempotentes e não retroatividade. |

Casos de erro adicionais no leitor comum: falha de página intermediária; mudança de count; registro duplicado; inscrição expirada; projeção corrompida; mesmo nome/ID distinto; participação paga em temporada passada excluída; participação Beta passada excluída após upgrade. Nenhum deles deve publicar classificação parcial nem vazar campo privado.

Ordem após liberação: revisar o diff e a fronteira server/client → aplicar as três fontes e testes/harnesses no mesmo lote → testes focados sem browsers pesados simultâneos → TypeScript e ESLint → revisão independente → suíte proporcional/completa e build coordenados pelo root → checkpoint SHA/manifesto → somente então gates do deploy já autorizado. Não somar testes sobrepostos nem declarar o site verde por esse patch.

## Gates sociais exatos — operação independente deste patch

| Gate | Estado da evidência | Ação posterior |
|---|---|---|
| TOUCHLINE_CLUBOWNER_PUBLIC_ENABLED | Valor efetivo do deployment não verificado por este agente | Root confirma flag em QA e publicação correspondente; salvar env não altera versão em execução. |
| touchline_people_private.configuration.enabled | false na leitura de 2026-10-31T23:03:28Z | Root pode ativar somente QA após source freeze e estado anterior registrado. |
| Migração 20261027201704 | Aplicada | Não reaplicar nem mudar grants/RLS para liberar a tela. |
| Publicação própria | Zero perfis no snapshot | Nas duas sessões CUSTOMER QA, abrir /clubowners, escolher nome e marcar opt-in explicitamente; PUT normal do próprio cliente. |
| Identidade | auth.uid + metadata confiável | Não promover role, não usar ADMIN ou service-role para impersonar cliente. |
| Foto pública | Migração 20261030133824 ausente no snapshot lido | Manter separada. PUBLIC_AVATAR_ENABLED, AVATAR_READ_ENABLED, AVATAR_RETENTION_READY, origem QA e consentimento precisam de evidência própria. |

Os dois gates de descoberta são globais da QA, não uma allowlist. A autorização operacional restringe as gravações desta missão às duas fixtures CUSTOMER; nenhum opt-in coletivo. Busca/visita anônima dos perfis que escolheram publicação é intencional. Tabelas permanecem privadas e com RLS; os wrappers públicos devolvem apenas projeções permitidas.

Prova remota mínima depois da ativação: A/B encontram-se por prefixo e UUID público; IDs públicos distintos e diferentes de auth IDs; visita ao perfil correto; follow A→B confirmado, repetição sem duplicação, B→A independente, unfollow; ocultar perfil remove busca/visita e impede novo follow; republicar mantém ID. Depois conferir followers no header por own_profile. Foto, elenco público, propostas e ranking linkado não ficam automaticamente verdes com esse fluxo textual.

Testes sociais já existentes: clubowner-public-persistence.test.mts, clubowner-public-handler.test.mts, clubowner-public-server.test.mts, clubowner-public-runtime.test.mts, clubowner-public-header.test.mts. Browser condicional: TOUCHLINE_RUN_CLUBOWNER_PUBLIC_BROWSER=1 em clubowner-public-browser.test.mts; transporte interceptado é prova local, não duas sessões reais QA. Não repetidos neste documento.

## Aceitação e rollback

Aceitação: a mesma temporada e conjunto de dados produzem o mesmo rank/score no header, snapshot.seasonRanking e tabela pública; 41,19 PROVISIONAL não vira total FINAL; inscritos elegíveis têm zero confirmado, usuários não inscritos não são inventados; homônimos são independentes; nenhuma resposta pública inclui auth ID, email, saldo ou contrato. Nenhuma escrita em pontuação ou conta. Medir leitura sem transformar lentidão/erro em zero.

Rollback: reverter somente o commit futuro deste patch, com manifesto explícito, mantendo a migração/base e dados intactos. Este documento não cria commit nem modifica a candidata. Root retém controle de checkpoint, estados globais, aplicação QA e deploy.

## Mission completion gate deste recorte documental

MISSION: proposta mínima revisável para unificar header e classificação.
SCOPE: leitura de fontes/testes e um Markdown com diff não aplicado.
QA BRANCH: candidata local qa-stripe-release-20261029; base detached 47ebfffb.
QA COMMIT: nenhum novo commit neste recorte.
QA DEPLOYMENT: não consultado/não alterado.
REMOTE BUILD BUDGET / CONSUMED: zero / zero.
STABLE QA URL: https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
FILES CHANGED: somente este documento.
FUNCTIONAL RESULT: diagnóstico e plano concluídos; produto continua pendente do patch/testes.
VISUAL / RESPONSIVE / ACCESSIBILITY / BROWSER MATRIX: não executados neste recorte; nenhum PASS visual.
SECURITY: proposta mantém RLS, auth server-only, DTO sem auth ID e sem opt-in coletivo.
TESTS / BUILD: não executados; suíte do root não interrompida.
OBSERVABILITY: hashes de fonte e referências aos relatórios/artefatos SELECT anteriores.
OPEN FINDINGS: divergência ainda existe na fonte congelada; descoberta básica desligada na leitura registrada; foto/fluxo social completo permanecem separados.
PRODUCTION: NOT TOUCHED.

| Ferramenta | Ação real | Evidência / decisão |
|---|---|---|
| Shell/rg/leitura de arquivos | Fontes, testes, consumidores, hashes e manifesto | Diff revisável, sem tocar fonte de produto. |
| Python stdlib | Geração de diff em memória e escrita deste Markdown | Apenas proposta; nenhum TS/TSX gravado. |
| Supabase skill | Orientação de privacidade/identidade consultada | Nenhuma consulta ou mutação remota neste recorte. |
| Browser/Vercel/test runners | Não executados | Desnecessários para o documento e proibido competir com suíte congelada. |
