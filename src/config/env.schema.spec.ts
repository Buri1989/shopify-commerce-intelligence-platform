import { validateEnv, validateMigrationEnv } from './env.schema.js';

const requiredDatabaseVariables = {
  DB_HOST: 'db.internal',
  DB_NAME: 'commerce_intelligence',
  DB_USER: 'app',
  DB_PASSWORD: 'app',
};

const requiredShopifyVariables = {
  SHOPIFY_CLIENT_ID: 'client-id',
  SHOPIFY_CALLBACK_URL: 'https://api.example.test/installation/callback',
  SHOPIFY_CLIENT_SECRET: 'client-secret',
  COOKIE_SECRET: 'cookie-secret',
};

const requiredAppVariables = {
  ...requiredDatabaseVariables,
  ...requiredShopifyVariables,
};

describe('validateEnv', () => {
  it('returns typed values for a valid environment', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      PORT: '8080',
      LOG_LEVEL: 'warn',
      ...requiredAppVariables,
      DB_PORT: '3307',
      DB_POOL_SIZE: '4',
      DB_SSL_CA_PATH: '/app/certs/eu-north-1-bundle.pem',
    });

    expect(env).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      LOG_LEVEL: 'warn',
      ...requiredAppVariables,
      DB_PORT: 3307,
      DB_POOL_SIZE: 4,
      DB_SSL_CA_PATH: '/app/certs/eu-north-1-bundle.pem',
    });
  });

  it('applies defaults when the optional variables are absent', () => {
    expect(validateEnv(requiredAppVariables)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      ...requiredAppVariables,
      DB_PORT: 3306,
      DB_POOL_SIZE: 10,
    });
  });

  it('ignores variables that are not in the schema', () => {
    expect(
      validateEnv({ ...requiredAppVariables, HOME: '/tmp' }),
    ).not.toHaveProperty('HOME');
  });

  it.each(Object.keys(requiredAppVariables))(
    'rejects a missing %s and names it in the error',
    (name) => {
      expect(() =>
        validateEnv({ ...requiredAppVariables, [name]: undefined }),
      ).toThrow(name);
    },
  );

  it.each([
    ['PORT', 'abc'],
    ['PORT', '0'],
    ['PORT', '70000'],
    ['PORT', '3000.5'],
    ['LOG_LEVEL', 'loud'],
    ['NODE_ENV', 'staging'],
    ['DB_HOST', ''],
    ['DB_PORT', 'abc'],
    ['DB_PORT', '0'],
    ['DB_POOL_SIZE', '0'],
    ['DB_POOL_SIZE', '2.5'],
    ['DB_SSL_CA_PATH', ''],
    ['SHOPIFY_CLIENT_ID', ''],
    ['SHOPIFY_CALLBACK_URL', 'not-a-url'],
    ['SHOPIFY_CLIENT_SECRET', ''],
    ['COOKIE_SECRET', ''],
  ])('rejects an invalid %s and names it in the error', (name, value) => {
    expect(() =>
      validateEnv({ ...requiredAppVariables, [name]: value }),
    ).toThrow(name);
  });

  it('lists every invalid variable in one error message', () => {
    expect(() =>
      validateEnv({
        ...requiredAppVariables,
        PORT: 'abc',
        LOG_LEVEL: 'loud',
      }),
    ).toThrow(/PORT[\s\S]*LOG_LEVEL/);
  });
});

describe('validateMigrationEnv', () => {
  it('starts without the Shopify settings, which the migration never uses', () => {
    expect(validateMigrationEnv(requiredDatabaseVariables)).toEqual({
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      ...requiredDatabaseVariables,
      DB_PORT: 3306,
      DB_POOL_SIZE: 10,
    });
  });

  it('leaves the Shopify settings out of what it returns', () => {
    expect(validateMigrationEnv(requiredAppVariables)).toEqual(
      validateMigrationEnv(requiredDatabaseVariables),
    );
  });

  it.each(Object.keys(requiredDatabaseVariables))(
    'rejects a missing %s and names it in the error',
    (name) => {
      expect(() =>
        validateMigrationEnv({
          ...requiredDatabaseVariables,
          [name]: undefined,
        }),
      ).toThrow(name);
    },
  );
});
