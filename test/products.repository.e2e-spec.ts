import { DuplicateRowError } from '../src/common/errors/duplicate-row.error.js';
import { RowNotFoundError } from '../src/common/errors/row-not-found.error.js';
import { PAGE_SIZE } from '../src/database/page.js';
import {
  ProductsRepository,
  type ProductCursor,
} from '../src/products/products.repository.js';
import { StoresRepository } from '../src/stores/stores.repository.js';
import { createMany, createNewProduct, createNewStore } from './new-rows.js';
import { readAllPages } from './read-all-pages.js';
import {
  createRepositoryDatabase,
  type RepositoryDatabase,
} from './repository-database.js';

const DATABASE_NAME = 'products_repository_e2e';
const MISSING_PRODUCT_ID = 999_999_999;

let repositoryDatabase: RepositoryDatabase;
let stores: StoresRepository;
let repository: ProductsRepository;

function createStore(): Promise<number> {
  return stores.create(createNewStore());
}

function createProduct(storeId: number, status = 'active'): Promise<number> {
  return repository.create(storeId, { ...createNewProduct(), status });
}

function createProducts(
  storeId: number,
  count: number,
  status = 'active',
): Promise<number[]> {
  return createMany(count, () => createProduct(storeId, status));
}

async function readListedIds(storeId: number): Promise<number[]> {
  const { rows } = await repository.list(storeId);
  return rows.map(({ id }) => id);
}

describe('ProductsRepository (e2e)', () => {
  beforeAll(async () => {
    repositoryDatabase = await createRepositoryDatabase(DATABASE_NAME);
    stores = new StoresRepository(repositoryDatabase.database);
    repository = new ProductsRepository(repositoryDatabase.database);
  });

  afterAll(async () => {
    await repositoryDatabase.close();
  });

  it('finds the product it created', async () => {
    const storeId = await createStore();
    const newProduct = createNewProduct();

    const id = await repository.create(storeId, newProduct);

    expect(await repository.findById(storeId, id)).toMatchObject({
      id,
      storeId,
      ...newProduct,
    });
  });

  it('finds nothing for a missing product', async () => {
    const storeId = await createStore();

    expect(
      await repository.findById(storeId, MISSING_PRODUCT_ID),
    ).toBeUndefined();
  });

  it("finds nothing for another store's product", async () => {
    const id = await createProduct(await createStore());

    expect(await repository.findById(await createStore(), id)).toBeUndefined();
  });

  it('refuses the same Shopify id twice in one store', async () => {
    const storeId = await createStore();
    const newProduct = createNewProduct();
    await repository.create(storeId, newProduct);

    await expect(repository.create(storeId, newProduct)).rejects.toThrow(
      DuplicateRowError,
    );
  });

  it('accepts the same Shopify id in two stores', async () => {
    const newProduct = createNewProduct();
    await repository.create(await createStore(), newProduct);

    await expect(
      repository.create(await createStore(), newProduct),
    ).resolves.toBeTypeOf('number');
  });

  it('saves to the store it is given, whatever the row says', async () => {
    const storeId = await createStore();
    const otherStoreId = await createStore();
    const strayProduct = { ...createNewProduct(), storeId: otherStoreId };

    const id = await repository.create(storeId, strayProduct);

    expect(await repository.findById(storeId, id)).toBeDefined();
    expect(await repository.findById(otherStoreId, id)).toBeUndefined();
  });

  it('updates only the columns it is given', async () => {
    const storeId = await createStore();
    const newProduct = createNewProduct();
    const id = await repository.create(storeId, newProduct);

    await repository.update(storeId, id, { title: 'Renamed' });

    expect(await repository.findById(storeId, id)).toMatchObject({
      ...newProduct,
      title: 'Renamed',
    });
  });

  it('keeps a product in its store, whatever the changes say', async () => {
    const storeId = await createStore();
    const otherStoreId = await createStore();
    const id = await createProduct(storeId);
    const strayChanges = { title: 'Renamed', storeId: otherStoreId };

    await repository.update(storeId, id, strayChanges);

    expect(await repository.findById(storeId, id)).toBeDefined();
    expect(await repository.findById(otherStoreId, id)).toBeUndefined();
  });

  it("refuses to update another store's product and leaves it alone", async () => {
    const storeId = await createStore();
    const newProduct = createNewProduct();
    const id = await repository.create(storeId, newProduct);

    await expect(
      repository.update(await createStore(), id, { title: 'Renamed' }),
    ).rejects.toThrow(RowNotFoundError);
    expect(await repository.findById(storeId, id)).toMatchObject(newProduct);
  });

  it('throws RowNotFoundError when updating a missing product', async () => {
    await expect(
      repository.update(await createStore(), MISSING_PRODUCT_ID, {
        title: 'Renamed',
      }),
    ).rejects.toThrow(RowNotFoundError);
  });

  it('keeps a deleted product reachable by id', async () => {
    const storeId = await createStore();
    const id = await createProduct(storeId);

    await repository.markDeleted(storeId, id);

    const product = await repository.findById(storeId, id);
    expect(product?.deletedAt).toBeInstanceOf(Date);
  });

  it('hides a deleted product from the list', async () => {
    const storeId = await createStore();
    const [deletedId, keptId] = await createProducts(storeId, 2);

    await repository.markDeleted(storeId, deletedId);

    expect(await readListedIds(storeId)).toEqual([keptId]);
  });

  it("refuses to delete another store's product and leaves it alone", async () => {
    const storeId = await createStore();
    const id = await createProduct(storeId);

    await expect(
      repository.markDeleted(await createStore(), id),
    ).rejects.toThrow(RowNotFoundError);
    expect(await readListedIds(storeId)).toEqual([id]);
  });

  it('lists an empty store as an empty page', async () => {
    expect(await repository.list(await createStore())).toEqual({
      rows: [],
      nextCursor: null,
    });
  });

  it('lists newest first', async () => {
    const storeId = await createStore();
    const [oldestId, newestId] = await createProducts(storeId, 2);

    expect(await readListedIds(storeId)).toEqual([newestId, oldestId]);
  });

  it('lists only the products of its store', async () => {
    const storeId = await createStore();
    await createProduct(await createStore());
    const id = await createProduct(storeId);

    expect(await readListedIds(storeId)).toEqual([id]);
  });

  it('walks a long list without skipping or repeating a product', async () => {
    const storeId = await createStore();
    const ids = await createProducts(storeId, 2 * PAGE_SIZE + 3);

    const pages = await readAllPages((cursor: ProductCursor | null) =>
      repository.list(storeId, {}, cursor),
    );

    expect(pages.map((rows) => rows.length)).toEqual([PAGE_SIZE, PAGE_SIZE, 3]);
    expect(pages.flat().map(({ id }) => id)).toEqual([...ids].reverse());
  });

  it('filters by status', async () => {
    const storeId = await createStore();
    await createProduct(storeId, 'draft');
    const activeId = await createProduct(storeId, 'active');

    const { rows } = await repository.list(storeId, { status: 'active' });

    expect(rows.map(({ id }) => id)).toEqual([activeId]);
  });

  it('keeps the status filter from page to page', async () => {
    const storeId = await createStore();
    const draftIds = await createProducts(storeId, PAGE_SIZE + 1, 'draft');
    await createProducts(storeId, PAGE_SIZE, 'active');

    const pages = await readAllPages((cursor: ProductCursor | null) =>
      repository.list(storeId, { status: 'draft' }, cursor),
    );

    expect(pages.flat().map(({ id }) => id)).toEqual([...draftIds].reverse());
  });
});
