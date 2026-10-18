import type { Template } from 'aws-cdk-lib/assertions';
import { synthesizeOnMinimalVpc } from '../../test/synthesize-on-minimal-vpc.js';
import {
  findInboundRules,
  findOnlyResourceId,
  findOutboundRules,
  securityGroupIdAttribute,
} from '../../test/template-queries.js';
import { createPerimeterSecurityGroups } from './perimeter-security-groups.js';

const APPLICATION_PORT = 3000;
const MYSQL_PORT = 3306;
const tcpFromOrToAnyIpv4 = { CidrIp: '0.0.0.0/0', IpProtocol: 'tcp' };

describe('createPerimeterSecurityGroups', () => {
  let template: Template;

  beforeAll(() => {
    template = synthesizeOnMinimalVpc((stack, vpc) =>
      createPerimeterSecurityGroups(stack, vpc, APPLICATION_PORT),
    );
  });

  it('creates three groups in the VPC', () => {
    template.resourceCountIs('AWS::EC2::SecurityGroup', 3);
    template.allResourcesProperties('AWS::EC2::SecurityGroup', {
      VpcId: { Ref: findOnlyResourceId(template, 'AWS::EC2::VPC') },
    });
  });

  it('alb accepts HTTP and HTTPS from anywhere and nothing else', () => {
    expect(findInboundRules(template, 'AlbSecurityGroup')).toEqual([
      expect.objectContaining({
        ...tcpFromOrToAnyIpv4,
        FromPort: 80,
        ToPort: 80,
      }),
      expect.objectContaining({
        ...tcpFromOrToAnyIpv4,
        FromPort: 443,
        ToPort: 443,
      }),
    ]);
  });

  it('alb reaches only the application port on the app group', () => {
    expect(findOutboundRules(template, 'AlbSecurityGroup')).toEqual([
      expect.objectContaining({
        DestinationSecurityGroupId: securityGroupIdAttribute(
          template,
          'AppSecurityGroup',
        ),
        IpProtocol: 'tcp',
        FromPort: APPLICATION_PORT,
        ToPort: APPLICATION_PORT,
      }),
    ]);
  });

  it('app accepts only the application port from the load balancer', () => {
    expect(findInboundRules(template, 'AppSecurityGroup')).toEqual([
      expect.objectContaining({
        SourceSecurityGroupId: securityGroupIdAttribute(
          template,
          'AlbSecurityGroup',
        ),
        IpProtocol: 'tcp',
        FromPort: APPLICATION_PORT,
        ToPort: APPLICATION_PORT,
      }),
    ]);
  });

  it('app reaches HTTPS anywhere and MySQL on the data group, nothing else', () => {
    const outboundRules = findOutboundRules(template, 'AppSecurityGroup');
    expect(outboundRules).toHaveLength(2);
    expect(outboundRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ...tcpFromOrToAnyIpv4,
          FromPort: 443,
          ToPort: 443,
        }),
        expect.objectContaining({
          DestinationSecurityGroupId: securityGroupIdAttribute(
            template,
            'DataSecurityGroup',
          ),
          IpProtocol: 'tcp',
          FromPort: MYSQL_PORT,
          ToPort: MYSQL_PORT,
        }),
      ]),
    );
  });

  it('data accepts only MySQL from the application', () => {
    expect(findInboundRules(template, 'DataSecurityGroup')).toEqual([
      expect.objectContaining({
        SourceSecurityGroupId: securityGroupIdAttribute(
          template,
          'AppSecurityGroup',
        ),
        IpProtocol: 'tcp',
        FromPort: MYSQL_PORT,
        ToPort: MYSQL_PORT,
      }),
    ]);
  });

  it('data initiates nothing', () => {
    // CDK's stand-in for "no outbound at all": an unroutable ICMP rule that keeps
    // CloudFormation from falling back to its default allow-all egress.
    expect(findOutboundRules(template, 'DataSecurityGroup')).toEqual([
      expect.objectContaining({
        CidrIp: '255.255.255.255/32',
        IpProtocol: 'icmp',
      }),
    ]);
  });

  it('uses the application port it is given', () => {
    const otherPortTemplate = synthesizeOnMinimalVpc((stack, vpc) =>
      createPerimeterSecurityGroups(stack, vpc, 8080),
    );
    expect(findInboundRules(otherPortTemplate, 'AppSecurityGroup')).toEqual([
      expect.objectContaining({ FromPort: 8080, ToPort: 8080 }),
    ]);
  });
});
