import { Stack } from 'aws-cdk-lib';
import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import type { Construct } from 'constructs';
import { PROJECT_NAME } from '../config/project-name.js';
import type { StageConfig } from '../config/stage-config.js';
import { applyProjectTags } from '../project-tags.js';
import { createRejectFlowLog } from './create-flow-log.js';
import {
  createNatInstanceProvider,
  hardenNatInstances,
} from './create-nat-instance-provider.js';
import { createNetworkOutputs } from './create-network-outputs.js';
import { createVpc } from './create-vpc.js';
import {
  createPerimeterSecurityGroups,
  type PerimeterSecurityGroups,
} from './perimeter-security-groups.js';

export type NetworkStackProps = {
  readonly config: StageConfig;
};

export class NetworkStack extends Stack {
  readonly vpc: ec2.Vpc;
  readonly securityGroups: PerimeterSecurityGroups;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, {
      env: { region: props.config.region },
      // The app stack depends on this one through weak references, which
      // CloudFormation does not enforce; deleting it must take two steps.
      terminationProtection: true,
    });
    const { config } = props;
    const natProvider = createNatInstanceProvider(config);
    this.vpc = createVpc(this, config, natProvider);
    hardenNatInstances(natProvider, config);
    this.securityGroups = createPerimeterSecurityGroups(
      this,
      this.vpc,
      config.applicationPort,
    );
    createRejectFlowLog(this, this.vpc, {
      stage: config.stage,
      retentionDays: config.logRetentionDays,
    });
    createNetworkOutputs(this, this.vpc, this.securityGroups);
    applyProjectTags(this, config.stage);
  }
}

export function networkStackId(stage: string): string {
  return `${PROJECT_NAME}-${stage}-network`;
}
