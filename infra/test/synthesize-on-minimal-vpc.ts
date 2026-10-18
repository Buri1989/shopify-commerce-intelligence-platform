import { App, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

type AddToStack = (stack: Stack, vpc: ec2.Vpc) => void;

// The smallest VPC a construct under test can attach to: one zone, one subnet, no NAT.
export function synthesizeOnMinimalVpc(addToStack: AddToStack): Template {
  const stack = new Stack(new App());
  const vpc = new ec2.Vpc(stack, 'Vpc', {
    maxAzs: 1,
    natGateways: 0,
    subnetConfiguration: [
      { name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    ],
  });
  addToStack(stack, vpc);
  return Template.fromStack(stack);
}
