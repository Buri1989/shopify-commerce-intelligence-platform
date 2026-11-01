import { defineConfig } from 'drizzle-kit';
import { MIGRATIONS_FOLDER } from './src/database/migrations-folder.js';

export default defineConfig({
  dialect: 'mysql',
  schema: './src/database/schema/index.ts',
  out: MIGRATIONS_FOLDER,
  breakpoints: true,
});
