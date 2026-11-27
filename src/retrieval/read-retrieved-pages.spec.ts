import { collectAsyncValues } from '../../test/async-values.js';
import { readRetrievedPages } from './read-retrieved-pages.js';
import type { RetrievedPage } from './retrieved-page.js';

const NEXT_PAGE: RetrievedPage<string> = {
  rows: ['first'],
  nextCursor: 'cursor-2',
  requestedQueryCost: 10,
};
const LAST_PAGE: RetrievedPage<string> = {
  rows: ['second'],
  nextCursor: null,
  requestedQueryCost: 12,
};

describe('readRetrievedPages', () => {
  const retrievePage =
    vi.fn<(cursor: string | null) => Promise<RetrievedPage<string>>>();

  afterEach(() => {
    retrievePage.mockReset();
  });

  it('asks for the first page from the given cursor', async () => {
    retrievePage.mockResolvedValue(LAST_PAGE);

    await collectAsyncValues(readRetrievedPages(retrievePage, 'cursor-1'));

    expect(retrievePage).toHaveBeenCalledExactlyOnceWith('cursor-1');
  });

  it('asks for each next page from the cursor of the page before it', async () => {
    retrievePage
      .mockResolvedValueOnce(NEXT_PAGE)
      .mockResolvedValueOnce(LAST_PAGE);

    await collectAsyncValues(readRetrievedPages(retrievePage, null));

    expect(retrievePage.mock.calls).toEqual([[null], ['cursor-2']]);
  });

  it('hands out every page in order, ending with the last page', async () => {
    retrievePage
      .mockResolvedValueOnce(NEXT_PAGE)
      .mockResolvedValueOnce(LAST_PAGE);

    expect(
      await collectAsyncValues(readRetrievedPages(retrievePage, null)),
    ).toEqual([NEXT_PAGE, LAST_PAGE]);
  });
});
