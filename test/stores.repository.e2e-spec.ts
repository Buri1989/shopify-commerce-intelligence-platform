import { eq } from 'drizzle-orm';
import { DuplicateRowError } from '../src/common/errors/duplicate-row.error.js';
import { RowNotFoundError } from '../src/common/errors/row-not-found.error.js';
import { orders, products } from '../src/database/schema/index.js';
import { StoresRepository } from '../src/stores/stores.repository.js';
import { createNewStore } from './new-rows.js';
import {
  createRepositoryDatabase,
  type RepositoryDatabase,
} from './repository-database.js';

const DATABASE_NAME = 'stores_repository_e2e';
const MISSING_STORE_ID = 999_999_999;

describe('StoresRepository (e2e)', () => {
  let repositoryDatabase: RepositoryDatabase;
  let repository: StoresRepository;

  beforeAll(async () => {
    repositoryDatabase = await createRepositoryDatabase(DATABASE_NAME);
    repository = new StoresRepository(repositoryDatabase.database);
  });

  afterAll(async () => {
    await repositoryDatabase.close();
  });

  it('finds the store it created', async () => {
    const newStore = createNewStore();

    const id = await repository.create(newStore);

    expect(await repository.findById(id)).toMatchObject({ id, ...newStore });
  });

  it('finds nothing for a store that does not exist', async () => {
    expect(await repository.findById(MISSING_STORE_ID)).toBeUndefined();
  });

  it('refuses a second store with the same Shopify id', async () => {
    const { shopifyId } = createNewStore();
    await repository.create({ ...createNewStore(), shopifyId });

    await expect(
      repository.create({ ...createNewStore(), shopifyId }),
    ).rejects.toThrow(DuplicateRowError);
  });

  it('refuses a second store with the same shop domain', async () => {
    const { shopDomain } = createNewStore();
    await repository.create({ ...createNewStore(), shopDomain });

    await expect(
      repository.create({ ...createNewStore(), shopDomain }),
    ).rejects.toThrow(DuplicateRowError);
  });

  it('updates only the columns it is given', async () => {
    const newStore = createNewStore();
    const id = await repository.create(newStore);

    await repository.update(id, { name: 'Renamed' });

    expect(await repository.findById(id)).toMatchObject({
      ...newStore,
      name: 'Renamed',
    });
  });

  it('leaves every other store as it was on update', async () => {
    const otherStore = createNewStore();
    const otherId = await repository.create(otherStore);
    const id = await repository.create(createNewStore());

    await repository.update(id, { name: 'Renamed' });

    expect(await repository.findById(otherId)).toMatchObject(otherStore);
  });

  it('accepts an update that sets the same values', async () => {
    const newStore = createNewStore();
    const id = await repository.create(newStore);

    await expect(
      repository.update(id, { name: newStore.name }),
    ).resolves.toBeUndefined();
  });

  it('refuses a shop domain another store already uses', async () => {
    const { shopDomain } = createNewStore();
    await repository.create({ ...createNewStore(), shopDomain });
    const id = await repository.create(createNewStore());

    await expect(repository.update(id, { shopDomain })).rejects.toThrow(
      DuplicateRowError,
    );
  });

  it('throws RowNotFoundError when updating a missing store', async () => {
    await expect(
      repository.update(MISSING_STORE_ID, { name: 'Renamed' }),
    ).rejects.toThrow(RowNotFoundError);
  });

  it('deletes only the store it is given', async () => {
    const otherId = await repository.create(createNewStore());
    const id = await repository.create(createNewStore());

    await repository.delete(id);

    expect(await repository.findById(id)).toBeUndefined();
    expect(await repository.findById(otherId)).toBeDefined();
  });

  it('removes the products and orders of a deleted store', async () => {
    const { database } = repositoryDatabase;
    const storeId = await repository.create(createNewStore());
    await database.insert(products).values({
      storeId,
      shopifyId: 1,
      title: 'Shirt',
      handle: 'shirt',
      status: 'active',
    });
    await database.insert(orders).values({
      storeId,
      shopifyId: 1,
      name: '#1',
      currency: 'EUR',
      totalPrice: '10.0000',
      financialStatus: 'paid',
      placedAt: new Date('2026-01-01T00:00:00.000Z'),
      placedOn: '2026-01-01',
    });

    await repository.delete(storeId);

    expect(
      await database
        .select()
        .from(products)
        .where(eq(products.storeId, storeId)),
    ).toEqual([]);
    expect(
      await database.select().from(orders).where(eq(orders.storeId, storeId)),
    ).toEqual([]);
  });

  it('throws RowNotFoundError when deleting a missing store', async () => {
    await expect(repository.delete(MISSING_STORE_ID)).rejects.toThrow(
      RowNotFoundError,
    );
  });
});
