import {
  generateMySQLDrizzleJson,
  generateMySQLMigration,
} from 'drizzle-kit/api';
import { readLatestSnapshot } from '../../test/migration-journal.js';
import { MIGRATIONS_FOLDER } from './migrations-folder.js';
import * as schema from './schema/index.js';

describe('the migrations against the table files', () => {
  let missingStatements: string[];

  beforeAll(async () => {
    const latestSnapshot = readLatestSnapshot(MIGRATIONS_FOLDER);
    const currentSchema = await generateMySQLDrizzleJson(schema);
    missingStatements = await generateMySQLMigration(
      latestSnapshot,
      currentSchema,
    );
  });

  it('has a migration for every table change', () => {
    expect(
      missingStatements,
      'a table file changed without a migration: run `npm run migrate:generate -- --name <name>`',
    ).toEqual([]);
  });
});
