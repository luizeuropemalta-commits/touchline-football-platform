import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Boxes, CheckCircle2, Layers3, Palette, Search, ShoppingBag } from "lucide-react";

import { CardInventoryQuickEdit, SyncCardInventoryButton } from "@/components/admin-card-inventory-actions";
import { GamePanel, LivePill, StatTile } from "@/components/arena-admin-ui";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeTouchLineAuthLocale, touchLineAuthEntryHref, touchLineAuthHref } from "@/lib/touchlineArena/auth-i18n";
import { loadTouchlinePublishedCardPresentations } from "@/lib/touchlineArena/card-publication-read-model";

export const dynamic = "force-dynamic";

type CardInventoryRow = {
  id: string;
  player_name: string;
  club_name: string | null;
  frame_color: string;
  frame_url: string | null;
  card_template_url: string | null;
  avatar_image_url: string | null;
  art_status: string;
  card_status: string;
  sale_status: string;
  published_at: string | null;
  reserved_at: string | null;
  sold_at: string | null;
  updated_at: string | null;
};

function countBy(rows: CardInventoryRow[], key: keyof CardInventoryRow) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const value = String(row[key] ?? "unassigned");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function missingAsset(row: CardInventoryRow) {
  return row.art_status === "missing" || !row.avatar_image_url || !row.card_template_url;
}

function isMissingInventoryTable(message: string) {
  return /touchline_card_inventory|schema cache|does not exist|Could not find the table/i.test(message);
}

export default async function AdminCardsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const locale = normalizeTouchLineAuthLocale(typeof params.lang === "string" ? params.lang : null);
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!user) {
    return (
      <GamePanel className="p-8">
        <LivePill>Owner area</LivePill>
        <h1 className="mt-5 text-4xl font-black  italic text-white">Card Inventory</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">Sign in as the TouchLine owner to manage card stock.</p>
        <Link href={touchLineAuthEntryHref("/login", locale, touchLineAuthHref("/admin/cards", locale))} className="mt-6 inline-flex rounded-2xl bg-[#a3ff12] px-5 py-3 text-xs font-black text-black">Sign in</Link>
      </GamePanel>
    );
  }

  if (!isOwnerEmail(user.email)) notFound();

  if (!admin) {
    return (
      <GamePanel className="p-8">
        <LivePill>Configuration required</LivePill>
        <h1 className="mt-5 text-4xl font-black  italic text-white">Card Inventory</h1>
        <p className="mt-3 text-sm text-slate-400">Supabase service role is required for protected inventory administration.</p>
      </GamePanel>
    );
  }

  const [inventoryResult, publicationCountResult, playerIdsResult] = await Promise.all([
    admin
      .from("touchline_card_inventory")
      .select("id, player_name, club_name, frame_color, frame_url, card_template_url, avatar_image_url, art_status, card_status, sale_status, published_at, reserved_at, sold_at, updated_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .limit(120)
      .returns<CardInventoryRow[]>(),
    admin
      .from("touchline_card_publications")
      .select("player_id", { count: "exact", head: true })
      .eq("publication_status", "published"),
    admin
      .from("football_players")
      .select("id")
      .limit(750)
      .returns<Array<{ id: string }>>(),
  ]);
  const { data, error, count: inventoryTotal } = inventoryResult;

  if (error) {
    const migrationPending = isMissingInventoryTable(error.message);
    return (
      <GamePanel className="p-8">
        <LivePill>{migrationPending ? "Migration pending" : "Inventory unavailable"}</LivePill>
        <h1 className="mt-5 text-4xl font-black  italic text-white">Card Inventory</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">
          {migrationPending
            ? "The protected card inventory database table has not been applied yet. Apply supabase/migrations/018_touchline_card_inventory_admin.sql before syncing card stock."
            : error.message}
        </p>
      </GamePanel>
    );
  }

  if (publicationCountResult.error || playerIdsResult.error) {
    return (
      <GamePanel className="p-8">
        <LivePill>Canonical publication audit unavailable</LivePill>
        <h1 className="mt-5 text-4xl font-black italic text-white">Card Inventory</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">The protected publication gate could not be reconciled. No readiness count is being inferred from legacy inventory fields.</p>
      </GamePanel>
    );
  }

  const rows = data ?? [];
  const canonicalPublications = await loadTouchlinePublishedCardPresentations({
    playerIds: (playerIdsResult.data ?? []).map((player) => player.id),
    providedAdmin: admin,
  });
  const publishedLifecycleRows = publicationCountResult.count ?? 0;
  const publiclyEligibleCards = canonicalPublications.size;
  const reviewRequiredCards = Math.max(0, publishedLifecycleRows - publiclyEligibleCards);
  const byStatus = countBy(rows, "card_status");
  const byClub = countBy(rows, "club_name");
  const byFrame = countBy(rows, "frame_color");
  const legacyRowsWithoutAssetUrls = rows.filter(missingAsset);

  return (
    <div className="space-y-6">
      <GamePanel className="overflow-hidden p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
          <div>
            <LivePill>Owner protected</LivePill>
            <p className="mt-6 text-[10px] font-black text-cyan-300/70">TouchLine England / Card operations</p>
            <h1 className="mt-2 max-w-4xl text-5xl font-black  italic leading-[.9] text-white md:text-7xl">
              Card Inventory
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-300/75">
              Legacy stock rows and canonical publication readiness are shown separately. A lifecycle row is never treated as publicly eligible unless the server-owned publication gate validates its identity, membership, season and editorial data.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <SyncCardInventoryButton />
              <Link href={touchLineAuthHref("/admin", locale)} className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 py-3 text-[10px] font-black text-cyan-100">
                Owner Admin
              </Link>
            </div>
          </div>
          <div className="rounded-3xl border border-cyan-300/15 bg-black/20 p-5">
            <p className="text-[9px] font-black text-cyan-300">Inventory health</p>
            <div className="mt-5 space-y-4">
              {[
                ["Legacy inventory rows", inventoryTotal ?? rows.length],
                ["Canonical lifecycle rows", publishedLifecycleRows],
                ["Publicly eligible", publiclyEligibleCards],
                ["Review required", reviewRequiredCards],
                ["Sample rows without legacy URLs", legacyRowsWithoutAssetUrls.length],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 border-b border-white/[.06] pb-3">
                  <span className="text-[10px] font-bold text-slate-500">{label}</span>
                  <span className="text-right text-xs font-black  text-white">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </GamePanel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatTile icon={Boxes} label="Legacy inventory" value={String(inventoryTotal ?? rows.length)} delta={`showing latest ${rows.length}`} accent="cyan" />
        <StatTile icon={CheckCircle2} label="Public eligible" value={String(publiclyEligibleCards)} delta="canonical gate" accent="lime" />
        <StatTile icon={ShoppingBag} label="Lifecycle published" value={String(publishedLifecycleRows)} delta="not sufficient alone" accent="gold" />
        <StatTile icon={Layers3} label="Reserved" value={String(byStatus.reserved ?? 0)} delta="held stock" accent="rose" />
        <StatTile icon={ShoppingBag} label="Sold" value={String(byStatus.sold ?? 0)} delta="completed" accent="gold" />
        <StatTile icon={AlertTriangle} label="Review required" value={String(reviewRequiredCards)} delta="blocked from public read model" accent={reviewRequiredCards ? "rose" : "lime"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[.7fr_1.3fr]">
        <GamePanel className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black text-cyan-300">Breakdown</p>
            <Palette size={15} className="text-[#a3ff12]" />
          </div>
          <div className="mt-4 grid gap-5">
            <section>
              <h2 className="text-[10px] font-black  text-white">By Club</h2>
              <div className="mt-3 grid gap-2">
                {Object.entries(byClub).slice(0, 12).map(([club, count]) => (
                  <div key={club} className="flex justify-between rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-2 text-[10px] font-bold  text-slate-400"><span>{club}</span><span>{count}</span></div>
                ))}
              </div>
            </section>
            <section>
              <h2 className="text-[10px] font-black  text-white">By Frame</h2>
              <div className="mt-3 grid gap-2">
                {Object.entries(byFrame).slice(0, 12).map(([frame, count]) => (
                  <div key={frame} className="flex justify-between rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-2 text-[10px] font-bold  text-slate-400"><span>{frame}</span><span>{count}</span></div>
                ))}
              </div>
            </section>
          </div>
        </GamePanel>

        <GamePanel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[.07] p-5">
            <div>
              <p className="text-[10px] font-black text-cyan-300">Editable stock</p>
              <h2 className="mt-1 text-2xl font-black  italic text-white">Cards</h2>
            </div>
            <Search size={16} className="text-slate-600" />
          </div>
          <div className="divide-y divide-white/[.06]">
            {rows.map((card) => (
              <div key={card.id} className="grid gap-4 p-5">
                <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
                  <div>
                    <p className="text-sm font-black  italic text-white">{card.player_name}</p>
                    <p className="mt-1 text-[9px] font-bold text-slate-600">{card.club_name ?? "No club"} / {card.frame_color} / {card.art_status}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[`legacy ${card.card_status}`, card.sale_status, missingAsset(card) ? "legacy URLs absent" : "legacy URLs present"].map((tag) => (
                      <span key={tag} className="rounded-lg border border-cyan-300/15 bg-cyan-300/[.06] px-2 py-1 text-[8px] font-black text-cyan-100">{tag}</span>
                    ))}
                  </div>
                </div>
                <CardInventoryQuickEdit cardId={card.id} cardStatus={card.card_status} saleStatus={card.sale_status} artStatus={card.art_status} frameColor={card.frame_color} />
              </div>
            ))}
            {!rows.length ? (
              <div className="p-8 text-center">
                <p className="text-sm font-black  italic text-white">No cards in inventory yet</p>
                <p className="mt-2 text-xs text-slate-500">Use Sync drafts to create card inventory records from normalized football players.</p>
              </div>
            ) : null}
          </div>
        </GamePanel>
      </div>
    </div>
  );
}
