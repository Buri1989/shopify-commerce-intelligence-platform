import { createEmptyLastPage } from './retrieved-page.js';

describe('createEmptyLastPage', () => {
  it('returns no rows, no next cursor and the query cost', () => {
    expect(createEmptyLastPage(3)).toEqual({
      rows: [],
      nextCursor: null,
      requestedQueryCost: 3,
    });
  });
});
