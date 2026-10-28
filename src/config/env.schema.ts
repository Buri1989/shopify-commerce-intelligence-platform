import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_POOL_SIZE: z.coerce.number().int().min(1).default(10),
  // Unset locally and in the tests, where the server has no certificate the app
  // could verify; set by the task definition against RDS (design §4.5).
  DB_SSL_CA_PATH: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  const lines = result.error.issues.map(
    (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
  );
  throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
}
