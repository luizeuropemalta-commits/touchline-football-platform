import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgePercent, Gift, History, ShieldCheck, WalletCards } from "lucide-react";

import { CreatePromotionForm, GrantCreditForm, PromotionStatusActions } from "@/components/admin-promotions-actions";
import { GamePanel, LivePill, StatTile } from "@/components/arena-admin-ui";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeTouchLineAuthLocale, touchLineAuthEntryHref, touchLineAuthHref, type TouchLineAuthLocale } from "@/lib/touchlineArena/auth-i18n";

export const dynamic = "force-dynamic";

type PromotionRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
};

type LedgerRow = {
  id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  entry_type: string;
  reason: string;
  idempotency_key: string;
  created_at: string;
};

const touchlineCredits = (subunits: number, locale: TouchLineAuthLocale) => `${new Intl.NumberFormat(locale, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
}).format((subunits || 0) / 100)} TC`;
const date = (value: string | null | undefined, locale: TouchLineAuthLocale) => value ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(value)) : "-";

export default async function AdminPromotionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const locale = normalizeTouchLineAuthLocale(typeof params.lang === "string" ? params.lang : null);
  const pt = locale === "pt-BR";
  const t = { owner: pt ? "Área do proprietário" : "Owner area", signIn: pt ? "Entrar" : "Sign in", title: pt ? "Promoções" : "Promotions", intro: pt ? "Entre como proprietário para gerenciar promoções e créditos." : "Sign in as owner to manage promotions and credits.", config: pt ? "Configuração necessária" : "Configuration required", configCopy: pt ? "A chave de serviço do Supabase é necessária para promoções e créditos." : "Supabase service role is required for promotions and credits.", migration: pt ? "Migração necessária" : "Migration required", protected: pt ? "Ledger protegido" : "Ledger protected", eyebrow: pt ? "TouchLine England / Promoções" : "TouchLine England / Promotions", heading: pt ? "Créditos e promoções" : "Credits & Promotions", copy: pt ? "Créditos nunca são editados diretamente. Toda concessão, recompensa, uso ou correção pertence ao ledger imutável, com motivo e chave de idempotência." : "Credits are never edited directly. Every grant, reward, use or correction belongs in the immutable ledger with a reason and idempotency key.", create: pt ? "Criar promoção" : "Create promotion", grant: pt ? "Conceder créditos" : "Grant credits", high: pt ? "Concessões altas devem usar uma chave de idempotência deliberada e um motivo claro." : "High-value grants should use a deliberate idempotency key and a clear reason.", list: pt ? "Lista de promoções" : "Promotion list", campaigns: pt ? "Campanhas" : "Campaigns", history: pt ? "Histórico imutável" : "Immutable history", ledger: pt ? "Ledger de créditos" : "Credit Ledger", none: pt ? "Nenhuma promoção ainda." : "No promotions yet.", entries: pt ? "Nenhuma entrada no ledger ainda." : "No credit ledger entries yet.", promotions: pt ? "Promoções" : "Promotions", active: pt ? "ativas" : "active", total: pt ? "total recente" : "recent rows", credits: pt ? "Créditos" : "Credits", grants: pt ? "concessões/recompensas" : "grants/rewards", idempotency: pt ? "Idempotência" : "Idempotency", keys: pt ? "chaves únicas" : "unique keys", on: pt ? "Ativo" : "On" };
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!user) {
    return (
      <GamePanel className="p-8">
        <LivePill>{t.owner}</LivePill>
        <h1 className="mt-5 text-4xl font-black italic text-white">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">{t.intro}</p>
        <Link href={touchLineAuthEntryHref("/login", locale, touchLineAuthHref("/admin/promotions", locale))} className="mt-6 inline-flex rounded-2xl bg-[#a3ff12] px-5 py-3 text-xs font-black text-black">{t.signIn}</Link>
      </GamePanel>
    );
  }

  if (!isOwnerEmail(user.email)) notFound();

  if (!admin) {
    return (
      <GamePanel className="p-8">
        <LivePill>{t.config}</LivePill>
        <h1 className="mt-5 text-4xl font-black italic text-white">{t.title}</h1>
        <p className="mt-3 text-sm text-slate-400">{t.configCopy}</p>
      </GamePanel>
    );
  }

  let promotions: PromotionRow[] | null = null;
  let ledger: LedgerRow[] | null = null;
  let promotionsError: unknown = null;
  let ledgerError: unknown = null;
  try {
    const results = await Promise.all([
      admin.from("touchline_promotions").select("id,name,description,status,starts_at,ends_at,created_at").order("created_at", { ascending: false }).limit(50).returns<PromotionRow[]>(),
      admin.from("clubowner_credit_ledger").select("id,user_id,amount_cents,currency,entry_type,reason,idempotency_key,created_at").order("created_at", { ascending: false }).limit(80).returns<LedgerRow[]>(),
    ]);
    promotions = results[0].data;
    promotionsError = results[0].error;
    ledger = results[1].data;
    ledgerError = results[1].error;
  } catch {
    promotionsError = new Error("PROMOTION_QUERY_UNAVAILABLE");
  }

  if (promotionsError || ledgerError) {
    return (
      <GamePanel className="p-8">
        <LivePill>{t.migration}</LivePill>
        <h1 className="mt-5 text-4xl font-black italic text-white">{t.title}</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">{pt ? "Os dados de promoções estão temporariamente indisponíveis. Nenhuma alteração foi feita." : "Promotion data is temporarily unavailable. No changes were made."}</p>
      </GamePanel>
    );
  }

  const promotionRows = promotions ?? [];
  const ledgerRows = ledger ?? [];
  const creditTotal = ledgerRows.reduce((total, entry) => total + Number(entry.amount_cents), 0);
  const activePromotions = promotionRows.filter((promotion) => promotion.status === "active").length;

  return (
    <div className="space-y-6">
      <GamePanel className="overflow-hidden p-6 sm:p-8">
        <LivePill>{t.protected}</LivePill>
        <p className="mt-6 text-[10px] font-black text-cyan-300/70">{t.eyebrow}</p>
        <h1 className="mt-2 max-w-4xl text-5xl font-black  italic leading-[.9] text-white md:text-7xl">
          {t.heading}
        </h1>
        <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-300/75">
          {t.copy}
        </p>
      </GamePanel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={BadgePercent} label={t.promotions} value={String(promotionRows.length)} delta={`${activePromotions} ${t.active}`} accent="cyan" />
        <StatTile icon={WalletCards} label={t.ledger} value={touchlineCredits(creditTotal, locale)} delta={t.total} accent="lime" />
        <StatTile icon={Gift} label={t.credits} value={String(ledgerRows.filter((entry) => entry.amount_cents > 0).length)} delta={t.grants} accent="gold" />
        <StatTile icon={ShieldCheck} label={t.idempotency} value={t.on} delta={t.keys} accent="rose" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[.65fr_.65fr_1.2fr]">
        <GamePanel className="p-5">
          <p className="mb-4 text-[10px] font-black text-cyan-300">{t.create}</p>
          <CreatePromotionForm locale={locale} />
        </GamePanel>
        <GamePanel className="p-5">
          <p className="mb-4 text-[10px] font-black text-cyan-300">{t.grant}</p>
          <GrantCreditForm locale={locale} />
          <p className="mt-3 text-[10px] leading-5 text-amber-100/80">{t.high}</p>
        </GamePanel>
        <GamePanel className="overflow-hidden">
          <div className="border-b border-white/[.07] p-5">
            <p className="text-[10px] font-black text-cyan-300">{t.list}</p>
            <h2 className="mt-1 text-2xl font-black italic text-white">{t.campaigns}</h2>
          </div>
          <div className="divide-y divide-white/[.06]">
            {promotionRows.map((promotion) => (
              <div key={promotion.id} className="p-5">
                <p className="text-sm font-black  italic text-white">{promotion.name}</p>
                <p className="mt-1 text-[9px] font-bold text-slate-600">{promotion.status} / {date(promotion.starts_at, locale)} - {date(promotion.ends_at, locale)}</p>
                {promotion.description ? <p className="mt-2 text-[10px] leading-5 text-slate-500">{promotion.description}</p> : null}
                <PromotionStatusActions promotionId={promotion.id} locale={locale} />
              </div>
            ))}
            {!promotionRows.length ? <div className="p-8 text-center text-xs text-slate-500">{t.none}</div> : null}
          </div>
        </GamePanel>
      </div>

      <GamePanel className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[.07] p-5">
          <div>
            <p className="text-[10px] font-black text-cyan-300">{t.history}</p>
            <h2 className="mt-1 text-2xl font-black italic text-white">{t.ledger}</h2>
          </div>
          <History size={16} className="text-slate-600" />
        </div>
        <div className="divide-y divide-white/[.06]">
          {ledgerRows.map((entry) => (
            <div key={entry.id} className="grid gap-2 p-5 md:grid-cols-[1fr_auto_auto] md:items-center">
              <div>
                <p className="text-sm font-black  italic text-white">{entry.reason}</p>
                <p className="mt-1 text-[9px] font-bold text-slate-600">{entry.user_id} / {entry.entry_type} / {entry.idempotency_key}</p>
              </div>
              <span className="text-xs font-black  text-white">{date(entry.created_at, locale)}</span>
              <span className={entry.amount_cents >= 0 ? "text-xs font-black  text-[#a3ff12]" : "text-xs font-black  text-rose-200"}>{touchlineCredits(entry.amount_cents, locale)}</span>
            </div>
          ))}
          {!ledgerRows.length ? <div className="p-8 text-center text-xs text-slate-500">{t.entries}</div> : null}
        </div>
      </GamePanel>
    </div>
  );
}
