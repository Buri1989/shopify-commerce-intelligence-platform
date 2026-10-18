import { Stack } from 'aws-cdk-lib';
import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import type { Construct } from 'constructs';
import { PROJECT_NAME } from '../config/project-name.js';
import type { StageConfig } from '../config/stage-config.js';
import { applyProjectTags } from '../project-tags.js';
import { createRejectFlowLog } from './create-flow-log.js';
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
    super(scope, id, { env: { region: props.config.region } });
    const { config } = props;
    this.vpc = createVpc(this, config);
    this.securityGroups = createPerimeterSecurityGroups(
      this,
      this.vpc,
      config.applicationPort,
    );
    createRejectFlowLog(this, this.vpc, {
      stage: config.stage,
      retentionDays: config.flowLogRetentionDays,
    });
    createNetworkOutputs(this, this.vpc, this.securityGroups);
    applyProjectTags(this, config.stage);
  }
}

export function networkStackId(stage: string): string {
  return `${PROJECT_NAME}-${stage}-network`;
}
