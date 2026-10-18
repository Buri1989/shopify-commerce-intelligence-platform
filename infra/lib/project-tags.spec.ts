import { Match } from 'aws-cdk-lib/assertions';
import { synthesizeOnMinimalVpc } from '../test/synthesize-on-minimal-vpc.js';
import { applyProjectTags } from './project-tags.js';

describe('applyProjectTags', () => {
  it('tags every resource under the scope with project, stage and managed-by', () => {
    const template = synthesizeOnMinimalVpc((stack) =>
      applyProjectTags(stack, 'dev'),
    );
    for (const resourceType of [
      'AWS::EC2::VPC',
      'AWS::EC2::Subnet',
      'AWS::EC2::RouteTable',
    ]) {
      template.allResourcesProperties(resourceType, {
        Tags: Match.arrayWith([
          { Key: 'managed-by', Value: 'cdk' },
          { Key: 'project', Value: 'commerce-intelligence' },
          { Key: 'stage', Value: 'dev' },
        ]),
      });
    }
  });
});
