import { Stack } from 'aws-cdk-lib';
import type * as ec2 from 'aws-cdk-lib/aws-ec2';
import type * as ecr from 'aws-cdk-lib/aws-ecr';
import type * as ecs from 'aws-cdk-lib/aws-ecs';
import type * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import type { Construct } from 'constructs';
import { PROJECT_NAME } from '../config/project-name.js';
import type { StageConfig } from '../config/stage-config.js';
import type { DatabaseConnection } from '../data/database-connection.js';
import { importImmutableSecurityGroup } from '../network/import-immutable-security-group.js';
import type { PerimeterSecurityGroups } from '../network/perimeter-security-groups.js';
import { applyProjectTags } from '../project-tags.js';
import {
  createApiCertificate,
  createApiRecord,
  importHostedZone,
} from './create-api-endpoint.js';
import { createAppLogGroup } from './create-app-log-group.js';
import { createAppOutputs } from './create-app-outputs.js';
import { createCluster } from './create-cluster.js';
import { createLoadBalancer } from './create-load-balancer.js';
import { createService } from './create-service.js';
import { createTaskDefinition } from './create-task-definition.js';

export type AppStackProps = {
  readonly config: StageConfig;
  readonly vpc: ec2.IVpc;
  readonly securityGroups: PerimeterSecurityGroups;
  readonly repository: ecr.IRepository;
  readonly database: DatabaseConnection;
  readonly imageTag: string;
};

export class AppStack extends Stack {
  readonly cluster: ecs.Cluster;
  readonly service: ecs.FargateService;
  readonly loadBalancer: elbv2.ApplicationLoadBalancer;

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, { env: { region: props.config.region } });
    const { config, repository, database, imageTag } = props;
    this.cluster = createCluster(this, props.vpc, config);
    const logGroup = createAppLogGroup(this, config);
    const taskDefinition = createTaskDefinition(this, {
      repository,
      imageTag,
      logGroup,
      database,
      config,
    });
    const hostedZone = importHostedZone(this, config);
    const certificate = createApiCertificate(this, hostedZone, config);
    const { loadBalancer, targetGroup } = createLoadBalancer(this, {
      vpc: props.vpc,
      securityGroup: importImmutableSecurityGroup(
        this,
        'AlbSecurityGroup',
        props.securityGroups.alb,
      ),
      certificate,
      config,
    });
    this.loadBalancer = loadBalancer;
    createApiRecord(this, hostedZone, loadBalancer, config);
    this.service = createService(this, {
      cluster: this.cluster,
      taskDefinition,
      securityGroup: importImmutableSecurityGroup(
        this,
        'AppSecurityGroup',
        props.securityGroups.app,
      ),
      targetGroup,
      config,
    });
    createAppOutputs(this, {
      loadBalancer,
      cluster: this.cluster,
      service: this.service,
      logGroup,
      config,
    });
    applyProjectTags(this, config.stage);
  }
}

export function appStackId(stage: string): string {
  return `${PROJECT_NAME}-${stage}-app`;
}
