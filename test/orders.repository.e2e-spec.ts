import { DuplicateRowError } from '../src/common/errors/duplicate-row.error.js';
import { RowNotFoundError } from '../src/common/errors/row-not-found.error.js';
import { PAGE_SIZE } from '../src/database/page.js';
import {
  OrdersRepository,
  type NewOrder,
  type NewOrderItem,
  type Order,
  type OrderCursor,
  type OrderFilters,
} from '../src/orders/orders.repository.js';
import { StoresRepository } from '../src/stores/stores.repository.js';
import {
  createMany,
  createNewOrder,
  createNewOrderItem,
  createNewStore,
} from './new-rows.js';
import { readAllPages } from './read-all-pages.js';
import {
  createRepositoryDatabase,
  type RepositoryDatabase,
} from './repository-database.js';

const DATABASE_NAME = 'orders_repository_e2e';
const MISSING_ID = 999_999_999;
const ONE_SECOND = 1_000;
const NOON = new Date('2026-03-10T12:00:00.000Z');
const JUST_BEFORE_NOON = new Date('2026-03-10T11:59:59.999Z');
const AN_HOUR_BEFORE_NOON = new Date('2026-03-10T11:00:00.000Z');

let repositoryDatabase: RepositoryDatabase;
let stores: StoresRepository;
let repository: OrdersRepository;

function createStore(): Promise<number> {
  return stores.create(createNewStore());
}

function createOrder(
  storeId: number,
  columns: Partial<NewOrder> = {},
  items: NewOrderItem[] = [],
): Promise<number> {
  return repository.create(storeId, { ...createNewOrder(), ...columns }, items);
}

function createOrders(
  storeId: number,
  count: number,
  columns: Partial<NewOrder> = {},
): Promise<number[]> {
  return createMany(count, () => createOrder(storeId, columns));
}

async function readListedIds(
  storeId: number,
  filters?: OrderFilters,
): Promise<number[]> {
  const { rows } = await repository.list(storeId, filters);
  return rows.map(({ id }) => id);
}

function readListedPages(
  storeId: number,
  filters: OrderFilters = {},
): Promise<Order[][]> {
  return readAllPages((cursor: OrderCursor | null) =>
    repository.list(storeId, filters, cursor),
  );
}

describe('OrdersRepository (e2e)', () => {
  beforeAll(async () => {
    repositoryDatabase = await createRepositoryDatabase(DATABASE_NAME);
    stores = new StoresRepository(repositoryDatabase.database);
    repository = new OrdersRepository(repositoryDatabase.database);
  });

  afterAll(async () => {
    await repositoryDatabase.close();
  });

  it('finds the order it created, with its items', async () => {
    const storeId = await createStore();
    const newOrder = createNewOrder();
    const firstItem = createNewOrderItem();
    const secondItem = createNewOrderItem();

    const id = await repository.create(storeId, newOrder, [
      firstItem,
      secondItem,
    ]);

    expect(await repository.findById(storeId, id)).toMatchObject({
      id,
      storeId,
      ...newOrder,
      items: [
        { ...firstItem, storeId, orderId: id },
        { ...secondItem, storeId, orderId: id },
      ],
    });
  });

  it('brings only the items of that order', async () => {
    const storeId = await createStore();
    const item = createNewOrderItem();
    await createOrder(storeId, {}, [createNewOrderItem()]);
    const id = await createOrder(storeId, {}, [item]);

    const order = await repository.findById(storeId, id);

    expect(order?.items).toMatchObject([item]);
  });

  it('saves an order with no items', async () => {
    const storeId = await createStore();
    const id = await createOrder(storeId);

    const order = await repository.findById(storeId, id);

    expect(order?.items).toEqual([]);
  });

  it('finds nothing for a missing order', async () => {
    const storeId = await createStore();

    expect(await repository.findById(storeId, MISSING_ID)).toBeUndefined();
  });

  it("finds nothing for another store's order", async () => {
    const id = await createOrder(await createStore());

    expect(await repository.findById(await createStore(), id)).toBeUndefined();
  });

  it('refuses the same Shopify id twice in one store', async () => {
    const storeId = await createStore();
    const newOrder = createNewOrder();
    await repository.create(storeId, newOrder, []);

    await expect(repository.create(storeId, newOrder, [])).rejects.toThrow(
      DuplicateRowError,
    );
  });

  it('accepts the same Shopify id in two stores', async () => {
    const newOrder = createNewOrder();
    await repository.create(await createStore(), newOrder, []);

    await expect(
      repository.create(await createStore(), newOrder, []),
    ).resolves.toBeTypeOf('number');
  });

  it('keeps no order when one of its items is refused', async () => {
    const storeId = await createStore();
    const item = createNewOrderItem();

    await expect(
      repository.create(storeId, createNewOrder(), [item, item]),
    ).rejects.toThrow(DuplicateRowError);
    expect(await readListedIds(storeId)).toEqual([]);
  });

  it('saves to the store it is given, whatever the rows say', async () => {
    const storeId = await createStore();
    const otherStoreId = await createStore();
    const strayOrder = { ...createNewOrder(), storeId: otherStoreId };
    const strayItem = { ...createNewOrderItem(), storeId: otherStoreId };

    const id = await repository.create(storeId, strayOrder, [strayItem]);

    const order = await repository.findById(storeId, id);
    expect(order?.items).toMatchObject([{ storeId, orderId: id }]);
    expect(await repository.findById(otherStoreId, id)).toBeUndefined();
  });

  it('leaves the product and variant empty, whatever the item says', async () => {
    const storeId = await createStore();
    const strayItem = {
      ...createNewOrderItem(),
      productId: MISSING_ID,
      variantId: MISSING_ID,
    };

    const id = await repository.create(storeId, createNewOrder(), [strayItem]);

    const order = await repository.findById(storeId, id);
    expect(order?.items).toMatchObject([{ productId: null, variantId: null }]);
  });

  it('updates only the columns it is given', async () => {
    const storeId = await createStore();
    const newOrder = createNewOrder();
    const id = await repository.create(storeId, newOrder, []);

    await repository.update(storeId, id, { financialStatus: 'refunded' });

    expect(await repository.findById(storeId, id)).toMatchObject({
      ...newOrder,
      financialStatus: 'refunded',
    });
  });

  it('leaves the items alone on update', async () => {
    const storeId = await createStore();
    const item = createNewOrderItem();
    const id = await createOrder(storeId, {}, [item]);

    await repository.update(storeId, id, { financialStatus: 'refunded' });

    const order = await repository.findById(storeId, id);
    expect(order?.items).toMatchObject([item]);
  });

  it('keeps an order in its store, whatever the changes say', async () => {
    const storeId = await createStore();
    const otherStoreId = await createStore();
    const id = await createOrder(storeId);
    const strayChanges = { financialStatus: 'refunded', storeId: otherStoreId };

    await repository.update(storeId, id, strayChanges);

    expect(await repository.findById(storeId, id)).toBeDefined();
    expect(await repository.findById(otherStoreId, id)).toBeUndefined();
  });

  it("refuses to update another store's order and leaves it alone", async () => {
    const storeId = await createStore();
    const newOrder = createNewOrder();
    const id = await repository.create(storeId, newOrder, []);

    await expect(
      repository.update(await createStore(), id, {
        financialStatus: 'refunded',
      }),
    ).rejects.toThrow(RowNotFoundError);
    expect(await repository.findById(storeId, id)).toMatchObject(newOrder);
  });

  it('throws RowNotFoundError when updating a missing order', async () => {
    await expect(
      repository.update(await createStore(), MISSING_ID, {
        financialStatus: 'refunded',
      }),
    ).rejects.toThrow(RowNotFoundError);
  });

  it('lists an empty store as an empty page', async () => {
    expect(await repository.list(await createStore())).toEqual({
      rows: [],
      nextCursor: null,
    });
  });

  it('lists the most recently placed first, whatever the save order', async () => {
    const storeId = await createStore();
    const latestId = await createOrder(storeId, { placedAt: NOON });
    const earliestId = await createOrder(storeId, {
      placedAt: AN_HOUR_BEFORE_NOON,
    });

    expect(await readListedIds(storeId)).toEqual([latestId, earliestId]);
  });

  it('lists only the orders of its store', async () => {
    const storeId = await createStore();
    await createOrder(await createStore());
    const id = await createOrder(storeId);

    expect(await readListedIds(storeId)).toEqual([id]);
  });

  it('leaves the items out of the list', async () => {
    const storeId = await createStore();
    await createOrder(storeId, {}, [createNewOrderItem()]);

    const { rows } = await repository.list(storeId);

    expect(rows[0]).not.toHaveProperty('items');
  });

  it('walks a long list without skipping or repeating an order', async () => {
    const storeId = await createStore();
    const ids = await createMany(2 * PAGE_SIZE + 3, (index) =>
      createOrder(storeId, {
        placedAt: new Date(NOON.getTime() - index * ONE_SECOND),
      }),
    );

    const pages = await readListedPages(storeId);

    expect(pages.map((rows) => rows.length)).toEqual([PAGE_SIZE, PAGE_SIZE, 3]);
    expect(pages.flat().map(({ id }) => id)).toEqual(ids);
  });

  it('walks orders placed at the exact same time', async () => {
    const storeId = await createStore();
    const ids = await createOrders(storeId, PAGE_SIZE + 3, { placedAt: NOON });

    const pages = await readListedPages(storeId);

    expect(pages.map((rows) => rows.length)).toEqual([PAGE_SIZE, 3]);
    expect(pages.flat().map(({ id }) => id)).toEqual([...ids].reverse());
  });

  it('filters by financial status', async () => {
    const storeId = await createStore();
    await createOrder(storeId, { financialStatus: 'pending' });
    const paidId = await createOrder(storeId, { financialStatus: 'paid' });

    expect(await readListedIds(storeId, { financialStatus: 'paid' })).toEqual([
      paidId,
    ]);
  });

  it('includes an order placed exactly at placedFrom', async () => {
    const storeId = await createStore();
    await createOrder(storeId, { placedAt: JUST_BEFORE_NOON });
    const id = await createOrder(storeId, { placedAt: NOON });

    expect(await readListedIds(storeId, { placedFrom: NOON })).toEqual([id]);
  });

  it('leaves out an order placed exactly at placedBefore', async () => {
    const storeId = await createStore();
    await createOrder(storeId, { placedAt: NOON });
    const id = await createOrder(storeId, { placedAt: JUST_BEFORE_NOON });

    expect(await readListedIds(storeId, { placedBefore: NOON })).toEqual([id]);
  });

  it('combines the filters', async () => {
    const storeId = await createStore();
    await createOrder(storeId, { placedAt: AN_HOUR_BEFORE_NOON });
    await createOrder(storeId, { placedAt: NOON });
    await createOrder(storeId, {
      placedAt: JUST_BEFORE_NOON,
      financialStatus: 'pending',
    });
    const id = await createOrder(storeId, { placedAt: JUST_BEFORE_NOON });

    expect(
      await readListedIds(storeId, {
        placedFrom: JUST_BEFORE_NOON,
        placedBefore: NOON,
        financialStatus: 'paid',
      }),
    ).toEqual([id]);
  });

  it('keeps the filters from page to page', async () => {
    const storeId = await createStore();
    const ids = await createOrders(storeId, PAGE_SIZE + 1, { placedAt: NOON });
    await createOrders(storeId, PAGE_SIZE, {
      placedAt: NOON,
      financialStatus: 'pending',
    });
    await createOrder(storeId, { placedAt: JUST_BEFORE_NOON });

    const pages = await readListedPages(storeId, {
      placedFrom: NOON,
      financialStatus: 'paid',
    });

    expect(pages.flat().map(({ id }) => id)).toEqual([...ids].reverse());
  });
});
