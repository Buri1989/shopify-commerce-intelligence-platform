import { resolvePoolOptions } from './resolve-pool-options.js';

const settings = {
  DB_HOST: 'db.internal',
  DB_PORT: 3306,
  DB_NAME: 'commerce_intelligence',
  DB_USER: 'app',
  DB_PASSWORD: 'app',
  DB_POOL_SIZE: 10,
  DB_SSL_CA_PATH: undefined,
};
const caBundle = 'the PEM bundle';

describe('resolvePoolOptions', () => {
  it('maps the settings onto the pool', () => {
    expect(resolvePoolOptions(settings, () => caBundle)).toEqual({
      host: 'db.internal',
      port: 3306,
      user: 'app',
      password: 'app',
      database: 'commerce_intelligence',
      connectionLimit: 10,
    });
  });

  it('verifies the server against the bundle at DB_SSL_CA_PATH', () => {
    const readCaBundle = vi.fn().mockReturnValue(caBundle);

    const options = resolvePoolOptions(
      { ...settings, DB_SSL_CA_PATH: '/app/certs/eu-north-1-bundle.pem' },
      readCaBundle,
    );

    expect(readCaBundle).toHaveBeenCalledTimes(1);
    expect(readCaBundle).toHaveBeenCalledWith(
      '/app/certs/eu-north-1-bundle.pem',
    );
    expect(options.ssl).toEqual({ ca: caBundle, rejectUnauthorized: true });
  });

  it('connects without TLS and reads nothing when no bundle is named', () => {
    const readCaBundle = vi.fn();

    const options = resolvePoolOptions(settings, readCaBundle);

    expect(readCaBundle).not.toHaveBeenCalled();
    expect(options).not.toHaveProperty('ssl');
  });
});
