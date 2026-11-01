import {
  createDatabaseConnection,
  DATABASE_SECRET_ARN,
} from '../../test/create-database-connection.js';
import { resolveContainerSecrets } from './resolve-container-secrets.js';

describe('resolveContainerSecrets', () => {
  it('points DB_USER and DB_PASSWORD at the two fields of the database secret', () => {
    const secrets = resolveContainerSecrets(createDatabaseConnection());

    expect(Object.keys(secrets)).toEqual(['DB_USER', 'DB_PASSWORD']);
    expect(secrets.DB_USER.arn).toBe(`${DATABASE_SECRET_ARN}:username::`);
    expect(secrets.DB_PASSWORD.arn).toBe(`${DATABASE_SECRET_ARN}:password::`);
  });
});
