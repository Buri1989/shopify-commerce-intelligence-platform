import { DatabaseModule } from './database.module.js';

describe('DatabaseModule', () => {
  it('closes the pool when the application shuts down', async () => {
    const pool = { end: vi.fn().mockResolvedValue(undefined) };

    await new DatabaseModule(pool).onApplicationShutdown();

    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});
