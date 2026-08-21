export function resolveTouchlineMarketCataloguePosition(
  _providerId: string | null | undefined,
  persistedPosition: string | null | undefined,
) {
  // Exact positions come from the persisted Sportmonks detailed-position
  // contract or an approved TouchLine override. Provider-ID catalogues are
  // forbidden: they silently turned real wingers into full-backs.
  return persistedPosition ?? null;
}
