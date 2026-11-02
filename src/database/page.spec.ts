import { createPage, PAGE_SIZE } from './page.js';

interface Row {
  readonly id: number;
}

function createRows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({ id: index + 1 }));
}

function readCursor({ id }: Row): Row {
  return { id };
}

describe('createPage', () => {
  it('keeps a page at 50 rows', () => {
    expect(PAGE_SIZE).toBe(50);
  });

  it('has no next bookmark for an empty list', () => {
    expect(createPage([], readCursor)).toEqual({ rows: [], nextCursor: null });
  });

  it('has no next bookmark when the rows fill the page exactly', () => {
    const rows = createRows(PAGE_SIZE);

    expect(createPage(rows, readCursor)).toEqual({ rows, nextCursor: null });
  });

  it('drops the extra row and bookmarks the last row it keeps', () => {
    const rows = createRows(PAGE_SIZE + 1);

    expect(createPage(rows, readCursor)).toEqual({
      rows: rows.slice(0, PAGE_SIZE),
      nextCursor: { id: PAGE_SIZE },
    });
  });
});
