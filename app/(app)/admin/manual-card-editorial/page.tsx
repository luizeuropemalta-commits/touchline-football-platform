import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, ClipboardCheck, FileLock2, Layers3 } from "lucide-react";

import { ManualCardEditorialBulkPreview, ManualCardEditorialEditor, ManualCardEditorialHistory } from "@/components/admin-manual-card-editorial-actions";
import { CardEngineInbox, type CardEngineInboxRow } from "@/components/card-engine-inbox";
import { GamePanel, LivePill, StatTile } from "@/components/arena-admin-ui";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeTouchLineAuthLocale, touchLineAuthEntryHref, touchLineAuthHref } from "@/lib/touchlineArena/auth-i18n";
import { findTouchlineNewPlayerCardAlerts } from "@/lib/touchlineArena/new-player-card-alerts";
import { hasTouchlineCardPublicationRevertSnapshot } from "@/lib/touchlineArena/card-publication-revert";
import { evaluateTouchlineCardCompleteness } from "@/lib/touchlineArena/card-review-state";
import { loadTouchlineCardEditorialOverrides } from "@/lib/touchlineArena/card-editorial-overrides";
import { findTouchLineClub } from "@/lib/touchlineArena/demo-data";
import { touchlineCountryCode3FromName } from "@/lib/touchlineArena/country-flags";

export const dynamic = "force-dynamic";

type EditorialPlayerRow = {
  id: string;
  current_club_id: string | null;
  provider_player_id: string | null;
  display_name: string | null;
  name: string | null;
  position: string | null;
  nationality: string | null;
  country_id: string | null;
  source_updated_at: string | null;
  football_clubs: { name: string | null } | { name: string | null }[] | null;
};

type EditorialClubRow = { id: string; name: string; competition_id: string; provider: string };
type EditorialMembershipRow = {
  player_id: string;
  club_id: string;
  competition_id: string;
  jersey_number: number | null;
  position: string | null;
};
type EditorialPublicationRow = {
  player_id: string;
  publication_status: string;
};

function clubName(row: EditorialPlayerRow) {
  const club = Array.isArray(row.football_clubs) ? row.football_clubs[0] : row.football_clubs;
  return club?.name?.trim() || "Unassigned club";
}

function migrationMissing(message: string) {
  return /touchline_card_publications|schema cache|does not exist|Could not find the table/i.test(message);
}

export default async function ManualCardEditorialPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const locale = normalizeTouchLineAuthLocale(typeof params.lang === "string" ? params.lang : null);
  const requestedPlayerId = typeof params.playerId === "string" ? params.playerId.trim().toLowerCase() : "";
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!user) {
    return <GamePanel className="p-8"><LivePill>{locale === "pt-BR" ? "Área do proprietário" : "Owner area"}</LivePill><h1 className="mt-5 text-4xl font-black italic text-white">{locale === "pt-BR" ? "Editorial manual de cards" : "Manual Card Editorial"}</h1><p className="mt-3 text-sm text-slate-400">{locale === "pt-BR" ? "Entre como proprietário da TouchLine para preparar uma decisão protegida de card por jogador." : "Sign in as the TouchLine owner to prepare one protected player-card decision at a time."}</p><Link href={touchLineAuthEntryHref("/login", locale, touchLineAuthHref("/admin/manual-card-editorial", locale))} className="mt-6 inline-flex rounded-2xl bg-[#a3ff12] px-5 py-3 text-xs font-black text-black">{locale === "pt-BR" ? "Entrar" : "Sign in"}</Link></GamePanel>;
  }
  if (!isOwnerEmail(user.email)) notFound();
  if (!admin) return <GamePanel className="p-8"><LivePill>{locale === "pt-BR" ? "Configuração necessária" : "Configuration required"}</LivePill><h1 className="mt-5 text-4xl font-black italic text-white">{locale === "pt-BR" ? "Editorial manual de cards" : "Manual Card Editorial"}</h1><p className="mt-3 text-sm text-slate-400">{locale === "pt-BR" ? "É necessário um cliente de administração protegido no servidor." : "A protected server administration client is required."}</p></GamePanel>;

  const { data: players, error: playerError } = await admin
    .from("football_players")
    .select("id,current_club_id,provider_player_id,display_name,name,position,nationality,country_id,source_updated_at,football_clubs:current_club_id(name)")
    .not("current_club_id", "is", null)
    .order("display_name", { ascending: true })
    .limit(750)
    .returns<EditorialPlayerRow[]>();
  if (playerError) return <GamePanel className="p-8"><LivePill>Roster unavailable</LivePill><h1 className="mt-5 text-4xl font-black italic text-white">Manual Card Editorial</h1><p className="mt-3 text-sm text-slate-400">{playerError.message}</p></GamePanel>;

  const { data: clubs } = await admin
    .from("football_clubs")
    .select("id,name,competition_id,provider")
    .eq("provider", "sportmonks")
    .limit(100)
    .returns<EditorialClubRow[]>();
  const { data: competitions } = await admin
    .from("football_competitions")
    .select("id,provider,provider_competition_id")
    .eq("provider", "sportmonks")
    .eq("provider_competition_id", "8")
    .limit(1);
  const premierCompetitionId = competitions?.[0]?.id ?? null;
  const clubOptions = (clubs ?? []).filter((club) => club.competition_id === premierCompetitionId).map((club) => ({ id: club.id, name: club.name })).sort((left, right) => left.name.localeCompare(right.name));

  const { data: profiles, error: profileError } = await admin
    .from("touchline_card_publications")
    .select("player_id,publication_status")
    .limit(1_000);
  const migrationPending = Boolean(profileError && migrationMissing(profileError.message));
  if (profileError && !migrationPending) return <GamePanel className="p-8"><LivePill>Editorial store unavailable</LivePill><h1 className="mt-5 text-4xl font-black italic text-white">Manual Card Editorial</h1><p className="mt-3 text-sm text-slate-400">{profileError.message}</p></GamePanel>;

  const publicationRows = (profiles ?? []) as EditorialPublicationRow[];
  const published = publicationRows.filter((profile) => profile.publication_status === "published").length;
  const review = publicationRows.filter((profile) => profile.publication_status === "ready_for_review" || profile.publication_status === "ready_to_publish").length;
  const premierClubIds = new Set(clubOptions.map((club) => club.id));
  const canonicalPlayers = (players ?? []).filter((player) => Boolean(player.current_club_id && premierClubIds.has(player.current_club_id)));
  const canonicalPlayerIds = canonicalPlayers.map((player) => player.id);
  const { data: activeMembershipRows } = !migrationPending && canonicalPlayerIds.length
    ? await admin
      .from("football_squad_members")
      .select("player_id,club_id,competition_id,jersey_number,position")
      .eq("provider", "sportmonks")
      .eq("status", "active")
      .in("player_id", canonicalPlayerIds)
      .returns<EditorialMembershipRow[]>()
    : { data: [] as EditorialMembershipRow[] };
  const membershipsByPlayerId = new Map<string, EditorialMembershipRow[]>();
  for (const membership of activeMembershipRows ?? []) {
    membershipsByPlayerId.set(membership.player_id, [...(membershipsByPlayerId.get(membership.player_id) ?? []), membership]);
  }
  const publicationsByPlayerId = new Map(publicationRows.map((profile) => [profile.player_id, profile.publication_status]));
  const { data: marketValueRows } = !migrationPending && canonicalPlayerIds.length
    ? await admin.from("football_player_market_values").select("player_id,status,confidence").in("player_id", canonicalPlayerIds)
    : { data: [] as Array<{ player_id: string; status: string; confidence: string }> };
  const marketValueByPlayerId = new Map((marketValueRows ?? []).map((row) => [row.player_id, row]));
  const editorialOverrides = await loadTouchlineCardEditorialOverrides(canonicalPlayerIds, admin);
  const cardEngineRows: CardEngineInboxRow[] = canonicalPlayers.flatMap((player) => {
    const membership = (membershipsByPlayerId.get(player.id) ?? []).find((entry) => entry.club_id === player.current_club_id) ?? null;
    if (!membership) return [];
    const override = editorialOverrides.get(player.id.toLowerCase());
    const provider = {
      displayName: player.display_name?.trim() || player.name?.trim() || null,
      shirtNumber: membership.jersey_number,
      countryCode3: touchlineCountryCode3FromName(player.nationality) ?? null,
      position: membership.position || player.position,
    };
    const effective = {
      displayName: override?.displayName ?? provider.displayName,
      shirtNumber: override?.shirtNumber ?? provider.shirtNumber,
      countryCode3: override?.countryCode3 ?? provider.countryCode3,
      position: override?.position ?? provider.position,
    };
    const marketValue = marketValueByPlayerId.get(player.id);
    const cardReview = evaluateTouchlineCardCompleteness({
      ...effective,
      hasVerifiedMarketValue: marketValue?.status === "verified" && marketValue.confidence === "verified",
      hasClubAsset: Boolean(findTouchLineClub(clubName(player))?.logoUrl),
    });
    return cardReview.state === "REVIEW_REQUIRED" ? [{
      playerId: player.id,
      playerName: effective.displayName ?? "Canonical player",
      clubName: clubName(player),
      provider,
      override: { displayName: override?.displayName ?? null, shirtNumber: override?.shirtNumber ?? null, countryCode3: override?.countryCode3 ?? null, position: override?.position ?? null },
      effective,
      cardReview,
    }] : [];
  });
  const newPlayerAlerts = migrationPending || !premierCompetitionId ? [] : findTouchlineNewPlayerCardAlerts({
    competitionId: premierCompetitionId,
    candidates: canonicalPlayers.map((player) => ({
      playerId: player.id,
      playerName: player.display_name?.trim() || player.name?.trim() || "",
      clubId: player.current_club_id ?? "",
      clubName: clubName(player),
      position: player.position,
      detectedAt: player.source_updated_at,
      providerPlayerId: player.provider_player_id,
      currentClubId: player.current_club_id,
      activeSportmonksMemberships: (membershipsByPlayerId.get(player.id) ?? []).map((membership) => ({
        clubId: membership.club_id,
        competitionId: membership.competition_id,
      })),
      publicationStatus: publicationsByPlayerId.get(player.id) ?? null,
    })),
  });
  const { data: historyRows } = migrationPending ? { data: [] } : await admin
    .from("touchline_card_publication_history")
    .select("id,player_id,action,created_at,before_state")
    .order("created_at", { ascending: false })
    .limit(20);
  const playerOptions = (players ?? []).map((player) => ({
    id: player.id,
    name: player.display_name?.trim() || player.name?.trim() || "Unnamed player",
    clubName: clubName(player),
  }));
  const namesByPlayerId = new Map(playerOptions.map((player) => [player.id, player.name]));
  const historyEntries = (historyRows ?? []).map((entry) => ({ id: entry.id, playerName: namesByPlayerId.get(entry.player_id) ?? "Canonical player", action: entry.action, createdAt: entry.created_at, canRevert: hasTouchlineCardPublicationRevertSnapshot(entry.before_state) }));

  return <div className="space-y-6">
    <GamePanel className="overflow-hidden p-6 sm:p-8">
      <LivePill>{locale === "pt-BR" ? "Proprietário protegido / valor de mercado manual" : "Owner protected / manual market value"}</LivePill>
      <h1 className="mt-5 max-w-4xl text-5xl font-black italic leading-[.9] text-white md:text-7xl">{locale === "pt-BR" ? "Controle de publicação de cards" : "Card publication control"}</h1>
      <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-300/75">{locale === "pt-BR" ? "A identidade do futebol real permanece canônica. O proprietário registra um valor privado em EUR; a TouchLine calcula tier, borda, neon e preço nominal do card. Um card de jogo só aparece após publicação explícita." : "Real football identity stays canonical. An owner records a private EUR value; TouchLine calculates tier, border, neon and nominal card price. A game card appears only after explicit publication."}</p>
      <div className="mt-6 flex flex-wrap gap-3"><Link href={touchLineAuthHref("/admin/cards", locale)} className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 py-3 text-[10px] font-black text-cyan-100">{locale === "pt-BR" ? "Inventário de cards" : "Card inventory"}</Link><Link href={touchLineAuthHref("/admin", locale)} className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 py-3 text-[10px] font-black text-cyan-100">{locale === "pt-BR" ? "Admin do proprietário" : "Owner Admin"}</Link></div>
    </GamePanel>
    <div className="grid gap-4 md:grid-cols-4">
      <StatTile icon={Layers3} label={locale === "pt-BR" ? "Jogadores canônicos" : "Canonical players"} value={String(playerOptions.length)} delta={locale === "pt-BR" ? "lista protegida de consulta" : "protected lookup list"} accent="cyan" />
      <StatTile icon={BadgeCheck} label={locale === "pt-BR" ? "Publicados" : "Published"} value={String(published)} delta={locale === "pt-BR" ? "cards elegíveis para o jogo" : "eligible game cards"} accent="lime" />
      <StatTile icon={ClipboardCheck} label={locale === "pt-BR" ? "Prontos para revisão" : "Ready to review"} value={String(review)} delta={locale === "pt-BR" ? "ocultos nas superfícies de jogo" : "hidden from game surfaces"} accent="gold" />
      <StatTile icon={FileLock2} label={locale === "pt-BR" ? "Valor necessário" : "Value required"} value={String(newPlayerAlerts.length)} delta={locale === "pt-BR" ? "novos jogadores canônicos" : "new canonical players"} accent="rose" />
    </div>
    {migrationPending ? <GamePanel className="p-6"><LivePill>{locale === "pt-BR" ? "Migração pendente" : "Migration pending"}</LivePill><h2 className="mt-4 text-2xl font-black italic text-white">{locale === "pt-BR" ? "Candidata local pronta; armazenamento remoto intencionalmente intocado" : "Local candidate ready; remote store intentionally untouched"}</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">{locale === "pt-BR" ? <>Aplique <code>supabase/migrations/051_touchline_manual_card_editorial_profiles.sql</code> somente após revisão separada do esquema e autorização explícita do banco. Até lá, esta página não pode salvar um registro.</> : <>Apply <code>supabase/migrations/051_touchline_manual_card_editorial_profiles.sql</code> only after its separate schema review and explicit database authorization. Until then this page cannot save a record.</>}</p></GamePanel> : <><CardEngineInbox rows={cardEngineRows} locale={locale} />{newPlayerAlerts.length ? <GamePanel className="border-[#ffb4b4]/25 bg-[#ffb4b4]/[.035] p-6"><LivePill>{locale === "pt-BR" ? "Alertas de novos jogadores" : "New player alerts"}</LivePill><h2 className="mt-4 text-2xl font-black italic text-white">{locale === "pt-BR" ? "NOVO JOGADOR · VALOR DE MERCADO NECESSÁRIO" : "NEW PLAYER · MARKET VALUE REQUIRED"}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{locale === "pt-BR" ? "Estes jogadores canônicos da Premier League têm uma membership Sportmonks ativa, mas nenhum valor de mercado editorial aprovado. Eles permanecem visíveis no Club Hub em grayscale até que os dados reais estejam completos; o Card Engine publica automaticamente quando não houver blocker real." : "These canonical Premier League players have one active Sportmonks membership but no approved editorial market value. They remain visible in the Club Hub in grayscale until real inputs are complete; Card Engine publishes automatically when no real blocker remains."}</p><div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{newPlayerAlerts.slice(0, 48).map((alert) => <Link key={alert.playerId} href={`${touchLineAuthHref(`/admin/manual-card-editorial?playerId=${encodeURIComponent(alert.playerId)}`, locale)}#manual-card-editor`} className="rounded-2xl border border-white/[.08] bg-black/20 px-4 py-3 hover:border-[#ffb4b4]/45"><p className="text-[9px] font-black text-[#ffb4b4]">{locale === "pt-BR" ? "NOVO JOGADOR · VALOR DE MERCADO NECESSÁRIO" : alert.label}</p><p className="mt-1 text-sm font-black text-white">{alert.playerName}</p><p className="mt-1 text-[10px] font-bold text-slate-500">{alert.clubName}{alert.position ? ` · ${alert.position}` : ""}</p><p className="mt-1 text-[9px] font-bold text-slate-600">{locale === "pt-BR" ? "Detectado" : "Detected"}: {alert.detectedAt ? new Date(alert.detectedAt).toLocaleDateString(locale) : "—"}</p></Link>)}</div>{newPlayerAlerts.length > 48 ? <p className="mt-4 text-[10px] font-bold text-slate-500">{locale === "pt-BR" ? "Mostrando os primeiros 48 alertas protegidos. Use a busca abaixo para abrir qualquer jogador canônico." : "Showing the first 48 protected alerts. Use the editor search below to open any canonical player."}</p> : null}</GamePanel> : null}<div id="manual-card-editor"><ManualCardEditorialEditor players={playerOptions} locale={locale} initialPlayerId={playerOptions.some((player) => player.id === requestedPlayerId) ? requestedPlayerId : undefined} /></div><ManualCardEditorialHistory entries={historyEntries} locale={locale} /></>}
    <ManualCardEditorialBulkPreview clubs={clubOptions} locale={locale} />
  </div>;
}
