import {
  createFakeConnection,
  type FakeConnection,
} from '../../test/fake-connection.js';
import { countAppliedMigrations } from './count-applied-migrations.js';

describe('countAppliedMigrations', () => {
  let connection: FakeConnection;

  beforeEach(() => {
    connection = createFakeConnection();
  });

  it('is zero before the first run, when the table does not exist yet', async () => {
    connection.query.mockResolvedValueOnce([[], []]);

    await expect(countAppliedMigrations(connection)).resolves.toBe(0);
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.query).toHaveBeenCalledWith(
      'SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
      ['__drizzle_migrations'],
    );
  });

  it('counts the recorded files once the table exists', async () => {
    connection.query
      .mockResolvedValueOnce([[{ 1: 1 }], []])
      .mockResolvedValueOnce([[{ applied: 5 }], []]);

    await expect(countAppliedMigrations(connection)).resolves.toBe(5);
    expect(connection.query).toHaveBeenLastCalledWith(
      'SELECT COUNT(*) AS applied FROM __drizzle_migrations',
    );
  });
});
