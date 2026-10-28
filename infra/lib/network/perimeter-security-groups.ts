import * as ec2 from 'aws-cdk-lib/aws-ec2';
import type { Construct } from 'constructs';
import { HTTP_PORT, HTTPS_PORT, MYSQL_PORT } from './ports.js';

export type PerimeterSecurityGroups = {
  readonly alb: ec2.SecurityGroup;
  readonly app: ec2.SecurityGroup;
  readonly data: ec2.SecurityGroup;
};

export function createPerimeterSecurityGroups(
  scope: Construct,
  vpc: ec2.IVpc,
  applicationPort: number,
): PerimeterSecurityGroups {
  const alb = createEmptySecurityGroup(scope, 'AlbSecurityGroup', {
    vpc,
    description: 'Load balancer: HTTP and HTTPS from the internet',
  });
  const app = createEmptySecurityGroup(scope, 'AppSecurityGroup', {
    vpc,
    description: 'Application containers: traffic from the load balancer only',
  });
  const data = createEmptySecurityGroup(scope, 'DataSecurityGroup', {
    vpc,
    description: 'Database: MySQL from the application only',
  });

  alb.addIngressRule(
    ec2.Peer.anyIpv4(),
    ec2.Port.tcp(HTTP_PORT),
    'HTTP, redirected to HTTPS by the listener',
  );
  alb.addIngressRule(
    ec2.Peer.anyIpv4(),
    ec2.Port.tcp(HTTPS_PORT),
    'HTTPS from the internet',
  );
  alb.addEgressRule(
    app,
    ec2.Port.tcp(applicationPort),
    'Requests and health checks to the application',
  );

  app.addIngressRule(
    alb,
    ec2.Port.tcp(applicationPort),
    'Requests from the load balancer',
  );
  app.addEgressRule(
    ec2.Peer.anyIpv4(),
    ec2.Port.tcp(HTTPS_PORT),
    'Shopify and AWS APIs',
  );
  app.addEgressRule(data, ec2.Port.tcp(MYSQL_PORT), 'Database connections');

  data.addIngressRule(
    app,
    ec2.Port.tcp(MYSQL_PORT),
    'MySQL from the application',
  );

  return { alb, app, data };
}

function createEmptySecurityGroup(
  scope: Construct,
  id: string,
  props: { vpc: ec2.IVpc; description: string },
): ec2.SecurityGroup {
  return new ec2.SecurityGroup(scope, id, {
    ...props,
    allowAllOutbound: false,
  });
}
