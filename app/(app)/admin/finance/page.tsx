import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleDollarSign, Download, Receipt, ShieldCheck, TriangleAlert, WalletCards } from "lucide-react";

import { GamePanel, LivePill, StatTile } from "@/components/arena-admin-ui";
import { summarizeInvoiceSample, summarizeFeeSample, formatStripeMinorAmount } from "@/lib/admin/finance-summary";
import { isOwnerEmail } from "@/lib/admin/owner";
import { getStripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeTouchLineAuthLocale, touchLineAuthEntryHref, touchLineAuthHref, type TouchLineAuthLocale } from "@/lib/touchlineArena/auth-i18n";

export const dynamic = "force-dynamic";

type InvoiceRow = {
  id: string;
  status: string | null;
  currency: string;
  subtotal: number;
  tax: number | null;
  total: number;
  amount_paid: number;
  amount_due: number;
  created_at: string;
  paid_at: string | null;
  stripe_invoice_id: string;
  number: string | null;
};

const money = (amount: number, locale: TouchLineAuthLocale, currency = "EUR") => formatStripeMinorAmount(amount, locale, currency);
const date = (value: string | null | undefined, locale: TouchLineAuthLocale) => {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(parsed) : "—";
};

function statusCount(rows: InvoiceRow[], status: string) {
  return rows.filter((row) => row.status === status).length;
}

function invoiceStatusBreakdown(rows: InvoiceRow[]) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const status = row.status?.trim() || "unknown";
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
}

export default async function AdminFinancePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const locale = normalizeTouchLineAuthLocale(typeof params.lang === "string" ? params.lang : null);
  const t = (pt: string, en: string) => locale === "pt-BR" ? pt : en;
  const statusLabel = (value: string | null) => {
    const labels: Record<string, string> = {
      paid: t("Paga", "Paid"), open: t("Em aberto", "Open"), draft: t("Rascunho", "Draft"),
      void: t("Cancelada", "Void"), deleted: t("Excluída", "Deleted"), uncollectible: t("Incobrável", "Uncollectible"), unknown: t("Não informada", "Unknown"),
    };
    const code = value ?? "unknown";
    return Object.hasOwn(labels, code) ? labels[code] : code.replaceAll("_", " ");
  };
  const supabase = await createClient();
  const admin = createAdminClient();
  const { data: { user } } = supabase ? await supabase.auth.getUser() : { data: { user: null } };

  if (!user) {
    return (
      <GamePanel className="p-8">
        <LivePill>{t("Área do proprietário", "Owner area")}</LivePill>
        <h1 className="mt-5 text-4xl font-black  italic text-white">{t("Controle financeiro", "Finance Control")}</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-400">{t("Entre como proprietário para consultar os registros de pagamento.", "Sign in as owner to inspect payment records.")}</p>
        <Link href={touchLineAuthEntryHref("/login", locale, touchLineAuthHref("/admin/finance", locale))} className="mt-6 inline-flex rounded-2xl bg-[#a3ff12] px-5 py-3 text-xs font-black text-black">{t("Entrar", "Sign in")}</Link>
      </GamePanel>
    );
  }

  if (!isOwnerEmail(user.email)) notFound();

  if (!admin) {
    return (
      <GamePanel className="p-8">
        <LivePill>{t("Configuração necessária", "Configuration required")}</LivePill>
        <h1 className="mt-5 text-4xl font-black  italic text-white">{t("Controle financeiro", "Finance Control")}</h1>
        <p className="mt-3 text-sm text-slate-400">{t("O acesso protegido ao banco de dados precisa estar configurado para administrar as finanças.", "Supabase service role is required for protected financial administration.")}</p>
      </GamePanel>
    );
  }

  const [{ data: invoices, error: invoiceError }, { data: webhookEvents, error: webhookError }] = await Promise.all([
    admin.from("billing_invoices").select("id,status,currency,subtotal,tax,total,amount_paid,amount_due,created_at,paid_at,stripe_invoice_id,number").order("created_at", { ascending: false }).limit(100).returns<InvoiceRow[]>().then((result) => result, () => ({ data: null, error: true })),
    admin.from("stripe_webhook_events").select("stripe_event_id,event_type,processed_at").order("processed_at", { ascending: false }).limit(12).then((result) => result, () => ({ data: null, error: true })),
  ]);

  const stripe = getStripe();
  const [balance, balanceTransactions] = stripe
    ? await Promise.all([
        stripe.balance.retrieve().catch(() => null),
        stripe.balanceTransactions.list({ limit: 12 }).catch(() => null),
      ])
    : [null, null];

  const invoiceSummary = summarizeInvoiceSample(invoices, Boolean(invoiceError));
  const feeSummary = summarizeFeeSample(balanceTransactions?.data ?? null);
  const invoiceRows = invoiceSummary.status === "ready" ? invoices ?? [] : [];
  const invoiceStatuses = invoiceStatusBreakdown(invoiceRows);
  const invoicesAvailable = invoiceSummary.status === "ready";
  const webhookAvailable = !webhookError && webhookEvents !== null;

  return (
    <div className="space-y-6">
      <GamePanel className="overflow-hidden p-6 sm:p-8">
        <div className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
          <div>
            <LivePill>{t("Consulta financeira", "Read-only finance")}</LivePill>
            <p className="mt-6 text-xs font-black text-cyan-300/70">{t("TouchLine England / Consulta financeira protegida", "TouchLine England / Secure money view")}</p>
            <h1 className="mt-2 max-w-4xl text-5xl font-black  italic leading-[.9] text-white md:text-7xl">
              {t("Controle financeiro", "Finance Control")} </h1>
            <Link href={`/admin/company-finance?lang=${locale}`} className="mt-3 inline-flex text-sm font-bold text-[#b7ff45] underline underline-offset-4">{locale === "pt-BR" ? "Fornecedores, contratos e despesas" : "Suppliers, contracts and expenses"}</Link>
            <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-300/75">
              {t("Conciliação dos registros sincronizados com a Stripe, somente para consulta. Esta tela não executa reembolsos, transferências ou alterações de conta.", "Read-only reconciliation from Stripe-synchronized billing tables. No bank passwords, no exposed secret keys, no automatic refunds, transfers or account changes.")} </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="/api/admin/finance/export" className="inline-flex min-h-11 items-center gap-2 py-2 rounded-2xl bg-[#a3ff12] px-5 text-xs font-black text-[#071007]">
                <Download size={14} /> {t("Exportar últimas 1.000 faturas (CSV)", "Export latest 1,000 invoices (CSV)")} </a>
              <Link href={touchLineAuthHref("/admin", locale)} className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[.06] px-4 py-3 text-xs font-black text-cyan-100">{t("Administração", "Owner Admin")}</Link>
            </div>
          </div>
          <div className="rounded-3xl border border-cyan-300/15 bg-black/20 p-5">
            <p className="text-xs font-black text-cyan-300">{t("Saldo na Stripe", "Provider balance")}</p>
            <div className="mt-5 space-y-4">
              {(balance?.available ?? []).slice(0, 3).map((item) => (
                <div key={`available-${item.currency}`} className="flex justify-between border-b border-white/[.06] pb-3">
                  <span className="text-xs font-bold text-slate-400">{t("Disponível", "Available")} {item.currency}</span>
                  <span className="text-xs font-black  text-white">{money(item.amount, locale, item.currency)}</span>
                </div>
              ))}
              {(balance?.pending ?? []).slice(0, 3).map((item) => (
                <div key={`pending-${item.currency}`} className="flex justify-between border-b border-white/[.06] pb-3">
                  <span className="text-xs font-bold text-slate-400">{t("Pendente", "Pending")} {item.currency}</span>
                  <span className="text-xs font-black  text-white">{money(item.amount, locale, item.currency)}</span>
                </div>
              ))}
              {!balance ? <p className="text-xs leading-5 text-slate-400">{t("O saldo da Stripe aparece aqui quando a conexão está configurada e disponível.", "Stripe balance appears here when the server key is configured and reachable.")}</p> : null}
            </div>
          </div>
        </div>
      </GamePanel>

      <GamePanel className="space-y-4 p-5">
        <p className="text-sm text-slate-300">{t("Amostra das últimas 100 faturas. Valores separados por moeda, sem conversão. Não são totais de todo o período. O valor devido original é o registrado na emissão da fatura, não o saldo que ainda falta pagar.", "Invoice sample: latest 100 records. Amounts are grouped by currency, without conversion. These are not all-time totals. Original amount due is the invoice’s original amount_due, not its outstanding balance.")}</p>
        {invoiceSummary.currencies.map((group) => (
          <div key={group.currency} className="grid gap-4 md:grid-cols-2">
            <StatTile icon={CircleDollarSign} label={`${t("Pago", "Paid")} · ${group.currency}`} value={money(group.paid, locale, group.currency)} delta={`${group.count} ${group.count === 1 ? t("fatura na amostra", "sampled invoice") : t("faturas na amostra", "sampled invoices")}`} accent="gold" />
            <StatTile icon={Receipt} label={`${t("Valor devido original", "Original amount due")} · ${group.currency}`} value={money(group.due, locale, group.currency)} delta={t("mesma amostra de faturas", "same invoice sample")} accent="cyan" />
          </div>
        ))}
        {!invoiceSummary.currencies.length ? <p role={invoicesAvailable ? undefined : "status"} className="text-sm text-slate-400">{invoicesAvailable ? t("Nenhuma fatura na amostra confirmada.", "No invoices in the confirmed sample.") : t("Amostra de faturas indisponível. Valores não confirmados.", "Invoice sample unavailable. Amounts are not confirmed.")}</p> : null}
        <div className="grid gap-4 md:grid-cols-3">
          <StatTile icon={Receipt} label={t("Faturas em aberto", "Open invoices")} value={invoicesAvailable ? String(statusCount(invoiceRows, "open")) : "—"} delta={t("últimos 100 registros", "latest 100 records")} accent="cyan" />
          <StatTile icon={TriangleAlert} label={t("Faturas consideradas incobráveis", "Uncollectible invoices")} value={invoicesAvailable ? String(statusCount(invoiceRows, "uncollectible")) : "—"} delta={t("últimos 100 registros", "latest 100 records")} accent="rose" />
          <StatTile icon={ShieldCheck} label="Webhooks" value={webhookAvailable ? String(webhookEvents?.length ?? 0) : "—"} delta={webhookAvailable ? t("últimos 12 registros", "latest 12 records") : t("consulta indisponível", "read unavailable")} accent="cyan" />
        </div>
      </GamePanel>
      <GamePanel className="space-y-4 p-5">
        <p className="text-sm text-slate-300">{t("Amostra de taxas da Stripe: últimas 12 movimentações do saldo, consultadas separadamente das faturas. Não calculamos um resultado líquido conciliado usando essas duas amostras diferentes.", "Stripe fee sample: latest 12 balance transactions, a separate window from invoices. No reconciled net is calculated from these different samples.")}</p>
        <div className="grid gap-4 md:grid-cols-2">
          {feeSummary.currencies.map((group) => <StatTile key={group.currency} icon={WalletCards} label={`${t("Taxas", "Fees")} · ${group.currency}`} value={money(group.fees, locale, group.currency)} delta={`${group.count} ${t("movimentações na amostra", "sampled transactions")}`} accent="rose" />)}
        </div>
        {!feeSummary.currencies.length ? <p role={feeSummary.status === "ready" ? undefined : "status"} className="text-sm text-slate-400">{feeSummary.status === "ready" ? t("Nenhuma movimentação na amostra de taxas confirmada.", "No transactions in the confirmed fee sample.") : t("Amostra de taxas da Stripe indisponível. Taxas não confirmadas.", "Stripe fee sample unavailable. Fees are not confirmed.")}</p> : null}
      </GamePanel>

      <div className="grid gap-5 xl:grid-cols-[.65fr_1.35fr]">
        <GamePanel className="p-5">
          <p className="text-xs font-black text-cyan-300">{t("Resumo das situações das faturas", "Invoice status summary")}</p>
          <h2 className="mt-1 text-2xl font-black italic text-white">{t("Registros de cobrança", "Billing Records")}</h2>
          <div className="mt-4 grid gap-2">
            {Object.entries(invoiceStatuses).map(([status, count]) => (
              <div key={status} className="flex justify-between rounded-xl border border-white/[.06] bg-white/[.025] px-3 py-2 text-xs font-bold text-slate-400">
                <span>{statusLabel(status)}</span><span>{count}</span>
              </div>
            ))}
            {!Object.keys(invoiceStatuses).length ? <p className="text-xs text-slate-400">{invoicesAvailable ? t("Nenhuma fatura na amostra confirmada.", "No invoices in the confirmed sample.") : t("Situação das faturas indisponível.", "Invoice status unavailable.")}</p> : null}
          </div>
          <p className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/[.055] p-3 text-xs leading-5 text-amber-100/80">
            {t("Reembolsos, transferências e alterações da conta de recebimento não estão disponíveis nesta tela de consulta.", "Refunds, transfers and payout account changes are intentionally not available here. Add reinforced confirmation only when operations are legally ready.")} </p>
        </GamePanel>

        <GamePanel className="overflow-hidden">
          <div className="border-b border-white/[.07] p-5">
            <p className="text-xs font-black text-cyan-300">{t("Movimentações recentes", "Recent transactions")}</p>
            <h2 className="mt-1 text-2xl font-black  italic text-white">{t("Amostras financeiras recentes", "Recent Financial Samples")}</h2>
          </div>
          <div className="divide-y divide-white/[.06]">
            {(balanceTransactions?.data ?? []).map((tx) => (
              <div key={tx.id} className="grid gap-2 p-5 md:grid-cols-[1fr_auto_auto] md:items-center">
                <div>
                  <p className="text-sm font-black  italic text-white">{tx.description || tx.type}</p>
                  <p className="mt-1 text-xs font-bold text-slate-400">{tx.id.slice(0, 10)}... / {date(new Date(tx.created * 1000).toISOString(), locale)}</p>
                </div>
                <span className="text-xs font-black  text-white">{money(tx.amount, locale, tx.currency)}</span>
                <span className="text-xs font-black  text-rose-200">{money(tx.fee, locale, tx.currency)}</span>
              </div>
            ))}
            {!balanceTransactions?.data.length ? (
              invoiceRows.slice(0, 12).map((invoice) => (
                <div key={invoice.id} className="grid gap-2 p-5 md:grid-cols-[1fr_auto_auto] md:items-center">
                  <div>
                    <p className="text-sm font-black  italic text-white">{invoice.number ?? t("Fatura", "Invoice")}</p>
                    <p className="mt-1 text-xs font-bold text-slate-400">{statusLabel(invoice.status)} / {date(invoice.created_at, locale)}</p>
                  </div>
                  <span className="text-xs font-black  text-white">{money(invoice.total, locale, invoice.currency)}</span>
                  <span className="text-xs font-black  text-cyan-200">{money(invoice.amount_paid, locale, invoice.currency)}</span>
                </div>
              ))
            ) : null}
            {!balanceTransactions?.data.length && !invoiceRows.length ? <div className="p-8 text-center text-xs text-slate-400">{invoicesAvailable ? t("Nenhuma fatura na amostra confirmada.", "No invoices in the confirmed sample.") : t("Registros de faturas indisponíveis.", "Invoice records unavailable.")}</div> : null}
          </div>
        </GamePanel>
      </div>
    </div>
  );
}
