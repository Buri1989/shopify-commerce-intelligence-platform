import { eq } from 'drizzle-orm';
import { DuplicateRowError } from '../src/common/errors/duplicate-row.error.js';
import { RowNotFoundError } from '../src/common/errors/row-not-found.error.js';
import { ShopifyUnavailableError } from '../src/common/errors/shopify-unavailable.error.js';
import { orders, products, stores } from '../src/database/schema/index.js';
import {
  type StoreCredentialsRefresher,
  StoresRepository,
} from '../src/stores/stores.repository.js';
import { readCredentialsRow } from './credentials-rows.js';
import {
  createInstallation,
  createNewCredentials,
  createNewStore,
  createReinstallation,
} from './new-rows.js';
import {
  createRepositoryDatabase,
  type RepositoryDatabase,
} from './repository-database.js';

const DATABASE_NAME = 'stores_repository_e2e';
const MISSING_STORE_ID = 999_999_999;
const UNINSTALLED_AT = new Date('2026-01-15T00:00:00.000Z');
const ACCESS_TOKEN_OVER_255_CHARACTERS = 'x'.repeat(256);
const DATA_TOO_LONG = 'ER_DATA_TOO_LONG';

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

  describe('installStore', () => {
    it('creates the store with its keys and says it was a first install', async () => {
      const installation = createInstallation();

      const saved = await repository.installStore(installation);

      expect(saved.reinstalled).toBe(false);
      expect(await repository.findById(saved.storeId)).toMatchObject({
        id: saved.storeId,
        ...installation.store,
        uninstalledAt: null,
      });
      expect(
        await readCredentialsRow(repositoryDatabase.database, saved.storeId),
      ).toMatchObject({ storeId: saved.storeId, ...installation.credentials });
    });

    it('reinstalls a known store under the same id: new details, new keys, uninstalled_at cleared', async () => {
      const first = createInstallation();
      const { storeId } = await repository.installStore(first);
      await repository.update(storeId, { uninstalledAt: UNINSTALLED_AT });
      const again = createReinstallation(first.store.shopifyId);

      const saved = await repository.installStore(again);

      expect(saved).toEqual({ storeId, reinstalled: true });
      expect(await repository.findById(storeId)).toMatchObject({
        ...again.store,
        uninstalledAt: null,
      });
      expect(
        await readCredentialsRow(repositoryDatabase.database, storeId),
      ).toMatchObject(again.credentials);
    });

    it('gives keys to a known store that has none', async () => {
      const newStore = createNewStore();
      const storeId = await repository.create(newStore);
      const again = createReinstallation(newStore.shopifyId);

      const saved = await repository.installStore(again);

      expect(saved).toEqual({ storeId, reinstalled: true });
      expect(
        await readCredentialsRow(repositoryDatabase.database, storeId),
      ).toMatchObject(again.credentials);
    });

    it('leaves every other store and its keys as they were', async () => {
      const other = createInstallation();
      const { storeId: otherId } = await repository.installStore(other);
      const first = createInstallation();
      await repository.installStore(first);

      await repository.installStore(
        createReinstallation(first.store.shopifyId),
      );

      expect(await repository.findById(otherId)).toMatchObject(other.store);
      expect(
        await readCredentialsRow(repositoryDatabase.database, otherId),
      ).toMatchObject(other.credentials);
    });

    it('leaves no store behind when the keys cannot be written', async () => {
      const { store, credentials } = createInstallation();

      await expect(
        repository.installStore({
          store,
          credentials: {
            ...credentials,
            accessToken: ACCESS_TOKEN_OVER_255_CHARACTERS,
          },
        }),
      ).rejects.toMatchObject({ cause: { code: DATA_TOO_LONG } });

      expect(
        await repositoryDatabase.database
          .select()
          .from(stores)
          .where(eq(stores.shopifyId, store.shopifyId)),
      ).toEqual([]);
    });

    it('refuses an install whose shop domain another store already uses', async () => {
      const taken = createInstallation();
      await repository.installStore(taken);
      const { store, credentials } = createInstallation();

      await expect(
        repository.installStore({
          store: { ...store, shopDomain: taken.store.shopDomain },
          credentials,
        }),
      ).rejects.toThrow(DuplicateRowError);
    });
  });

  describe('uninstallStore', () => {
    it('sets uninstalled_at and deletes the keys', async () => {
      const { storeId } = await repository.installStore(createInstallation());

      await repository.uninstallStore(storeId, UNINSTALLED_AT);

      expect(await repository.findById(storeId)).toMatchObject({
        uninstalledAt: UNINSTALLED_AT,
      });
      expect(
        await readCredentialsRow(repositoryDatabase.database, storeId),
      ).toBeUndefined();
    });

    it('marks a store that has no keys', async () => {
      const storeId = await repository.create(createNewStore());

      await repository.uninstallStore(storeId, UNINSTALLED_AT);

      expect(await repository.findById(storeId)).toMatchObject({
        uninstalledAt: UNINSTALLED_AT,
      });
    });

    it('accepts a second call for the same uninstall', async () => {
      const { storeId } = await repository.installStore(createInstallation());
      await repository.uninstallStore(storeId, UNINSTALLED_AT);

      await repository.uninstallStore(storeId, UNINSTALLED_AT);

      expect(await repository.findById(storeId)).toMatchObject({
        uninstalledAt: UNINSTALLED_AT,
      });
    });

    it('leaves every other store and its keys as they were', async () => {
      const other = createInstallation();
      const { storeId: otherId } = await repository.installStore(other);
      const { storeId } = await repository.installStore(createInstallation());

      await repository.uninstallStore(storeId, UNINSTALLED_AT);

      expect(await repository.findById(otherId)).toMatchObject({
        ...other.store,
        uninstalledAt: null,
      });
      expect(
        await readCredentialsRow(repositoryDatabase.database, otherId),
      ).toMatchObject(other.credentials);
    });

    it('throws RowNotFoundError for a missing store', async () => {
      await expect(
        repository.uninstallStore(MISSING_STORE_ID, UNINSTALLED_AT),
      ).rejects.toThrow(RowNotFoundError);
    });
  });

  describe('findStoreCredentials', () => {
    it('finds the keys of the store it is given, with its shop domain', async () => {
      await repository.installStore(createInstallation());
      const installation = createInstallation();
      const { storeId } = await repository.installStore(installation);

      expect(await repository.findStoreCredentials(storeId)).toEqual({
        storeId,
        ...installation.credentials,
        shopDomain: installation.store.shopDomain,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });
    });

    it('finds nothing for a store that has no keys', async () => {
      const storeId = await repository.create(createNewStore());

      expect(await repository.findStoreCredentials(storeId)).toBeUndefined();
    });

    it('finds nothing for a store that does not exist', async () => {
      expect(
        await repository.findStoreCredentials(MISSING_STORE_ID),
      ).toBeUndefined();
    });
  });

  describe('refreshStoreCredentials', () => {
    it('saves the keys the refresh returns and hands them back', async () => {
      const installation = createInstallation();
      const { storeId } = await repository.installStore(installation);
      const fresh = createNewCredentials();

      const credentials = await repository.refreshStoreCredentials(
        storeId,
        () => Promise.resolve(fresh),
      );

      expect(credentials).toMatchObject({
        storeId,
        ...fresh,
        shopDomain: installation.store.shopDomain,
      });
      expect(
        await readCredentialsRow(repositoryDatabase.database, storeId),
      ).toMatchObject(fresh);
    });

    it('hands the refresh the keys it locked, with the shop domain', async () => {
      const installation = createInstallation();
      const { storeId } = await repository.installStore(installation);
      const refresh = vi.fn<StoreCredentialsRefresher>(() =>
        Promise.resolve(undefined),
      );

      await repository.refreshStoreCredentials(storeId, refresh);

      expect(refresh).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          storeId,
          ...installation.credentials,
          shopDomain: installation.store.shopDomain,
        }),
      );
    });

    it('hands back the keys as they are when the refresh returns nothing', async () => {
      const installation = createInstallation();
      const { storeId } = await repository.installStore(installation);

      const credentials = await repository.refreshStoreCredentials(
        storeId,
        () => Promise.resolve(undefined),
      );

      expect(credentials).toMatchObject(installation.credentials);
      expect(
        await readCredentialsRow(repositoryDatabase.database, storeId),
      ).toMatchObject(installation.credentials);
    });

    it('returns nothing for a store that has no keys, without calling the refresh', async () => {
      const storeId = await repository.create(createNewStore());
      const refresh = vi.fn<StoreCredentialsRefresher>();

      expect(
        await repository.refreshStoreCredentials(storeId, refresh),
      ).toBeUndefined();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('makes a second refresh wait for the first and see the keys it saved', async () => {
      const installation = createInstallation();
      const { storeId } = await repository.installStore(installation);
      const fresh = createNewCredentials();
      const refresh = vi.fn<StoreCredentialsRefresher>((locked) =>
        Promise.resolve(
          locked.accessToken === installation.credentials.accessToken
            ? fresh
            : undefined,
        ),
      );

      const bothKeys = await Promise.all([
        repository.refreshStoreCredentials(storeId, refresh),
        repository.refreshStoreCredentials(storeId, refresh),
      ]);

      expect(refresh).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ accessToken: fresh.accessToken }),
      );
      expect(bothKeys).toEqual([
        expect.objectContaining(fresh),
        expect.objectContaining(fresh),
      ]);
    });

    it('leaves the keys as they were when the refresh throws', async () => {
      const installation = createInstallation();
      const { storeId } = await repository.installStore(installation);

      await expect(
        repository.refreshStoreCredentials(storeId, () =>
          Promise.reject(new ShopifyUnavailableError()),
        ),
      ).rejects.toThrow(ShopifyUnavailableError);

      expect(
        await readCredentialsRow(repositoryDatabase.database, storeId),
      ).toMatchObject(installation.credentials);
    });

    it("leaves every other store's keys as they were", async () => {
      const other = createInstallation();
      const { storeId: otherId } = await repository.installStore(other);
      const { storeId } = await repository.installStore(createInstallation());

      await repository.refreshStoreCredentials(storeId, () =>
        Promise.resolve(createNewCredentials()),
      );

      expect(
        await readCredentialsRow(repositoryDatabase.database, otherId),
      ).toMatchObject(other.credentials);
    });
  });

  describe('deleteStoreCredentials', () => {
    it('deletes the keys and leaves the store as it was', async () => {
      const installation = createInstallation();
      const { storeId } = await repository.installStore(installation);

      await repository.deleteStoreCredentials(
        storeId,
        installation.credentials.refreshToken,
      );

      expect(
        await readCredentialsRow(repositoryDatabase.database, storeId),
      ).toBeUndefined();
      expect(await repository.findById(storeId)).toMatchObject({
        ...installation.store,
        uninstalledAt: null,
      });
    });

    it("leaves another store's keys as they were, even with the same refresh token", async () => {
      const installation = createInstallation();
      const { storeId } = await repository.installStore(installation);
      const { refreshToken } = installation.credentials;
      const other = {
        store: createNewStore(),
        credentials: { ...createNewCredentials(), refreshToken },
      };
      const { storeId: otherId } = await repository.installStore(other);

      await repository.deleteStoreCredentials(storeId, refreshToken);

      expect(
        await readCredentialsRow(repositoryDatabase.database, otherId),
      ).toMatchObject(other.credentials);
    });

    it('leaves the keys alone when they hold a newer refresh token', async () => {
      const first = createInstallation();
      const { storeId } = await repository.installStore(first);
      const again = createReinstallation(first.store.shopifyId);
      await repository.installStore(again);

      await repository.deleteStoreCredentials(
        storeId,
        first.credentials.refreshToken,
      );

      expect(
        await readCredentialsRow(repositoryDatabase.database, storeId),
      ).toMatchObject(again.credentials);
    });

    it('accepts a store that has no keys', async () => {
      const storeId = await repository.create(createNewStore());

      await expect(
        repository.deleteStoreCredentials(storeId, 'refused-refresh-token'),
      ).resolves.toBeUndefined();
    });
  });
});
