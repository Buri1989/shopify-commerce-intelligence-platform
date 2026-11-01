import type { App } from 'aws-cdk-lib';
import { AppStack, appStackId } from '../lib/app/app-stack.js';
import type { StageConfig } from '../lib/config/stage-config.js';
import { createTaskStackProps } from './create-task-stack-props.js';

export function createAppStack(
  app: App,
  config: StageConfig,
  imageTag: string,
): AppStack {
  return new AppStack(
    app,
    appStackId(config.stage),
    createTaskStackProps(app, config, imageTag),
  );
}
