import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import type { StageConfig } from '../lib/config/stage-config.js';
import { NetworkStack, networkStackId } from '../lib/network/network-stack.js';

export function synthesizeNetworkStack(config: StageConfig): Template {
  const app = new App();
  const stack = new NetworkStack(app, networkStackId(config.stage), { config });
  return Template.fromStack(stack);
}
