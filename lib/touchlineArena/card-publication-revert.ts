type RecordValue = Record<string, unknown>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function uuid(value: unknown) {
  return typeof value === "string" && UUID_PATTERN.test(value.trim());
}

/**
 * A history row may offer rollback only when it contains both immutable prior
 * states. The database command repeats canonical membership validation under
 * lock; this helper merely prevents a misleading Admin button.
 */
export function hasTouchlineCardPublicationRevertSnapshot(beforeState: unknown) {
  const outer = record(beforeState);
  const publication = record(outer?.publication);
  const marketValue = record(outer?.market_value);
  return Boolean(
    publication
    && marketValue
    && uuid(publication.id)
    && uuid(publication.player_id)
    && uuid(publication.current_membership_id)
    && uuid(marketValue.id)
    && uuid(marketValue.player_id)
    && publication.player_id === marketValue.player_id,
  );
}
