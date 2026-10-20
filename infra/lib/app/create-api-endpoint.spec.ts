import { Match, type Template } from 'aws-cdk-lib/assertions';
import { synthesizeAppStack } from '../../test/synthesize-app-stack.js';
import { findOnlyResourceId } from '../../test/template-queries.js';
import { resolveStageConfig } from '../config/stage-config.js';

describe('createApiCertificate', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeAppStack(resolveStageConfig('dev'), 'abc123');
  });

  it('requests one certificate for the API name only', () => {
    template.resourceCountIs('AWS::CertificateManager::Certificate', 1);
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'api.commerce-intelligence.click',
      SubjectAlternativeNames: Match.absent(),
    });
  });

  it('proves ownership through the hosted zone with no manual step', () => {
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      ValidationMethod: 'DNS',
      DomainValidationOptions: [
        {
          DomainName: 'api.commerce-intelligence.click',
          HostedZoneId: 'Z03536663804YHQ8G2EL1',
        },
      ],
    });
    template.resourceCountIs('AWS::Lambda::Function', 0);
  });
});

describe('createApiRecord', () => {
  let template: Template;
  let loadBalancerId: string;

  beforeAll(() => {
    template = synthesizeAppStack(resolveStageConfig('dev'), 'abc123');
    loadBalancerId = findOnlyResourceId(
      template,
      'AWS::ElasticLoadBalancingV2::LoadBalancer',
    );
  });

  it('points the API name at the load balancer inside the hosted zone', () => {
    template.resourceCountIs('AWS::Route53::RecordSet', 1);
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'api.commerce-intelligence.click.',
      Type: 'A',
      HostedZoneId: 'Z03536663804YHQ8G2EL1',
      AliasTarget: {
        DNSName: {
          'Fn::Join': [
            '',
            ['dualstack.', { 'Fn::GetAtt': [loadBalancerId, 'DNSName'] }],
          ],
        },
        HostedZoneId: {
          'Fn::GetAtt': [loadBalancerId, 'CanonicalHostedZoneID'],
        },
      },
    });
  });
});
