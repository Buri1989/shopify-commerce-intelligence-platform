import type { Template } from 'aws-cdk-lib/assertions';
import { synthesizeOnMinimalVpc } from '../../test/synthesize-on-minimal-vpc.js';
import { findOnlyResourceId } from '../../test/template-queries.js';
import { createRejectFlowLog } from './create-flow-log.js';

describe('createRejectFlowLog', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeOnMinimalVpc((stack, vpc) =>
      createRejectFlowLog(stack, vpc, { stage: 'dev', retentionDays: 14 }),
    );
  });

  it('logs rejected traffic of the VPC to CloudWatch Logs within a minute', () => {
    template.resourceCountIs('AWS::EC2::FlowLog', 1);
    template.hasResourceProperties('AWS::EC2::FlowLog', {
      ResourceType: 'VPC',
      ResourceId: { Ref: findOnlyResourceId(template, 'AWS::EC2::VPC') },
      TrafficType: 'REJECT',
      LogDestinationType: 'cloud-watch-logs',
      LogGroupName: {
        Ref: findOnlyResourceId(template, 'AWS::Logs::LogGroup'),
      },
      MaxAggregationInterval: 60,
    });
  });

  it('names the log group after the stage and keeps it for the configured days', () => {
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/commerce-intelligence/dev/vpc-flow-logs',
      RetentionInDays: 14,
    });
  });

  it('deletes the log group together with the stack', () => {
    template.hasResource('AWS::Logs::LogGroup', {
      DeletionPolicy: 'Delete',
      UpdateReplacePolicy: 'Delete',
    });
  });

  it('delivers through a role only the flow logs service can assume', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: { Service: 'vpc-flow-logs.amazonaws.com' },
          },
        ],
      },
    });
  });
});
