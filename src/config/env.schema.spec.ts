import { validateEnv } from './env.schema.js';

// The four variables with no default; every valid environment below starts from them.
const requiredDatabaseVariables = {
  DB_HOST: 'db.internal',
  DB_NAME: 'commerce_intelligence',
  DB_USER: 'app',
  DB_PASSWORD: 'app',
};

describe('validateEnv', () => {
  it('returns typed values for a valid environment', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      PORT: '8080',
      LOG_LEVEL: 'warn',
      ...requiredDatabaseVariables,
      DB_PORT: '3307',
      DB_POOL_SIZE: '4',
      DB_SSL_CA_PATH: '/app/certs/eu-north-1-bundle.pem',
    });

    expect(env).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      LOG_LEVEL: 'warn',
      ...requiredDatabaseVariables,
      DB_PORT: 3307,
      DB_POOL_SIZE: 4,
      DB_SSL_CA_PATH: '/app/certs/eu-north-1-bundle.pem',
    });
  });

  it('applies defaults when the optional variables are absent', () => {
    expect(validateEnv(requiredDatabaseVariables)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      ...requiredDatabaseVariables,
      DB_PORT: 3306,
      DB_POOL_SIZE: 10,
    });
  });

  it('ignores variables that are not in the schema', () => {
    expect(
      validateEnv({ ...requiredDatabaseVariables, HOME: '/tmp' }),
    ).not.toHaveProperty('HOME');
  });

  it.each(['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'])(
    'rejects a missing %s and names it in the error',
    (name) => {
      expect(() =>
        validateEnv({ ...requiredDatabaseVariables, [name]: undefined }),
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
  ])('rejects an invalid %s and names it in the error', (name, value) => {
    expect(() =>
      validateEnv({ ...requiredDatabaseVariables, [name]: value }),
    ).toThrow(name);
  });

  it('lists every invalid variable in one error message', () => {
    expect(() =>
      validateEnv({
        ...requiredDatabaseVariables,
        PORT: 'abc',
        LOG_LEVEL: 'loud',
      }),
    ).toThrow(/PORT[\s\S]*LOG_LEVEL/);
  });
});
