import type { RetrievedPage } from './retrieved-page.js';

export async function* readRetrievedPages<Row, Cursor>(
  retrievePage: (cursor: Cursor) => Promise<RetrievedPage<Row, Cursor>>,
  firstCursor: Cursor,
): AsyncGenerator<RetrievedPage<Row, Cursor>> {
  let page = await retrievePage(firstCursor);
  yield page;
  while (page.nextCursor !== null) {
    page = await retrievePage(page.nextCursor);
    yield page;
  }
}
