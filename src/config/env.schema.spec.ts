import { validateEnv } from './env.schema.js';

describe('validateEnv', () => {
  it('returns typed values for a valid environment', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      PORT: '8080',
      LOG_LEVEL: 'warn',
    });

    expect(env).toEqual({
      NODE_ENV: 'production',
      PORT: 8080,
      LOG_LEVEL: 'warn',
    });
  });

  it('applies defaults when variables are absent', () => {
    expect(validateEnv({})).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
    });
  });

  it('ignores variables that are not in the schema', () => {
    expect(validateEnv({ HOME: '/tmp' })).not.toHaveProperty('HOME');
  });

  it.each([
    ['PORT', 'abc'],
    ['PORT', '0'],
    ['PORT', '70000'],
    ['PORT', '3000.5'],
    ['LOG_LEVEL', 'loud'],
    ['NODE_ENV', 'staging'],
  ])('rejects an invalid %s and names it in the error', (name, value) => {
    expect(() => validateEnv({ [name]: value })).toThrow(name);
  });

  it('lists every invalid variable in one error message', () => {
    expect(() => validateEnv({ PORT: 'abc', LOG_LEVEL: 'loud' })).toThrow(
      /PORT[\s\S]*LOG_LEVEL/,
    );
  });
});
