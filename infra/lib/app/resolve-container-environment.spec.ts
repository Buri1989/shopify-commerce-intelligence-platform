import { createDatabaseConnection } from '../../test/create-database-connection.js';
import { resolveStageConfig } from '../config/stage-config.js';
import { resolveContainerEnvironment } from './resolve-container-environment.js';

describe('resolveContainerEnvironment', () => {
  it('maps the stage and the connection onto the validated variables and nothing else', () => {
    expect(
      resolveContainerEnvironment(
        resolveStageConfig('dev'),
        createDatabaseConnection(),
      ),
    ).toEqual({
      NODE_ENV: 'production',
      PORT: '3000',
      LOG_LEVEL: 'info',
      DB_HOST: 'db.internal',
      DB_PORT: '3306',
      DB_NAME: 'commerce_intelligence',
      DB_POOL_SIZE: '10',
      DB_SSL_CA_PATH: '/app/certs/eu-north-1-bundle.pem',
    });
  });
});
