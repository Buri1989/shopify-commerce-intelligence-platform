import { DefaultStackSynthesizer, Stack } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

export type BootstrapRoleKind = 'deploy' | 'file-publishing' | 'lookup';

export function formatBootstrapRoleArn(
  scope: Construct,
  kind: BootstrapRoleKind,
): string {
  const stack = Stack.of(scope);
  return stack.formatArn({
    service: 'iam',
    region: '',
    resource: 'role',
    resourceName: `cdk-${DefaultStackSynthesizer.DEFAULT_QUALIFIER}-${kind}-role-${stack.account}-${stack.region}`,
  });
}
