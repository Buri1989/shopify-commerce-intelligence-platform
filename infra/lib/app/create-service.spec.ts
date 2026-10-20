import { Match, type Template } from 'aws-cdk-lib/assertions';
import { synthesizeAppStack } from '../../test/synthesize-app-stack.js';
import {
  findOnlyResourceId,
  matchStackOutput,
  readResourceProperties,
  type ResourceProperties,
} from '../../test/template-queries.js';
import { resolveStageConfig } from '../config/stage-config.js';

const NETWORK_STACK = 'commerce-intelligence-dev-network';

describe('createService', () => {
  let template: Template;
  let service: ResourceProperties;

  beforeAll(() => {
    template = synthesizeAppStack(resolveStageConfig('dev'), 'abc123');
    service = readResourceProperties(
      template,
      findOnlyResourceId(template, 'AWS::ECS::Service'),
    );
  });

  it('runs one copy of the task definition on Fargate in the stage cluster', () => {
    expect(service).toEqual(
      expect.objectContaining({
        LaunchType: 'FARGATE',
        DesiredCount: 1,
        Cluster: { Ref: findOnlyResourceId(template, 'AWS::ECS::Cluster') },
        TaskDefinition: {
          Ref: findOnlyResourceId(template, 'AWS::ECS::TaskDefinition'),
        },
      }),
    );
  });

  it('places tasks in the private subnets behind the app group with no public IP', () => {
    template.hasResourceProperties('AWS::ECS::Service', {
      NetworkConfiguration: {
        AwsvpcConfiguration: {
          AssignPublicIp: 'DISABLED',
          SecurityGroups: [matchStackOutput(NETWORK_STACK, 'AppSecurityGroup')],
          Subnets: [
            matchStackOutput(NETWORK_STACK, 'privateSubnet1'),
            matchStackOutput(NETWORK_STACK, 'privateSubnet2'),
          ],
        },
      },
    });
  });

  it('starts the new task before stopping the old one and rolls back a broken image', () => {
    expect(service.DeploymentConfiguration).toEqual({
      MinimumHealthyPercent: 100,
      MaximumPercent: 200,
      DeploymentCircuitBreaker: { Enable: true, Rollback: true },
    });
  });

  it('registers the container with the target group and gives a cold start a minute', () => {
    expect(service.HealthCheckGracePeriodSeconds).toBe(60);
    expect(service.LoadBalancers).toEqual([
      {
        ContainerName: 'app',
        ContainerPort: 3000,
        TargetGroupArn: {
          Ref: findOnlyResourceId(
            template,
            'AWS::ElasticLoadBalancingV2::TargetGroup',
          ),
        },
      },
    ]);
  });

  it('keeps shell access into the tasks off', () => {
    template.hasResourceProperties('AWS::ECS::Service', {
      EnableExecuteCommand: Match.absent(),
    });
  });
});
