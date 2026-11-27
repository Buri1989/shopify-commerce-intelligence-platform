import type { RetrievedPage } from './retrieved-page.js';
import {
  addWalkCounts,
  countNestedPages,
  countRetrievedPages,
  type WalkCount,
} from './walk-count.js';

const NEXT_PAGE: RetrievedPage<string> = {
  rows: ['first', 'second'],
  nextCursor: 'cursor-2',
  requestedQueryCost: 12,
};
const LAST_PAGE: RetrievedPage<string> = {
  rows: ['third'],
  nextCursor: null,
  requestedQueryCost: 10,
};
const CHILDREN_COUNT: WalkCount = {
  rows: 2,
  pages: 1,
  highestRequestedQueryCost: 7,
};

describe('addWalkCounts', () => {
  it('adds the rows and pages of both counts and keeps the higher cost', () => {
    expect(
      addWalkCounts(
        { rows: 10, pages: 2, highestRequestedQueryCost: 12 },
        { rows: 5, pages: 1, highestRequestedQueryCost: 30 },
      ),
    ).toEqual({ rows: 15, pages: 3, highestRequestedQueryCost: 30 });
  });
});

describe('countRetrievedPages', () => {
  const retrievePage =
    vi.fn<(cursor: string | null) => Promise<RetrievedPage<string>>>();

  afterEach(() => {
    retrievePage.mockReset();
  });

  it('counts the rows and pages of every page and keeps the highest cost', async () => {
    retrievePage
      .mockResolvedValueOnce(NEXT_PAGE)
      .mockResolvedValueOnce(LAST_PAGE);

    expect(await countRetrievedPages(retrievePage, null)).toEqual({
      rows: 3,
      pages: 2,
      highestRequestedQueryCost: 12,
    });
  });
});

describe('countNestedPages', () => {
  const retrievePage =
    vi.fn<(cursor: string | null) => Promise<RetrievedPage<string>>>();
  const countChildren = vi.fn<(row: string) => Promise<WalkCount>>();

  beforeEach(() => {
    retrievePage
      .mockResolvedValueOnce(NEXT_PAGE)
      .mockResolvedValueOnce(LAST_PAGE);
    countChildren.mockResolvedValue(CHILDREN_COUNT);
  });

  afterEach(() => {
    retrievePage.mockReset();
    countChildren.mockReset();
  });

  it('counts the children of each row, in order', async () => {
    await countNestedPages(retrievePage, null, countChildren);

    expect(countChildren.mock.calls).toEqual([
      ['first'],
      ['second'],
      ['third'],
    ]);
  });

  it("counts the parents' pages and adds up the children of every row", async () => {
    expect(await countNestedPages(retrievePage, null, countChildren)).toEqual({
      parents: { rows: 3, pages: 2, highestRequestedQueryCost: 12 },
      children: { rows: 6, pages: 3, highestRequestedQueryCost: 7 },
    });
  });
});
