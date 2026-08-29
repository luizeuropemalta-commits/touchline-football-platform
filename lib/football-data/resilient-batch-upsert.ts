export type TouchLineBatchWriteError = { message?: string | null } | null;

export type TouchLineResilientBatchResult<T> = {
  written: T[];
  failed: Array<{ row: T; error: string }>;
};

/**
 * Keep one invalid read-model row from starving every live fixture. The fast
 * path remains one bulk write; only a rejected batch is bisected until the
 * exact failing row is isolated for an auditable retry on the next live-sync.
 */
export async function upsertTouchLineRowsResiliently<T>(
  rows: readonly T[],
  write: (batch: readonly T[]) => Promise<{ error: TouchLineBatchWriteError }>,
): Promise<TouchLineResilientBatchResult<T>> {
  const result: TouchLineResilientBatchResult<T> = { written: [], failed: [] };

  async function persist(batch: readonly T[]): Promise<void> {
    if (!batch.length) return;
    const { error } = await write(batch);
    if (!error) {
      result.written.push(...batch);
      return;
    }
    if (batch.length === 1) {
      result.failed.push({ row: batch[0], error: error.message?.trim() || "unknown-write-error" });
      return;
    }
    const middle = Math.ceil(batch.length / 2);
    await persist(batch.slice(0, middle));
    await persist(batch.slice(middle));
  }

  await persist(rows);
  return result;
}
