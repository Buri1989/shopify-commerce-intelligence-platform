import type { Page } from '../src/database/page.js';

export async function readAllPages<Row, Cursor>(
  readPage: (cursor: Cursor | null) => Promise<Page<Row, Cursor>>,
): Promise<Row[][]> {
  const pages: Row[][] = [];
  let cursor: Cursor | null = null;
  do {
    const page: Page<Row, Cursor> = await readPage(cursor);
    pages.push(page.rows);
    cursor = page.nextCursor;
  } while (cursor !== null);
  return pages;
}
