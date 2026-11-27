export type RetrievedPage<Row, Cursor = string> = {
  rows: Row[];
  nextCursor: Cursor | null;
  requestedQueryCost: number;
};
