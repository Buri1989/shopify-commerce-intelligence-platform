import { type Mock, vi } from 'vitest';
import type { QueryConnection } from '../src/database/query-connection.js';

export type FakeConnection = QueryConnection & { query: Mock };

export function createFakeConnection(): FakeConnection {
  return { query: vi.fn() } as unknown as FakeConnection;
}
