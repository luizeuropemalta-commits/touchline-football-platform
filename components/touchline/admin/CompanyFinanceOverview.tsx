"use client";
import { useEffect, useState } from "react";
import { GamePanel } from "@/components/arena-admin-ui";
import { Button } from "@/components/ui";
import { formatCompanyOverviewAmount, parseCompanyOverview, type CompanyOverview } from "@/lib/admin/company-finance-overview";

export function CompanyFinanceOverview({ portuguese }: { portuguese: boolean }) {
  const t = (pt: string, en: string) => portuguese ? pt : en;
  const locale = portuguese ? "pt-BR" : "en-GB";
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<CompanyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void fetch("/api/admin/company-finance/overview", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async response => {
        if (!response.ok) throw new Error("UNAVAILABLE");
        const data = parseCompanyOverview(await response.json());
        if (!data) throw new Error("INVALID_OVERVIEW");
        if (active) setResult(data);
      })
      .catch(() => { if (active) setResult(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [attempt]);
  return <GamePanel className="space-y-5 p-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h2 className="text-xl font-bold">{t("Visão financeira da empresa", "Company financial overview")}</h2>
      <Button type="button" disabled={loading} onClick={() => { setLoading(true); setResult(null); setAttempt(v => v + 1); }}>{t("Atualizar resumo", "Refresh overview")}</Button>
    </div>
    {loading ? <p role="status">{t("Conferindo despesas e pagamentos…", "Checking expenses and payments…")}</p>
      : !result ? <p role="alert" className="text-amber-200">{t("Resumo indisponível. Não foi possível confirmar os valores; isso não significa despesa zero.", "Overview unavailable. Amounts could not be confirmed; this does not mean zero expenses.")}</p>
      : <>
        <p className="text-sm text-slate-300">{t("Todos os registros cadastrados, separados por moeda e precisão de origem. Sem conversão cambial e sem créditos TC.", "All recorded entries, separated by currency and source precision. No currency conversion or TC credits.")}</p>
        <dl className="grid gap-4 sm:grid-cols-3">
          {[[t("Fornecedores", "Suppliers"), result.suppliers], [t("Contratos", "Contracts"), result.contracts], [t("Contratos com prazos nos próximos 30 dias", "Contracts with deadlines in the next 30 days"), result.contractDeadlines]].map(([label, value]) => <div key={label} className="rounded-2xl border border-white/10 p-4"><dt className="text-sm text-slate-300">{label}</dt><dd className="mt-2 text-2xl font-semibold">{value}</dd></div>)}
        </dl>
        {!result.currencies.length ? <p>{t("Nenhuma despesa cadastrada. Contas ainda não registradas não entram neste resumo.", "No recorded expenses. Unrecorded bills are not included in this overview.")}</p> : result.currencies.map(row => <section key={`${row.currency}:${row.exponent}`} className="space-y-4 rounded-2xl border border-white/10 p-4" aria-label={row.currency}>
          <h3 className="font-semibold">{row.currency} · {row.obligations} {t("contas cadastradas", "recorded bills")}</h3>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[[t("Despesas registradas", "Recorded expenses"), row.registered], [t("Pagamentos confirmados", "Confirmed payments"), row.paid], [t("Saldo a pagar", "Outstanding"), row.outstanding], [t("Valor vencido", "Overdue amount"), row.overdue], [t("Pago a mais — conferir", "Overpayment — reconcile"), row.overpaid]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-sm text-slate-300">{label}</dt><dd className="mt-1 break-words text-lg font-semibold tabular-nums">{formatCompanyOverviewAmount(value, row.exponent, row.currency, locale)}</dd></div>)}
          </dl>
          <p className="text-sm text-slate-400">{row.overdueCount} {t("contas vencidas. Valores mantêm as casas decimais do documento de origem.", "overdue bills. Amounts retain the source document’s decimal precision.")}</p>
        </section>)}
        <p className="text-xs text-slate-400">{t("Data de referência", "Reference date")}: <time dateTime={result.asOf}>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(result.asOf + "T00:00:00Z"))}</time>. {t("O resumo registra despesas e baixas; nenhum pagamento é executado aqui.", "The overview records expenses and settlements; no payment is executed here.")}</p>
      </>}
  </GamePanel>;
}
