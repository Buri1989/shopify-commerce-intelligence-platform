export const PAGE_SIZE = 50;

// One row past the page: if it comes back, there is a next page.
export const PAGE_QUERY_LIMIT = PAGE_SIZE + 1;

export interface Page<Row, Cursor> {
  readonly rows: Row[];
  readonly nextCursor: Cursor | null;
}

export function createPage<Row, Cursor>(
  rows: Row[],
  readCursor: (row: Row) => Cursor,
): Page<Row, Cursor> {
  if (rows.length <= PAGE_SIZE) {
    return { rows, nextCursor: null };
  }
  return {
    rows: rows.slice(0, PAGE_SIZE),
    nextCursor: readCursor(rows[PAGE_SIZE - 1]),
  };
}
