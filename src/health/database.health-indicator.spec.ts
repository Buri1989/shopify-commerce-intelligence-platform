import { HealthIndicatorService } from '@nestjs/terminus';
import type { Pool } from 'mysql2/promise';
import { DatabaseHealthIndicator } from './database.health-indicator.js';

function createFakePool() {
  return { query: vi.fn() };
}

describe('DatabaseHealthIndicator', () => {
  let pool: ReturnType<typeof createFakePool>;
  let indicator: DatabaseHealthIndicator;

  beforeEach(() => {
    pool = createFakePool();
    indicator = new DatabaseHealthIndicator(
      new HealthIndicatorService(),
      pool as unknown as Pool,
    );
  });

  it('reports up after one round trip through the pool', async () => {
    pool.query.mockResolvedValue([[], []]);

    await expect(indicator.isHealthy()).resolves.toEqual({
      database: { status: 'up', responseTime: expect.any(Number) },
    });
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenCalledWith('SELECT 1');
  });

  it("reports down with the failure's message when the query fails", async () => {
    pool.query.mockRejectedValue(
      new Error('connect ECONNREFUSED 10.0.64.10:3306'),
    );

    await expect(indicator.isHealthy()).resolves.toEqual({
      database: {
        status: 'down',
        message: 'connect ECONNREFUSED 10.0.64.10:3306',
        responseTime: expect.any(Number),
      },
    });
  });
});
