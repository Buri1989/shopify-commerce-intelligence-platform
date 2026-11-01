import type { Connection } from 'mysql2/promise';

export type QueryConnection = Pick<Connection, 'query'>;
