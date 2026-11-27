import { readRetrievedPages } from './read-retrieved-pages.js';
import type { RetrievedPage } from './retrieved-page.js';

export type WalkCount = {
  rows: number;
  pages: number;
  highestRequestedQueryCost: number;
};
type NestedWalkCount = { parents: WalkCount; children: WalkCount };

export const EMPTY_WALK_COUNT: WalkCount = {
  rows: 0,
  pages: 0,
  highestRequestedQueryCost: 0,
};

export function addWalkCounts(first: WalkCount, second: WalkCount): WalkCount {
  return {
    rows: first.rows + second.rows,
    pages: first.pages + second.pages,
    highestRequestedQueryCost: Math.max(
      first.highestRequestedQueryCost,
      second.highestRequestedQueryCost,
    ),
  };
}

export async function countRetrievedPages<Row, Cursor>(
  retrievePage: (cursor: Cursor) => Promise<RetrievedPage<Row, Cursor>>,
  firstCursor: Cursor,
): Promise<WalkCount> {
  let count = EMPTY_WALK_COUNT;
  for await (const page of readRetrievedPages(retrievePage, firstCursor)) {
    count = addPageToWalkCount(count, page);
  }
  return count;
}

export async function countNestedPages<Row, Cursor>(
  retrievePage: (cursor: Cursor) => Promise<RetrievedPage<Row, Cursor>>,
  firstCursor: Cursor,
  countChildren: (row: Row) => Promise<WalkCount>,
): Promise<NestedWalkCount> {
  let count = { parents: EMPTY_WALK_COUNT, children: EMPTY_WALK_COUNT };
  for await (const page of readRetrievedPages(retrievePage, firstCursor)) {
    count = await addNestedPage(count, page, countChildren);
  }
  return count;
}

function addPageToWalkCount(
  count: WalkCount,
  page: RetrievedPage<unknown, unknown>,
): WalkCount {
  return addWalkCounts(count, {
    rows: page.rows.length,
    pages: 1,
    highestRequestedQueryCost: page.requestedQueryCost,
  });
}

async function addNestedPage<Row>(
  count: NestedWalkCount,
  page: RetrievedPage<Row, unknown>,
  countChildren: (row: Row) => Promise<WalkCount>,
): Promise<NestedWalkCount> {
  let children = count.children;
  for (const row of page.rows) {
    children = addWalkCounts(children, await countChildren(row));
  }
  return { parents: addPageToWalkCount(count.parents, page), children };
}
