export const TOUCHLINE_CARD_SYNC_PAGE_SIZE = 500;

export async function collectPaginatedRows<T>(
  readPage: (from: number, to: number) => Promise<T[]>,
  pageSize = TOUCHLINE_CARD_SYNC_PAGE_SIZE,
) {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("TL_PAGINATED_READ_INVALID_PAGE_SIZE");
  }

  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await readPage(offset, offset + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
