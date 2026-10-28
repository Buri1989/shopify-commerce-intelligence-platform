import { MySqlContainer } from '@testcontainers/mysql';
import type { TestProject } from 'vitest/node';

export type TestDatabase = {
  readonly host: string;
  readonly port: number;
  readonly name: string;
  readonly user: string;
  readonly password: string;
};

declare module 'vitest' {
  export interface ProvidedContext {
    database: TestDatabase;
  }
}

// One fresh, empty MySQL 8.4 per run, started by the suite itself, so the same
// `npm run test:e2e` works on a laptop and on the GitHub runner (design §4.9).
// The returned function is the teardown; vitest runs it when the run ends.
export async function setup(
  project: TestProject,
): Promise<() => Promise<void>> {
  const container = await new MySqlContainer(MYSQL_IMAGE)
    .withDatabase(DATABASE_NAME)
    .withUsername(USERNAME)
    .withUserPassword(PASSWORD)
    .start();
  project.provide('database', {
    host: container.getHost(),
    port: container.getPort(),
    name: container.getDatabase(),
    user: container.getUsername(),
    password: container.getUserPassword(),
  });
  return async () => {
    await container.stop();
  };
}

const MYSQL_IMAGE = 'mysql:8.4';
// Dev-only values, the same as .env.example: they open a throwaway database
// that lives for one test run.
const DATABASE_NAME = 'commerce_intelligence';
const USERNAME = 'app';
const PASSWORD = 'app';
