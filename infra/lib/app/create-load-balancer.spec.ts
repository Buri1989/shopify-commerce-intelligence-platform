import { Match, type Template } from 'aws-cdk-lib/assertions';
import { synthesizeAppStack } from '../../test/synthesize-app-stack.js';
import {
  findOnlyResourceId,
  matchStackOutput,
} from '../../test/template-queries.js';
import { resolveStageConfig } from '../config/stage-config.js';

const NETWORK_STACK = 'commerce-intelligence-dev-network';

describe('createLoadBalancer', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeAppStack(resolveStageConfig('dev'), 'abc123');
  });

  it('faces the internet from the public subnets behind the alb group', () => {
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
    template.hasResourceProperties(
      'AWS::ElasticLoadBalancingV2::LoadBalancer',
      {
        Type: 'application',
        Scheme: 'internet-facing',
        SecurityGroups: [matchStackOutput(NETWORK_STACK, 'AlbSecurityGroup')],
        Subnets: [
          matchStackOutput(NETWORK_STACK, 'publicSubnet1'),
          matchStackOutput(NETWORK_STACK, 'publicSubnet2'),
        ],
      },
    );
  });

  it('can be deleted in dev and drops invalid headers', () => {
    template.hasResourceProperties(
      'AWS::ElasticLoadBalancingV2::LoadBalancer',
      {
        LoadBalancerAttributes: Match.arrayWith([
          { Key: 'deletion_protection.enabled', Value: 'false' },
          {
            Key: 'routing.http.drop_invalid_header_fields.enabled',
            Value: 'true',
          },
        ]),
      },
    );
  });

  it('answers HTTP only with a permanent redirect to HTTPS', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      Port: 80,
      Protocol: 'HTTP',
      DefaultActions: [
        {
          Type: 'redirect',
          RedirectConfig: {
            Protocol: 'HTTPS',
            Port: '443',
            StatusCode: 'HTTP_301',
          },
        },
      ],
    });
  });

  it('serves HTTPS with the API certificate and forwards to the target group', () => {
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 2);
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      Port: 443,
      Protocol: 'HTTPS',
      SslPolicy: 'ELBSecurityPolicy-TLS13-1-2-PQ-2025-09',
      Certificates: [
        {
          CertificateArn: {
            Ref: findOnlyResourceId(
              template,
              'AWS::CertificateManager::Certificate',
            ),
          },
        },
      ],
      DefaultActions: [
        {
          Type: 'forward',
          TargetGroupArn: {
            Ref: findOnlyResourceId(
              template,
              'AWS::ElasticLoadBalancingV2::TargetGroup',
            ),
          },
        },
      ],
    });
  });

  it('checks readiness on the application port and drains within 30 seconds', () => {
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      TargetType: 'ip',
      Protocol: 'HTTP',
      Port: 3000,
      HealthCheckPath: '/ready',
      HealthCheckIntervalSeconds: 15,
      HealthCheckTimeoutSeconds: 5,
      HealthyThresholdCount: 2,
      UnhealthyThresholdCount: 3,
      TargetGroupAttributes: Match.arrayWith([
        { Key: 'deregistration_delay.timeout_seconds', Value: '30' },
      ]),
      VpcId: matchStackOutput(NETWORK_STACK, 'Vpc'),
    });
  });

  it('adds no security group and no rule to the perimeter groups', () => {
    template.resourceCountIs('AWS::EC2::SecurityGroup', 0);
    template.resourceCountIs('AWS::EC2::SecurityGroupIngress', 0);
    template.resourceCountIs('AWS::EC2::SecurityGroupEgress', 0);
  });
});
