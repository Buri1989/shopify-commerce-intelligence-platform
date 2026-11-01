import {
  createFakeConnection,
  type FakeConnection,
} from '../../test/fake-connection.js';
import {
  acquireMigrationLock,
  MigrationLockHeldError,
  releaseMigrationLock,
  resolveMigrationLockName,
} from './migration-lock.js';

const LOCK_NAME = 'migrations:commerce_intelligence';

describe('resolveMigrationLockName', () => {
  it('names the lock after the database, so two databases on one server never share it', () => {
    expect(resolveMigrationLockName('commerce_intelligence')).toBe(LOCK_NAME);
  });

  it('refuses a name longer than the 64 characters MySQL allows', () => {
    expect(() => resolveMigrationLockName('d'.repeat(60))).toThrow(
      'is 71 characters long; MySQL allows 64',
    );
  });
});

describe('acquireMigrationLock', () => {
  let connection: FakeConnection;

  beforeEach(() => {
    connection = createFakeConnection();
  });

  it('asks for the lock without waiting and continues when the server grants it', async () => {
    connection.query.mockResolvedValue([[{ acquired: 1 }], []]);

    await acquireMigrationLock(connection, LOCK_NAME);

    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.query).toHaveBeenCalledWith(
      'SELECT GET_LOCK(?, ?) AS acquired',
      [LOCK_NAME, 0],
    );
  });

  it('throws the held error when another connection holds the lock', async () => {
    connection.query.mockResolvedValue([[{ acquired: 0 }], []]);

    await expect(acquireMigrationLock(connection, LOCK_NAME)).rejects.toThrow(
      MigrationLockHeldError,
    );
  });

  it('throws the held error when the server answers NULL', async () => {
    connection.query.mockResolvedValue([[{ acquired: null }], []]);

    await expect(acquireMigrationLock(connection, LOCK_NAME)).rejects.toThrow(
      MigrationLockHeldError,
    );
  });
});

describe('releaseMigrationLock', () => {
  it('releases the lock by name', async () => {
    const connection = createFakeConnection();
    connection.query.mockResolvedValue([[{ released: 1 }], []]);

    await releaseMigrationLock(connection, LOCK_NAME);

    expect(connection.query).toHaveBeenCalledWith(
      'SELECT RELEASE_LOCK(?) AS released',
      [LOCK_NAME],
    );
  });
});
