import { resolveStageConfig } from '../config/stage-config.js';
import { resolveAppContainerEnvironment } from './resolve-app-container-environment.js';

describe('resolveAppContainerEnvironment', () => {
  it('maps the stage onto the Shopify client id and the callback address', () => {
    expect(resolveAppContainerEnvironment(resolveStageConfig('dev'))).toEqual({
      SHOPIFY_CLIENT_ID: 'fdde7617c4e02a2d600cbf39087817fd',
      SHOPIFY_CALLBACK_URL:
        'https://api.commerce-intelligence.click/installation/callback',
    });
  });
});
