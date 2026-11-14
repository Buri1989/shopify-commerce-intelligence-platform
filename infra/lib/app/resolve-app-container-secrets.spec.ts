import {
  COOKIE_SECRET_ARN,
  importAppSecrets,
  SHOPIFY_CLIENT_SECRET_ARN,
} from '../../test/import-app-secrets.js';
import { resolveAppContainerSecrets } from './resolve-app-container-secrets.js';

describe('resolveAppContainerSecrets', () => {
  it('points SHOPIFY_CLIENT_SECRET and COOKIE_SECRET at the two app secrets', () => {
    const secrets = resolveAppContainerSecrets(importAppSecrets());

    expect(Object.keys(secrets)).toEqual([
      'SHOPIFY_CLIENT_SECRET',
      'COOKIE_SECRET',
    ]);
    expect(secrets.SHOPIFY_CLIENT_SECRET.arn).toBe(SHOPIFY_CLIENT_SECRET_ARN);
    expect(secrets.COOKIE_SECRET.arn).toBe(COOKIE_SECRET_ARN);
  });
});
