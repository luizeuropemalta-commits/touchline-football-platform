import { ArenaAdminShell } from "../../components/arena-admin-shell";
import { CardInventoryQuickEdit } from "../../components/admin-card-inventory-actions";
import { CreatePromotionForm, GrantCreditForm } from "../../components/admin-promotions-actions";

/** Synthetic owner/record only; the real shell, CSS, menu hooks and fields run. */
export default function AdminMobileBrowserFixture() {
  const pt = new URLSearchParams(location.search).get("lang") === "pt-BR";
  return <ArenaAdminShell accountId="10000000-0000-4000-8000-000000000001" profileName="Synthetic Owner" profileEmail="fixture@example.invalid" isOwner>
    <h1>{pt ? "Inventário de cards" : "Card inventory"}</h1>
    <p id="secondary-copy" className="text-[10px] text-slate-600">{pt ? "Informação secundária legível" : "Readable secondary information"}</p>
    <CardInventoryQuickEdit cardId="10000000-0000-4000-8000-000000000002" cardStatus="pending" saleStatus="not_listed" artStatus="missing" frameColor="unassigned" locale={pt ? "pt-BR" : "en-GB"} />
    <CreatePromotionForm locale={pt ? "pt-BR" : "en-GB"} />
    <GrantCreditForm locale={pt ? "pt-BR" : "en-GB"} />
    <div style={{ height: 1400 }} />
  </ArenaAdminShell>;
}
