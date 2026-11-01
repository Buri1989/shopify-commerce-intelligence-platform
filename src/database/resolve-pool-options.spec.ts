import { databaseSettings } from '../../test/database-settings.js';
import { resolvePoolOptions } from './resolve-pool-options.js';

describe('resolvePoolOptions', () => {
  it('maps the settings onto the pool: the connection options and the size', () => {
    expect(
      resolvePoolOptions(databaseSettings, () => 'the PEM bundle'),
    ).toEqual({
      host: 'db.internal',
      port: 3306,
      user: 'app',
      password: 'app',
      database: 'commerce_intelligence',
      connectionLimit: 10,
    });
  });
});
