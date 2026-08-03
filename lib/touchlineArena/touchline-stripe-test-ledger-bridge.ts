export type TouchlineStripeTestLedgerEventKind =
  | "payment-confirmed"
  | "payment-failed"
  | "checkout-expired"
  | "refund-simulated"
  | "dispute-simulated";

export type TouchlineStripeTestLedgerObservation = Readonly<{
  stripeEventId: string;
  operationId: string;
  kind: TouchlineStripeTestLedgerEventKind;
  testOnly: true;
}>;

/**
 * A non-monetary test observation for V2.10. It never writes a wallet,
 * calculates tax, creates a balance or represents a production ledger entry.
 */
export function bridgeTouchlineStripeTestLedgerEvent(input: {
  stripeEventId: string;
  operationId: string;
  stripeEventType: string;
}): TouchlineStripeTestLedgerObservation | null {
  const kindByEvent: Record<string, TouchlineStripeTestLedgerEventKind> = {
    "checkout.session.completed": "payment-confirmed",
    "payment_intent.payment_failed": "payment-failed",
    "checkout.session.expired": "checkout-expired",
    "charge.refunded": "refund-simulated",
    "charge.dispute.created": "dispute-simulated",
  };
  const kind = kindByEvent[input.stripeEventType];
  if (!kind) return null;
  return { stripeEventId: input.stripeEventId, operationId: input.operationId, kind, testOnly: true };
}
