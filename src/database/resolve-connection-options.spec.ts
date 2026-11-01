import { connectionSettings } from '../../test/database-settings.js';
import { resolveConnectionOptions } from './resolve-connection-options.js';

const caBundle = 'the PEM bundle';

describe('resolveConnectionOptions', () => {
  it('maps the settings onto one connection', () => {
    expect(
      resolveConnectionOptions(connectionSettings, () => caBundle),
    ).toEqual({
      host: 'db.internal',
      port: 3306,
      user: 'app',
      password: 'app',
      database: 'commerce_intelligence',
    });
  });

  it('verifies the server against the bundle at DB_SSL_CA_PATH', () => {
    const readCaBundle = vi.fn().mockReturnValue(caBundle);

    const options = resolveConnectionOptions(
      {
        ...connectionSettings,
        DB_SSL_CA_PATH: '/app/certs/eu-north-1-bundle.pem',
      },
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

    const options = resolveConnectionOptions(connectionSettings, readCaBundle);

    expect(readCaBundle).not.toHaveBeenCalled();
    expect(options).not.toHaveProperty('ssl');
  });
});
