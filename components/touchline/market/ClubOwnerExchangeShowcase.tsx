"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui";
import type { ClubOwnerSquadCard } from "@/lib/touchlineArena/demo-data";
import TouchlineMarketPlayerTile from "./TouchlineMarketPlayerTile";
import { CLUBOWNER_EXCHANGE_NAME, CLUBOWNER_SHOWCASE_LIMIT, type ExchangePlan } from "./exchange-showcase";
import ClubOwnerNegotiationRoom, { ClubOwnerAgentMark } from "./ClubOwnerNegotiationRoom";
import marketStyles from "@/app/fantasy/fantasy.module.css";

type Props = {
  /** Only published listing cards, never the entire private squad or wallet. */
  cards: readonly ClubOwnerSquadCard[];
  locale: string;
  plan?: ExchangePlan;
  renderAction?: (card: ClubOwnerSquadCard) => ReactNode;
  onManage?: () => void;
};

export default function ClubOwnerExchangeShowcase({ cards, locale, plan, renderAction, onManage }: Props) {
  const valid = cards.length <= CLUBOWNER_SHOWCASE_LIMIT
    && new Set(cards.map(c => c.canonicalPlayerId ?? c.id)).size === cards.length;
  return <section aria-label={CLUBOWNER_EXCHANGE_NAME} data-clubowner-showcase="true">
    <ClubOwnerNegotiationRoom plan={plan} />
    <p role="status">{valid ? cards.length : 0}/{CLUBOWNER_SHOWCASE_LIMIT} na vitrine</p>
    {onManage ? <Button variant="secondary" onClick={onManage}>Gerenciar vitrine</Button> : null}
    {!valid ? <p role="alert">Vitrine indisponível. Atualize os anúncios antes de continuar.</p>
      : cards.length === 0 ? <p>Nenhum jogador anunciado para troca.</p>
        : <div className={marketStyles.myClubMarketResults}>{cards.map(card => <TouchlineMarketPlayerTile key={card.canonicalPlayerId ?? card.id} card={card} locale={locale}>{renderAction?.(card)}</TouchlineMarketPlayerTile>)}</div>}
  </section>;
}

/** Integration seam: server chooses the audience. Private market never enters visitor props. */
export function ClubOwnerMarketArea(props:
  | { audience: "owner"; onOpenExchange: () => void }
  | { audience: "visitor"; showcase: Omit<Props, "onManage"> }
) {
  if (props.audience === "visitor") return <ClubOwnerExchangeShowcase cards={props.showcase.cards} locale={props.showcase.locale} plan={props.showcase.plan} renderAction={props.showcase.renderAction} />;
  return <Button variant="secondary" onClick={props.onOpenExchange}><ClubOwnerAgentMark />{CLUBOWNER_EXCHANGE_NAME}</Button>;
}
