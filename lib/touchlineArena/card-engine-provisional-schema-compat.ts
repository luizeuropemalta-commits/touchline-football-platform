type PostgrestErrorLike = Readonly<{
  code?: string | null;
  message?: string | null;
}>;

const PROVISIONAL_COLUMNS = [
  "provenance_status",
  "last_verification_at",
  "next_verification_at",
] as const;

export function isTouchlineProvisionalRpcUnavailable(error: PostgrestErrorLike | null | undefined) {
  const code = String(error?.code ?? "").trim().toUpperCase();
  const message = String(error?.message ?? "").toLowerCase();
  return code === "PGRST202"
    || (
      message.includes("touchline_card_engine_reconcile_official_lineup_shirts")
      && (message.includes("could not find") || message.includes("schema cache"))
    );
}

export function isTouchlineProvisionalColumnsUnavailable(error: PostgrestErrorLike | null | undefined) {
  const code = String(error?.code ?? "").trim().toUpperCase();
  const message = String(error?.message ?? "").toLowerCase();
  if (!PROVISIONAL_COLUMNS.some((column) => message.includes(column))) return false;
  return code === "42703"
    || code === "PGRST204"
    || message.includes("does not exist")
    || message.includes("could not find")
    || message.includes("schema cache");
}
