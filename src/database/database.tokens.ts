import type { MySql2Database } from 'drizzle-orm/mysql2';

// The mysql2 pool itself, for the few places that need one raw round trip,
// such as the readiness check. The module closes it on shutdown.
export const DATABASE_POOL = Symbol('DATABASE_POOL');

// Drizzle on top of that pool: the query layer every repository talks to.
export const DATABASE = Symbol('DATABASE');

export type Database = MySql2Database;
