export type RetrievedPage<Row, Cursor = string> = {
  rows: Row[];
  nextCursor: Cursor | null;
  requestedQueryCost: number;
};

export function createEmptyLastPage<Row, Cursor>(
  requestedQueryCost: number,
): RetrievedPage<Row, Cursor> {
  return { rows: [], nextCursor: null, requestedQueryCost };
}
