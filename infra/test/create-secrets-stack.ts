import type { App } from 'aws-cdk-lib';
import type { StageConfig } from '../lib/config/stage-config.js';
import { SecretsStack, secretsStackId } from '../lib/secrets/secrets-stack.js';

export function createSecretsStack(
  app: App,
  config: StageConfig,
): SecretsStack {
  return new SecretsStack(app, secretsStackId(config.stage), { config });
}
