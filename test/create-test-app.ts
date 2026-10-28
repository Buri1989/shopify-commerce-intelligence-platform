import type { INestApplication, InjectionToken, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

export type ProviderOverride = {
  readonly provide: InjectionToken;
  readonly useValue: unknown;
};

// Overrides swap a boundary such as the database pool for a test double, the
// way the spec that owns the case decides; the module graph stays the real one.
export async function createTestApp(
  testControllers: Type[] = [],
  providerOverrides: ProviderOverride[] = [],
): Promise<INestApplication<App>> {
  const builder = Test.createTestingModule({
    imports: [AppModule],
    controllers: testControllers,
  });
  for (const { provide, useValue } of providerOverrides) {
    builder.overrideProvider(provide).useValue(useValue);
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<INestApplication<App>>();
  configureApp(app);
  await app.init();
  return app;
}
