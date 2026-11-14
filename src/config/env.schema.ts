import { z } from 'zod';

const migrationEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
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

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  ...migrationEnvSchema.shape,
  SHOPIFY_CLIENT_ID: z.string().min(1),
  SHOPIFY_CALLBACK_URL: z.url(),
  SHOPIFY_CLIENT_SECRET: z.string().min(1),
  COOKIE_SECRET: z.string().min(1),
});

export type MigrationEnv = z.infer<typeof migrationEnvSchema>;
export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  return parseEnv(envSchema, raw);
}

export function validateMigrationEnv(
  raw: Record<string, unknown>,
): MigrationEnv {
  return parseEnv(migrationEnvSchema, raw);
}

function parseEnv<Schema extends z.ZodType>(
  schema: Schema,
  raw: Record<string, unknown>,
): z.infer<Schema> {
  const result = schema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  const lines = result.error.issues.map(
    (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
  );
  throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
}
